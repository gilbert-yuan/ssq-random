const { clearSessionCookie, isMiniProgramRequest, loginUser, makeSessionCookie, registerUser, resolveRequestUser, revokeSession } = require("./auth");
const { readJsonBody, sendJson } = require("./http");

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
