const { LEGACY_RECORDS_FILE } = require("./config");
const { resolveRequestUser } = require("./auth");
const { appendRecords, countRecords, deleteRecord, readRecords, setRecordPinned } = require("./database");
const { ensureStoredDraws } = require("./draw-controller");
const { readJson } = require("./json-store");
const { readJsonBody, sendJson } = require("./http");
const {
  annotateRecordsWithContext,
  buildAnnotationContext,
  buildJackpotAnnouncements,
  buildRecordSummary,
  buildSourcePerformance
} = require("./record-results");
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

function unauthorizedError() {
  const error = new Error("login required");
  error.statusCode = 401;
  error.code = "AUTH_REQUIRED";
  return error;
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
    if (!userId) throw unauthorizedError();
    const id = reqUrl.searchParams.get("id");
    if (!id) {
      sendJson(res, 400, { ok: false, error: "missing record id" });
      return;
    }
    const deleted = await deleteRecord(id, userId);
    sendJson(res, 200, { ok: true, deleted });
    return;
  }

  if (req.method === "PATCH") {
    if (!userId) throw unauthorizedError();
    const payload = await readJsonBody(req);
    const id = String(payload.id || reqUrl.searchParams.get("id") || "");
    if (!id) {
      sendJson(res, 400, { ok: false, error: "missing record id" });
      return;
    }
    const result = await setRecordPinned(id, Boolean(payload.pinned), userId);
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === "POST") {
    if (!userId) throw unauthorizedError();
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
  const records = await readRecords({ limit: 3000, userId });
  const annotated = records.length
    ? annotateRecordsWithContext(records, await buildAnnotationContext(draws))
    : [];

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
