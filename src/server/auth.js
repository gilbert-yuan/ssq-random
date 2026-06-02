const crypto = require("node:crypto");
const { SESSION_COOKIE_NAME, SESSION_TTL_DAYS } = require("./config");
const { query, withClient } = require("./database");

const USERNAME_RE = /^[\p{Letter}\p{Number}_-]{3,24}$/u;

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
    lastLoginAt:
      row.last_login_at instanceof Date ? row.last_login_at.toISOString() : row.last_login_at ? String(row.last_login_at) : ""
  };
}

function validateCredentials(payload, { requireDisplayName = false } = {}) {
  const username = String(payload?.username || "").trim();
  const usernameNorm = normalizeUsername(username);
  const password = String(payload?.password || "");
  const displayName = String(payload?.displayName || "").trim();

  if (!USERNAME_RE.test(username)) {
    const error = new Error("username must be 3-24 chars using letters, numbers, _ or -");
    error.statusCode = 400;
    throw error;
  }
  if (usernameNorm.length < 3 || usernameNorm.length > 24) {
    const error = new Error("username is invalid");
    error.statusCode = 400;
    throw error;
  }
  if (password.length < 6 || password.length > 72) {
    const error = new Error("password must be 6-72 chars");
    error.statusCode = 400;
    throw error;
  }
  if (requireDisplayName && !displayName) {
    const error = new Error("display name is required");
    error.statusCode = 400;
    throw error;
  }

  return {
    username,
    usernameNorm,
    password,
    displayName: displayName || username
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const source = Buffer.from(hash, "hex");
  if (source.length !== derived.length) return false;
  return crypto.timingSafeEqual(source, derived);
}

function parseCookies(headerValue) {
  return String(headerValue || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const [name, ...rest] = item.split("=");
      acc[name] = decodeURIComponent(rest.join("="));
      return acc;
    }, {});
}

function extractSessionToken(req) {
  const headerToken = String(req.headers["x-session-token"] || "").trim();
  if (headerToken) return headerToken;
  const cookies = parseCookies(req.headers.cookie);
  return String(cookies[SESSION_COOKIE_NAME] || "").trim();
}

function isMiniProgramRequest(req, payload = null) {
  return String(req.headers["x-client-type"] || payload?.clientType || "").toLowerCase() === "miniprogram";
}

function sessionTimestamps() {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  return {
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

function makeSessionCookie(token) {
  const maxAge = Math.max(1, Math.floor(SESSION_TTL_DAYS * 24 * 60 * 60));
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function createSession(client, userId, clientType = "web") {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const { createdAt, expiresAt } = sessionTimestamps();
  const sessionId = crypto.randomUUID();

  await client.query(
    `
      INSERT INTO sessions (id, user_id, token_hash, client_type, created_at, expires_at, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $5)
    `,
    [sessionId, userId, tokenHash, clientType, createdAt, expiresAt]
  );

  return {
    sessionId,
    sessionToken: token,
    expiresAt
  };
}

async function registerUser(payload, clientType = "web") {
  const { username, usernameNorm, password, displayName } = validateCredentials(payload, { requireDisplayName: false });
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const now = new Date().toISOString();
      const userId = crypto.randomUUID();
      const userResult = await client.query(
        `
          INSERT INTO users (id, username, username_norm, password_hash, display_name, created_at, last_login_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6)
          RETURNING *
        `,
        [userId, username, usernameNorm, hashPassword(password), displayName, now]
      );
      const session = await createSession(client, userId, clientType);
      await client.query("COMMIT");
      return {
        user: sanitizeUser(userResult.rows[0]),
        ...session
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        const conflict = new Error("username already exists");
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }
  });
}

async function loginUser(payload, clientType = "web") {
  const { usernameNorm, password } = validateCredentials(payload, { requireDisplayName: false });
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const userResult = await client.query("SELECT * FROM users WHERE username_norm = $1", [usernameNorm]);
      const row = userResult.rows[0];
      if (!row || !verifyPassword(password, row.password_hash)) {
        const error = new Error("invalid username or password");
        error.statusCode = 401;
        throw error;
      }
      const now = new Date().toISOString();
      await client.query("UPDATE users SET last_login_at = $1 WHERE id = $2", [now, row.id]);
      row.last_login_at = now;
      const session = await createSession(client, row.id, clientType);
      await client.query("COMMIT");
      return {
        user: sanitizeUser(row),
        ...session
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function readSessionByToken(token) {
  if (!token) return null;
  const result = await query(
    `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.expires_at,
        u.*
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [hashToken(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  await query("UPDATE sessions SET last_seen_at = NOW() WHERE id = $1", [row.session_id]);
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at || ""),
    user: sanitizeUser(row)
  };
}

async function revokeSession(token) {
  if (!token) return 0;
  const result = await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  return result.rowCount || 0;
}

async function resolveRequestUser(req) {
  if (req.authState) return req.authState;
  const sessionToken = extractSessionToken(req);
  if (!sessionToken) {
    req.authState = { authenticated: false, sessionToken: "", user: null };
    return req.authState;
  }
  const session = await readSessionByToken(sessionToken);
  req.authState = {
    authenticated: Boolean(session?.user),
    sessionToken,
    user: session?.user || null
  };
  return req.authState;
}

module.exports = {
  clearSessionCookie,
  extractSessionToken,
  isMiniProgramRequest,
  loginUser,
  makeSessionCookie,
  registerUser,
  resolveRequestUser,
  revokeSession
};
