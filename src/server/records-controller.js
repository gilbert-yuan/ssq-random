const { LEGACY_RECORDS_FILE } = require("./config");
const { resolveRequestUser } = require("./auth");
const { appendRecords, countRecords, deleteRecord, readRecords, setRecordPinned } = require("./database");
const { ensureStoredDraws } = require("./draw-controller");
const { badRequest, unauthorized } = require("./errors");
const { readJson } = require("./json-store");
const { readJsonBody, sendJson } = require("./http");
const { annotateRecords, buildJackpotAnnouncements, buildRecordSummary, buildSourcePerformance } = require("./record-results");
const { clampInt, normalizeRecord } = require("./utils");

let legacyMigrationPromise = null;

async function migrateLegacyRecords() {
  if (legacyMigrationPromise) return legacyMigrationPromise;
  legacyMigrationPromise = (async () => {
    if ((await countRecords()) > 0) return;
    const data = await readJson(LEGACY_RECORDS_FILE, { records: [] });
    const records = Array.isArray(data.records) ? data.records.map(normalizeRecord).filter(Boolean) : [];
    if (records.length) await appendRecords(records);
  })().catch((error) => {
    legacyMigrationPromise = null; // 失败允许重试
    throw error;
  });
  return legacyMigrationPromise;
}

function requireAuth(authState) {
  const userId = authState.user?.id || "";
  if (!userId) throw unauthorized("login required", "AUTH_REQUIRED");
  return userId;
}

function emptyRecordPayload(draws, authState) {
  const empty = [];
  return {
    ok: true,
    authenticated: false,
    user: authState.user || null,
    drawSource: "postgresql",
    latestDraw: draws[0] || null,
    records: empty,
    summary: buildRecordSummary(empty),
    sourcePerformance: buildSourcePerformance(empty),
    announcements: buildJackpotAnnouncements(empty)
  };
}

async function handleRecords(req, reqUrl, res) {
  await migrateLegacyRecords();
  const authState = await resolveRequestUser(req);
  const userId = authState.user?.id || "";

  if (req.method === "DELETE") {
    const userId = requireAuth(authState);
    const id = reqUrl.searchParams.get("id");
    if (!id) throw badRequest("missing record id");
    const deleted = await deleteRecord(id, userId);
    sendJson(res, 200, { ok: true, deleted });
    return;
  }

  if (req.method === "PATCH") {
    const userId = requireAuth(authState);
    const payload = await readJsonBody(req);
    const id = String(payload.id || reqUrl.searchParams.get("id") || "");
    if (!id) throw badRequest("missing record id");
    const result = await setRecordPinned(id, Boolean(payload.pinned), userId);
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === "POST") {
    const userId = requireAuth(authState);
    const payload = await readJsonBody(req);
    const items = Array.isArray(payload.records) ? payload.records : [payload.record || payload];
    const normalized = items.map(normalizeRecord).filter(Boolean);
    const added = await appendRecords(normalized, userId);
    sendJson(res, 200, { ok: true, added: added.length, records: added });
    return;
  }

  const limit = clampInt(reqUrl.searchParams.get("limit"), 240, 30, 1000);
  const draws = await ensureStoredDraws(limit);
  if (!userId) {
    sendJson(res, 200, emptyRecordPayload(draws, authState));
    return;
  }
  const records = await readRecords(3000, userId);
  const annotated = await annotateRecords(records, draws);

  sendJson(res, 200, {
    ok: true,
    authenticated: true,
    user: authState.user,
    drawSource: "postgresql",
    latestDraw: draws[0] || null,
    records: annotated.slice(0, 300),
    summary: buildRecordSummary(annotated),
    sourcePerformance: buildSourcePerformance(annotated),
    announcements: buildJackpotAnnouncements(annotated)
  });
}

module.exports = {
  handleRecords
};
