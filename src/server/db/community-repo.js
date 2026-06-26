const { globalCache } = require("../cache");
const { query } = require("./pool");

const COMMUNITY_CACHE_TTL = 2 * 60 * 1000;

function timestamp(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return JSON.parse(value);
}

function rowToCommunitySnapshot(row) {
  if (!row) return null;
  return {
    fetchedAt: timestamp(row.fetched_at),
    sources: parseJsonArray(row.sources_json),
    count: Number(row.count_value || 0),
    recommendations: parseJsonArray(row.recommendations_json),
    aggregate: parseJsonArray(row.aggregate_json),
    sourceScores: parseJsonArray(row.source_scores_json),
    errors: parseJsonArray(row.errors_json)
  };
}

async function upsertCommunitySnapshot(snapshot, userId) {
  if (!snapshot || !userId) return null;
  const fetchedAt = snapshot.fetchedAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const result = await query(
    `
      INSERT INTO community_snapshots (
        user_id, sources_json, recommendations_json, aggregate_json, source_scores_json,
        errors_json, count_value, fetched_at, updated_at
      )
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9)
      ON CONFLICT(user_id) DO UPDATE SET
        sources_json = EXCLUDED.sources_json,
        recommendations_json = EXCLUDED.recommendations_json,
        aggregate_json = EXCLUDED.aggregate_json,
        source_scores_json = EXCLUDED.source_scores_json,
        errors_json = EXCLUDED.errors_json,
        count_value = EXCLUDED.count_value,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [
      userId,
      JSON.stringify(snapshot.sources || []),
      JSON.stringify(snapshot.recommendations || []),
      JSON.stringify(snapshot.aggregate || []),
      JSON.stringify(snapshot.sourceScores || []),
      JSON.stringify(snapshot.errors || []),
      Number(snapshot.count || 0),
      fetchedAt,
      updatedAt
    ]
  );
  globalCache.invalidate(`community:${userId}`);
  return rowToCommunitySnapshot(result.rows[0]);
}

async function readCommunitySnapshot(userId) {
  if (!userId) return null;
  const cacheKey = `community:${userId}`;
  const cached = globalCache.get(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT * FROM community_snapshots WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const snapshot = rowToCommunitySnapshot(result.rows[0]);
  if (snapshot) globalCache.set(cacheKey, snapshot, COMMUNITY_CACHE_TTL);
  return snapshot;
}

module.exports = {
  readCommunitySnapshot,
  upsertCommunitySnapshot
};
