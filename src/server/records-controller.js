const { LEGACY_RECORDS_FILE } = require("./config");
const { appendRecords, countRecords, readRecords } = require("./database");
const { ensureStoredDraws } = require("./draw-controller");
const { readJson } = require("./json-store");
const { readRequestBody, sendJson } = require("./http");
const { clampInt, normalizeRecord } = require("./utils");

let legacyMigrationPromise = null;

async function migrateLegacyRecords() {
  if (legacyMigrationPromise) return legacyMigrationPromise;
  legacyMigrationPromise = (async () => {
    if (countRecords() > 0) return;
    const data = await readJson(LEGACY_RECORDS_FILE, { records: [] });
    const records = Array.isArray(data.records) ? data.records.map(normalizeRecord).filter(Boolean) : [];
    if (records.length) appendRecords(records);
  })().catch((error) => {
    legacyMigrationPromise = null; // 失败允许重试
    throw error;
  });
  return legacyMigrationPromise;
}

function scoreRecordAgainstDraw(record, draw) {
  const redSet = new Set(record.reds);
  const redHits = draw.red.filter((item) => redSet.has(item)).length;
  const blueHit = record.blue === draw.blue ? 1 : 0;
  return {
    issue: draw.issue,
    date: draw.date,
    redHits,
    blueHit,
    hitText: `${redHits}+${blueHit}`,
    drawRed: draw.red,
    drawBlue: draw.blue
  };
}

function issueDistance(baseIssue, drawIssue) {
  const base = Number(baseIssue);
  const draw = Number(drawIssue);
  if (!Number.isFinite(base) || !Number.isFinite(draw)) return 0;
  return draw - base;
}

function annotateRecords(records, draws) {
  const ascendingDraws = [...draws].sort((a, b) => Number(a.issue) - Number(b.issue));
  const latestDraw = ascendingDraws[ascendingDraws.length - 1] || null;
  return records.map((record) => {
    const matchedDraw =
      (record.baseIssue
        ? ascendingDraws.find((draw) => issueDistance(record.baseIssue, draw.issue) > 0)
        : null) || latestDraw;
    const hit = matchedDraw ? scoreRecordAgainstDraw(record, matchedDraw) : null;
    return { ...record, hit };
  });
}

function buildRecordSummary(records) {
  const checked = records.filter((item) => item.hit);
  const blueHits = checked.filter((item) => item.hit.blueHit).length;
  const strongHits = checked.filter((item) => item.hit.redHits >= 4 || (item.hit.redHits >= 3 && item.hit.blueHit)).length;
  const avgRed = checked.length
    ? checked.reduce((sum, item) => sum + item.hit.redHits, 0) / checked.length
    : 0;
  const best = [...checked].sort(
    (a, b) => b.hit.redHits + b.hit.blueHit * 1.2 - (a.hit.redHits + a.hit.blueHit * 1.2)
  )[0];

  return {
    total: records.length,
    checked: checked.length,
    avgRed: Number(avgRed.toFixed(2)),
    blueHits,
    blueRate: checked.length ? Math.round((blueHits / checked.length) * 100) : 0,
    strongHits,
    best: best
      ? {
          id: best.id,
          key: best.key,
          type: best.type,
          strategy: best.strategy,
          sourceName: best.sourceName,
          hitText: best.hit.hitText,
          issue: best.hit.issue
        }
      : null
  };
}

function buildSourcePerformance(records) {
  const sourceRecords = records.filter((item) => item.type === "community" && item.sourceName && item.hit);
  const map = new Map();

  for (const record of sourceRecords) {
    const row = map.get(record.sourceName) || {
      sourceName: record.sourceName,
      sourceUrl: record.sourceUrl,
      checked: 0,
      totalRed: 0,
      blueHits: 0,
      strongHits: 0,
      bestHit: "0+0",
      bestScore: -1
    };
    const hitScore = record.hit.redHits + record.hit.blueHit * 1.2;
    row.checked += 1;
    row.totalRed += record.hit.redHits;
    row.blueHits += record.hit.blueHit;
    if (record.hit.redHits >= 4 || (record.hit.redHits >= 3 && record.hit.blueHit)) row.strongHits += 1;
    if (hitScore > row.bestScore) {
      row.bestScore = hitScore;
      row.bestHit = record.hit.hitText;
    }
    map.set(record.sourceName, row);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      avgRed: Number((row.totalRed / Math.max(1, row.checked)).toFixed(2)),
      blueRate: Math.round((row.blueHits / Math.max(1, row.checked)) * 100),
      performanceScore: Math.min(
        99,
        Math.round(row.totalRed * 4 + row.blueHits * 8 + row.strongHits * 12 + Math.min(row.checked, 20))
      )
    }))
    .sort((a, b) => b.performanceScore - a.performanceScore || b.avgRed - a.avgRed);
}

async function handleRecords(req, reqUrl, res) {
  await migrateLegacyRecords();

  if (req.method === "POST") {
    const body = await readRequestBody(req);
    const payload = body ? JSON.parse(body) : {};
    const items = Array.isArray(payload.records) ? payload.records : [payload.record || payload];
    const normalized = items.map(normalizeRecord).filter(Boolean);
    const added = appendRecords(normalized);
    sendJson(res, 200, { ok: true, added: added.length, records: added });
    return;
  }

  const limit = clampInt(reqUrl.searchParams.get("limit"), 240, 30, 1000);
  const draws = await ensureStoredDraws(limit);
  const records = readRecords(3000);
  const annotated = annotateRecords(records, draws);

  sendJson(res, 200, {
    ok: true,
    drawSource: "sqlite",
    latestDraw: draws[0] || null,
    records: annotated.slice(0, 300),
    summary: buildRecordSummary(annotated),
    sourcePerformance: buildSourcePerformance(annotated)
  });
}

module.exports = {
  handleRecords
};
