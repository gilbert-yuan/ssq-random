const { databasePath, readDraws, readIndicatorIssues, readIndicators, upsertIndicators } = require("./database");
const { ensureStoredDraws } = require("./draw-controller");
const { sendJson } = require("./http");
const { clampInt } = require("./utils");
const { computeIndicators, summarizeIndicators } = require("./metrics");

async function handleMetrics(reqUrl, res) {
  const limit = clampInt(reqUrl.searchParams.get("limit"), 240, 30, 1000);
  await ensureStoredDraws(limit);

  const draws = await readDraws(Math.max(240, limit));
  const fresh = computeIndicators(draws, { skip: await readIndicatorIssues() });
  if (fresh.length) await upsertIndicators(fresh);
  const indicators = await readIndicators(limit);

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
