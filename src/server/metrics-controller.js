const { databasePath } = require("./database");
const { ensureIndicators } = require("./draw-controller");
const { sendJson } = require("./http");
const { clampInt } = require("./utils");
const { summarizeIndicators } = require("./metrics");

async function handleMetrics(reqUrl, res) {
  const limit = clampInt(reqUrl.searchParams.get("limit"), 240, 30, 1000);
  const { indicators } = await ensureIndicators(limit);

  sendJson(res, 200, {
    ok: true,
    database: { type: "postgresql", url: databasePath() },
    series: indicators,
    summary: summarizeIndicators(indicators)
  });
}

module.exports = {
  handleMetrics
};
