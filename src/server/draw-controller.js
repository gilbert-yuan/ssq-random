const { sendJson } = require("./http");
const { clampInt } = require("./utils");
const { computeIndicators } = require("./metrics");
const { databasePath, readDraws, readIndicatorIssues, upsertDraws, upsertIndicators } = require("./database");
const { fetch500HistoryDraws, fetchOfficialDraws, loadFallbackDraws } = require("./draw-sources");

function persistDrawBatch(draws, contextLimit) {
  if (draws.length) upsertDraws(draws);
  const stored = readDraws(Math.max(240, contextLimit));
  if (stored.length) {
    const fresh = computeIndicators(stored, { skip: readIndicatorIssues() });
    if (fresh.length) upsertIndicators(fresh);
  }
  return readDraws(contextLimit);
}

async function ensureStoredDraws(limit = 240) {
  const stored = readDraws(limit);
  if (stored.length) return stored;
  const fallback = await loadFallbackDraws();
  return persistDrawBatch(fallback.draws, limit);
}

async function loadDraws(limit, refresh = false) {
  try {
    const data = await fetchOfficialDraws(limit, refresh);
    const draws = persistDrawBatch(data.draws, limit);
    return { ...data, draws, sqlite: { path: databasePath(), stored: draws.length } };
  } catch (error) {
    try {
      const fallback = await fetch500HistoryDraws(limit, refresh);
      const draws = persistDrawBatch(fallback.draws, limit);
      return {
        ...fallback,
        draws,
        officialError: error.message,
        sqlite: { path: databasePath(), stored: draws.length }
      };
    } catch (fallbackError) {
      const stored = readDraws(limit);
      if (stored.length) {
        persistDrawBatch(stored, limit);
        return {
          source: "sqlite",
          sourceUrl: databasePath(),
          fetchedAt: new Date().toISOString(),
          warning: "外部数据源不可用，已使用 SQLite 本地历史库。",
          error: error.message,
          fallbackError: fallbackError.message,
          draws: stored,
          sqlite: { path: databasePath(), stored: stored.length }
        };
      }

      const sample = await loadFallbackDraws();
      const draws = persistDrawBatch(sample.draws, limit);
      return {
        ...sample,
        draws,
        error: error.message,
        fallbackError: fallbackError.message,
        sqlite: { path: databasePath(), stored: draws.length }
      };
    }
  }
}

async function handleDraws(reqUrl, res) {
  const limit = clampInt(reqUrl.searchParams.get("limit"), 180, 30, 1000);
  const refresh = reqUrl.searchParams.get("refresh") === "1";
  const payload = await loadDraws(limit, refresh);
  sendJson(res, 200, payload);
}

module.exports = {
  ensureStoredDraws,
  handleDraws,
  loadDraws,
  persistDrawBatch
};
