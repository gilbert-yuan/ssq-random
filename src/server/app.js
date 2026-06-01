const http = require("node:http");
const { URL } = require("node:url");
const { handleCommunity } = require("./community-controller");
const { handleCompleteTicket } = require("./completion-controller");
const { handleDraws } = require("./draw-controller");
const { handleMetrics } = require("./metrics-controller");
const { handleRecords } = require("./records-controller");
const { sendJson } = require("./http");
const { serveStatic } = require("./static-controller");

function createApp() {
  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try {
      if (reqUrl.pathname === "/api/health") {
        sendJson(res, 200, { ok: true, time: new Date().toISOString() });
        return;
      }
      if (reqUrl.pathname === "/api/draws") {
        await handleDraws(reqUrl, res);
        return;
      }
      if (reqUrl.pathname === "/api/metrics") {
        await handleMetrics(reqUrl, res);
        return;
      }
      if (reqUrl.pathname === "/api/community") {
        await handleCommunity(reqUrl, res);
        return;
      }
      if (reqUrl.pathname === "/api/records") {
        await handleRecords(req, reqUrl, res);
        return;
      }
      if (reqUrl.pathname === "/api/complete-ticket") {
        await handleCompleteTicket(req, res);
        return;
      }
      await serveStatic(reqUrl, res);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });
}

module.exports = {
  createApp
};
