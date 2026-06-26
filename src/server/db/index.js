const { closeDb, databasePath, query: rawQuery, withClient: rawWithClient } = require("./pool");
const { migrate, resetMigration } = require("./migrate");
const { readDraws, upsertDraws } = require("./draw-repo");
const { appendRecords, countRecords, deleteRecord, readRecords, setRecordPinned } = require("./record-repo");
const { readCommunitySnapshot, upsertCommunitySnapshot } = require("./community-repo");
const { readIndicatorIssues, readIndicators, upsertIndicators } = require("./indicator-repo");
const { cleanupExpiredSessions } = require("./session-repo");
const { globalCache } = require("../cache");

async function query(text, params = []) {
  await migrate();
  return rawQuery(text, params);
}

async function withClient(run) {
  await migrate();
  return rawWithClient(run);
}

async function closeDatabase() {
  await closeDb();
  resetMigration();
  globalCache.clear();
}

module.exports = {
  appendRecords,
  cleanupExpiredSessions,
  closeDb: closeDatabase,
  countRecords,
  databasePath,
  deleteRecord,
  ensureDatabaseReady: migrate,
  query,
  readCommunitySnapshot,
  readDraws,
  readIndicatorIssues,
  readIndicators,
  readRecords,
  setRecordPinned,
  upsertCommunitySnapshot,
  upsertDraws,
  upsertIndicators,
  withClient
};
