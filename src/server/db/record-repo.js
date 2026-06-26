const { DEFAULT_USER_ID } = require("../config");
const { globalCache } = require("../cache");
const { query } = require("./pool");

function timestamp(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function rowToRecord(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    key: row.ticket_key,
    reds: Array.isArray(row.reds_json) ? row.reds_json : JSON.parse(row.reds_json),
    blue: row.blue,
    strategy: row.strategy,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    baseIssue: row.base_issue,
    baseDate: row.base_date,
    reason: row.reason,
    score: row.score,
    pinnedAt: timestamp(row.pinned_at),
    createdAt: timestamp(row.created_at)
  };
}

async function countRecords(userId = DEFAULT_USER_ID) {
  const result = await query("SELECT COUNT(*)::INT AS total FROM records WHERE user_id = $1", [userId]);
  return result.rows[0]?.total || 0;
}

async function appendRecords(records, userId = DEFAULT_USER_ID) {
  if (!records.length) return [];
  const colCount = 15;
  const values = [];
  const placeholders = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const offset = i * colCount;
    const ph = Array.from({ length: colCount }, (_, j) => {
      const idx = offset + j + 1;
      return j === 4 ? `$${idx}::jsonb` : j === 13 ? `NULLIF($${idx}, '')::timestamptz` : `$${idx}`;
    }).join(", ");
    placeholders.push(`(${ph})`);
    values.push(
      record.id,
      userId,
      record.type,
      record.key,
      JSON.stringify(record.reds),
      record.blue,
      record.strategy,
      record.sourceName,
      record.sourceUrl,
      record.baseIssue,
      record.baseDate,
      record.reason,
      record.score,
      record.pinnedAt || "",
      record.createdAt
    );
  }

  const result = await query(
    `INSERT INTO records (id, user_id, type, ticket_key, reds_json, blue, strategy, source_name, source_url,
      base_issue, base_date, reason, score, pinned_at, created_at)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT(user_id, type, ticket_key, base_issue, strategy, source_name) DO NOTHING
     RETURNING *`,
    values
  );
  globalCache.invalidatePrefix("records:");
  return result.rows.map(rowToRecord);
}

async function readRecords(limit = 3000, userId = DEFAULT_USER_ID) {
  const result = await query(
    `SELECT * FROM records WHERE user_id = $1 ORDER BY pinned_at DESC NULLS LAST, created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(rowToRecord);
}

async function deleteRecord(id, userId = DEFAULT_USER_ID) {
  const result = await query("DELETE FROM records WHERE id = $1 AND user_id = $2", [id, userId]);
  globalCache.invalidatePrefix("records:");
  return result.rowCount || 0;
}

async function setRecordPinned(id, pinned, userId = DEFAULT_USER_ID) {
  const pinnedAt = pinned ? new Date().toISOString() : "";
  const result = await query(
    "UPDATE records SET pinned_at = NULLIF($1, '')::timestamptz WHERE id = $2 AND user_id = $3",
    [pinnedAt, id, userId]
  );
  globalCache.invalidatePrefix("records:");
  return { changed: result.rowCount || 0, pinnedAt };
}

module.exports = {
  appendRecords,
  countRecords,
  deleteRecord,
  readRecords,
  setRecordPinned
};
