const { resolveRequestUser } = require("./auth");
const { readRecords } = require("./database");
const { ensureStoredDraws } = require("./draw-controller");
const { sendJson } = require("./http");
const { getDrawShape, makeNumberStats } = require("./metrics");
const { annotateRecords, buildJackpotAnnouncements, buildRecordSummary } = require("./record-results");
const { clampInt } = require("./utils");

function average(values, digits = 0) {
  if (!values.length) return digits ? Number((0).toFixed(digits)) : 0;
  const total = values.reduce((sum, value) => sum + value, 0) / values.length;
  return digits ? Number(total.toFixed(digits)) : Math.round(total);
}

function topHotReds(redStats) {
  return [...redStats]
    .sort((a, b) => b.score - a.score || b.recent - a.recent || b.freq - a.freq)
    .slice(0, 6)
    .map((item) => item.number);
}

function topColdReds(redStats) {
  return [...redStats]
    .sort((a, b) => b.miss - a.miss || b.score - a.score)
    .slice(0, 4)
    .map((item) => ({ number: item.number, miss: item.miss }));
}

function topHotBlues(blueStats) {
  return [...blueStats]
    .sort((a, b) => b.score - a.score || b.recent - a.recent || b.freq - a.freq)
    .slice(0, 4)
    .map((item) => item.number);
}

function buildOverview(draws) {
  const recentWindow = Math.min(30, draws.length);
  const recentDraws = draws.slice(0, recentWindow);
  const redStats = makeNumberStats(33, draws, (draw) => draw.red, recentWindow);
  const blueStats = makeNumberStats(16, draws, (draw) => [draw.blue], recentWindow);
  const shapes = recentDraws.map((draw, index) => getDrawShape(draw, draws[index + 1] || null));

  return {
    drawCount: draws.length,
    recentWindow,
    avgSum: average(shapes.map((shape) => shape.sum)),
    avgSpan: average(shapes.map((shape) => shape.span)),
    avgAc: average(shapes.map((shape) => shape.ac), 1),
    hotReds: topHotReds(redStats),
    coldReds: topColdReds(redStats),
    hotBlues: topHotBlues(blueStats)
  };
}

function serializeHomeRecord(record) {
  return {
    id: record.id,
    reds: record.reds,
    blue: record.blue,
    createdAt: record.createdAt,
    pinnedAt: record.pinnedAt,
    isPinned: Boolean(record.pinnedAt),
    status: record.status,
    hitText: record.hit?.hitText || "",
    hitIssue: record.hit?.issue || "",
    prize: record.hit?.prize || null
  };
}

function serializePickRecord(record) {
  return {
    id: record.id,
    type: record.type,
    strategy: record.strategy,
    sourceName: record.sourceName,
    reds: record.reds,
    blue: record.blue,
    createdAt: record.createdAt,
    pinnedAt: record.pinnedAt,
    isPinned: Boolean(record.pinnedAt),
    baseIssue: record.baseIssue,
    status: record.status,
    hit: record.hit
      ? {
          issue: record.hit.issue,
          date: record.hit.date,
          redHits: record.hit.redHits,
          blueHit: record.hit.blueHit,
          hitText: record.hit.hitText,
          drawRed: record.hit.drawRed,
          drawBlue: record.hit.drawBlue,
          prize: record.hit.prize
        }
      : null
  };
}

async function loadFavoriteRecords(draws, userId, maxRecords = 300) {
  if (!userId) return [];
  const favorites = await readRecords({ limit: maxRecords, userId, type: "favorite" });
  return annotateRecords(favorites, draws);
}

async function handleMobileHome(req, reqUrl, res) {
  const limit = clampInt(reqUrl.searchParams.get("limit"), 120, 30, 240);
  const draws = await ensureStoredDraws(limit);
  const latestDraw = draws[0] || null;
  const authState = await resolveRequestUser(req);
  const favoriteRecords = await loadFavoriteRecords(draws, authState.user?.id || "", 120);
  const summary = buildRecordSummary(favoriteRecords);

  sendJson(res, 200, {
    ok: true,
    authenticated: Boolean(authState.user),
    user: authState.user || null,
    fetchedAt: new Date().toISOString(),
    latestDraw: latestDraw
      ? {
          ...latestDraw,
          shape: getDrawShape(latestDraw, draws[1] || null)
        }
      : null,
    overview: buildOverview(draws),
    mySummary: summary,
    announcements: buildJackpotAnnouncements(favoriteRecords),
    recentRecords: favoriteRecords.slice(0, 3).map(serializeHomeRecord)
  });
}

async function handleMobilePicks(req, reqUrl, res) {
  const limit = clampInt(reqUrl.searchParams.get("limit"), 240, 30, 300);
  const draws = await ensureStoredDraws(limit);
  const authState = await resolveRequestUser(req);
  const favoriteRecords = await loadFavoriteRecords(draws, authState.user?.id || "", 300);

  sendJson(res, 200, {
    ok: true,
    authenticated: Boolean(authState.user),
    user: authState.user || null,
    fetchedAt: new Date().toISOString(),
    latestDraw: draws[0] || null,
    summary: buildRecordSummary(favoriteRecords),
    announcements: buildJackpotAnnouncements(favoriteRecords, 8),
    records: favoriteRecords.map(serializePickRecord)
  });
}

module.exports = {
  handleMobileHome,
  handleMobilePicks
};
