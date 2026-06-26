const { clearSessionCookie, isMiniProgramRequest, loginUser, makeSessionCookie, registerUser, resolveRequestUser, revokeSession } = require("./auth");
const { rateLimited } = require("./errors");
const { readJsonBody, sendJson } = require("./http");

const AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 10;
const authAttempts = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function checkAuthRateLimit(ip) {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now - entry.firstAt > AUTH_RATE_LIMIT_WINDOW_MS) {
    authAttempts.set(ip, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count > AUTH_RATE_LIMIT_MAX) {
    throw rateLimited("too many auth attempts, please try again later");
  }
}

function authPayload(user, extra = {}) {
  return {
    ok: true,
    authenticated: Boolean(user),
    user: user || null,
    ...extra
  };
}

function sessionHeaders(req, sessionToken) {
  return isMiniProgramRequest(req) || !sessionToken ? {} : { "Set-Cookie": makeSessionCookie(sessionToken) };
}

function normalizeSessionResponse(req, result) {
  return {
    payload: authPayload(result.user, {
      sessionToken: isMiniProgramRequest(req) ? result.sessionToken : "",
      expiresAt: result.expiresAt || ""
    }),
    headers: sessionHeaders(req, result.sessionToken)
  };
}

async function handleAuth(req, reqUrl, res) {
  if (reqUrl.pathname === "/api/auth/me") {
    const authState = await resolveRequestUser(req);
    sendJson(res, 200, authPayload(authState.user));
    return;
  }

  if (reqUrl.pathname === "/api/auth/register") {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method not allowed" });
      return;
    }
    checkAuthRateLimit(getClientIp(req));
    const payload = await readJsonBody(req);
    const result = await registerUser(payload, isMiniProgramRequest(req, payload) ? "miniprogram" : "web");
    const response = normalizeSessionResponse(req, result);
    sendJson(res, 200, response.payload, response.headers);
    return;
  }

  if (reqUrl.pathname === "/api/auth/login") {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method not allowed" });
      return;
    }
    checkAuthRateLimit(getClientIp(req));
    const payload = await readJsonBody(req);
    const result = await loginUser(payload, isMiniProgramRequest(req, payload) ? "miniprogram" : "web");
    const response = normalizeSessionResponse(req, result);
    sendJson(res, 200, response.payload, response.headers);
    return;
  }

  if (reqUrl.pathname === "/api/auth/logout") {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method not allowed" });
      return;
    }
    const authState = await resolveRequestUser(req);
    if (authState.sessionToken) await revokeSession(authState.sessionToken);
    const headers = isMiniProgramRequest(req) ? {} : { "Set-Cookie": clearSessionCookie() };
    sendJson(res, 200, authPayload(null), headers);
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" });
}

module.exports = {
  handleAuth
};
