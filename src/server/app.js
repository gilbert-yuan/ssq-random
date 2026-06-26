const http = require("http");
const { URL } = require("url");
const { handleAuth } = require("./auth-controller");
const { handleCommunity } = require("./community-controller");
const { handleCompleteTicket } = require("./completion-controller");
const { handleDraws } = require("./draw-controller");
const { handleMetrics } = require("./metrics-controller");
const { handleMobileHome, handleMobilePicks } = require("./mobile-controller");
const { handleRecords } = require("./records-controller");
const { sendJson } = require("./http");
const { serveStatic } = require("./static-controller");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function handleHealth(req, reqUrl, res) {
  sendJson(res, 200, { ok: true, time: new Date().toISOString() });
}

const exactRoutes = {
  "/api/health": handleHealth,
  "/api/draws": (req, reqUrl, res) => handleDraws(reqUrl, res),
  "/api/metrics": (req, reqUrl, res) => handleMetrics(reqUrl, res),
  "/api/mobile/home": handleMobileHome,
  "/api/mobile/picks": handleMobilePicks,
  "/api/community": handleCommunity,
  "/api/records": handleRecords,
  "/api/complete-ticket": (req, reqUrl, res) => handleCompleteTicket(req, res)
};

const prefixRoutes = [
  { prefix: "/api/auth/", handler: handleAuth }
];

function createApp() {
  return http.createServer(async (req, res) => {
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try {
      const exactHandler = exactRoutes[reqUrl.pathname];
      if (exactHandler) {
        await exactHandler(req, reqUrl, res);
        return;
      }

      for (const { prefix, handler } of prefixRoutes) {
        if (reqUrl.pathname.startsWith(prefix)) {
          await handler(req, reqUrl, res);
          return;
        }
      }

      if (reqUrl.pathname.startsWith("/api/")) {
        sendJson(res, 404, { ok: false, error: "not found", code: "NOT_FOUND" });
        return;
      }

      await serveStatic(req, reqUrl, res);
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        ok: false,
        error: error.message,
        code: error.code || "INTERNAL_ERROR"
      });
    }
  });
}

module.exports = {
  createApp
};
