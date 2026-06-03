const { DATABASE_URL, DB_SSL, DEFAULT_USER_ID } = require("./config");

let PoolCtor;
let pool;
let migrationPromise;

function getPoolCtor() {
  if (PoolCtor) return PoolCtor;
  ({ Pool: PoolCtor } = require("pg"));
  return PoolCtor;
}

function getPool() {
  if (pool) return pool;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required when using PostgreSQL");
  }
  const Pool = getPoolCtor();
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DB_SSL ? { rejectUnauthorized: false } : false
  });
  return pool;
}

async function query(text, params = []) {
  await migrate();
  return getPool().query(text, params);
}

async function withClient(run) {
  await migrate();
  const client = await getPool().connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

async function migrate() {
  if (migrationPromise) return migrationPromise;
  const attempt = (async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          username_norm TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL,
          last_login_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          client_type TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          last_seen_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS draws (
          issue TEXT PRIMARY KEY,
          draw_date TEXT NOT NULL DEFAULT '',
          red1 TEXT NOT NULL,
          red2 TEXT NOT NULL,
          red3 TEXT NOT NULL,
          red4 TEXT NOT NULL,
          red5 TEXT NOT NULL,
          red6 TEXT NOT NULL,
          blue TEXT NOT NULL,
          sales TEXT NOT NULL DEFAULT '',
          pool_money TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT '',
          fetched_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'default',
          type TEXT NOT NULL,
          ticket_key TEXT NOT NULL,
          reds_json JSONB NOT NULL,
          blue TEXT NOT NULL,
          strategy TEXT NOT NULL DEFAULT '',
          source_name TEXT NOT NULL DEFAULT '',
          source_url TEXT NOT NULL DEFAULT '',
          base_issue TEXT NOT NULL DEFAULT '',
          base_date TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          score DOUBLE PRECISION,
          pinned_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS draw_indicators (
          issue TEXT PRIMARY KEY REFERENCES draws(issue) ON DELETE CASCADE,
          draw_date TEXT NOT NULL DEFAULT '',
          sum_value INTEGER NOT NULL,
          span_value INTEGER NOT NULL,
          odd_count INTEGER NOT NULL,
          even_count INTEGER NOT NULL,
          big_count INTEGER NOT NULL,
          small_count INTEGER NOT NULL,
          prime_count INTEGER NOT NULL,
          composite_count INTEGER NOT NULL,
          zone_low INTEGER NOT NULL,
          zone_mid INTEGER NOT NULL,
          zone_high INTEGER NOT NULL,
          mod0 INTEGER NOT NULL,
          mod1 INTEGER NOT NULL,
          mod2 INTEGER NOT NULL,
          consecutive_count INTEGER NOT NULL,
          ac_value INTEGER NOT NULL,
          repeat_count INTEGER NOT NULL,
          blue_odd INTEGER NOT NULL,
          hot_count INTEGER NOT NULL,
          warm_count INTEGER NOT NULL,
          cold_count INTEGER NOT NULL,
          hot_ratio DOUBLE PRECISION NOT NULL,
          cold_ratio DOUBLE PRECISION NOT NULL,
          sum_type TEXT NOT NULL,
          parity_type TEXT NOT NULL,
          size_type TEXT NOT NULL,
          zone_type TEXT NOT NULL,
          hot_cold_type TEXT NOT NULL,
          type_label TEXT NOT NULL,
          regression_sum DOUBLE PRECISION NOT NULL,
          regression_residual DOUBLE PRECISION NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);

      await ensureColumn(client, "records", "user_id", "TEXT NOT NULL DEFAULT 'default'");
      await ensureColumn(client, "records", "pinned_at", "TIMESTAMPTZ");
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_created_at
          ON users (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sessions_user
          ON sessions (user_id, expires_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires
          ON sessions (expires_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_records_dedup
          ON records (user_id, type, ticket_key, base_issue, strategy, source_name);
        CREATE INDEX IF NOT EXISTS idx_records_order
          ON records (user_id, pinned_at DESC NULLS LAST, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_records_type_order
          ON records (user_id, type, pinned_at DESC NULLS LAST, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_draws_issue_order
          ON draws ((issue::BIGINT) DESC);
        CREATE INDEX IF NOT EXISTS idx_indicators_issue_order
          ON draw_indicators ((issue::BIGINT) DESC);
      `);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // 忽略二次错误，确保下一行可以抛出原始错误
      }
      throw error;
    } finally {
      client.release();
    }
  })();
  migrationPromise = attempt.catch((error) => {
    // 失败允许下次调用重新尝试，否则错误会被永久缓存
    migrationPromise = null;
    throw error;
  });
  return migrationPromise;
}

async function ensureColumn(client, table, column, definition) {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
    `,
    [table, column]
  );
  if (!result.rowCount) {
    await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function timestamp(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function rowToDraw(row) {
  return {
    issue: row.issue,
    date: row.draw_date,
    red: [row.red1, row.red2, row.red3, row.red4, row.red5, row.red6],
    blue: row.blue,
    sales: row.sales,
    poolMoney: row.pool_money,
    source: row.source
  };
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

function rowToIndicator(row) {
  return {
    issue: row.issue,
    date: row.draw_date,
    sum: row.sum_value,
    span: row.span_value,
    odd: row.odd_count,
    even: row.even_count,
    big: row.big_count,
    small: row.small_count,
    prime: row.prime_count,
    composite: row.composite_count,
    zones: [row.zone_low, row.zone_mid, row.zone_high],
    mod012: [row.mod0, row.mod1, row.mod2],
    consecutive: row.consecutive_count,
    ac: row.ac_value,
    repeat: row.repeat_count,
    blueOdd: row.blue_odd,
    hotCount: row.hot_count,
    warmCount: row.warm_count,
    coldCount: row.cold_count,
    hotRatio: row.hot_ratio,
    coldRatio: row.cold_ratio,
    sumType: row.sum_type,
    parityType: row.parity_type,
    sizeType: row.size_type,
    zoneType: row.zone_type,
    hotColdType: row.hot_cold_type,
    typeLabel: row.type_label,
    regressionSum: row.regression_sum,
    regressionResidual: row.regression_residual
  };
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildValuesClause(rows, columnsPerRow, mapRow) {
  const params = [];
  const values = rows
    .map((row, rowIndex) => {
      const rowValues = mapRow(row);
      params.push(...rowValues);
      const base = rowIndex * columnsPerRow;
      return `(${rowValues.map((_, valueIndex) => `$${base + valueIndex + 1}`).join(", ")})`;
    })
    .join(",\n            ");
  return { params, values };
}

function buildRecordsValuesClause(rows, userId) {
  const params = [];
  const values = rows
    .map((record, rowIndex) => {
      const rowValues = [
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
      ];
      params.push(...rowValues);
      const base = rowIndex * rowValues.length;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, NULLIF($${base + 14}, '')::timestamptz, $${base + 15})`;
    })
    .join(",\n            ");
  return { params, values };
}

async function upsertDraws(draws) {
  if (!draws.length) return 0;
  const now = new Date().toISOString();
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const batch of chunkItems(draws, 500)) {
        const { params, values } = buildValuesClause(batch, 13, (draw) => [
          draw.issue,
          draw.date || "",
          draw.red[0],
          draw.red[1],
          draw.red[2],
          draw.red[3],
          draw.red[4],
          draw.red[5],
          draw.blue,
          draw.sales || "",
          draw.poolMoney || "",
          draw.source || "",
          now
        ]);
        await client.query(
          `
            INSERT INTO draws (
              issue, draw_date, red1, red2, red3, red4, red5, red6, blue,
              sales, pool_money, source, fetched_at
            )
            VALUES ${values}
            ON CONFLICT(issue) DO UPDATE SET
              draw_date = EXCLUDED.draw_date,
              red1 = EXCLUDED.red1,
              red2 = EXCLUDED.red2,
              red3 = EXCLUDED.red3,
              red4 = EXCLUDED.red4,
              red5 = EXCLUDED.red5,
              red6 = EXCLUDED.red6,
              blue = EXCLUDED.blue,
              sales = EXCLUDED.sales,
              pool_money = EXCLUDED.pool_money,
              source = EXCLUDED.source,
              fetched_at = EXCLUDED.fetched_at
          `,
          params
        );
      }
      await client.query("COMMIT");
      return draws.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function readDraws(limit = 240) {
  const result = await query(
    `
      SELECT *
      FROM draws
      ORDER BY issue::BIGINT DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map(rowToDraw);
}

async function countRecords(userId = DEFAULT_USER_ID) {
  const result = await query("SELECT COUNT(*)::INT AS total FROM records WHERE user_id = $1", [userId]);
  return result.rows[0]?.total || 0;
}

async function appendRecords(records, userId = DEFAULT_USER_ID) {
  if (!records.length) return [];
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const added = [];
      for (const batch of chunkItems(records, 500)) {
        const { params, values } = buildRecordsValuesClause(batch, userId);
        const result = await client.query(
          `
            INSERT INTO records (
              id, user_id, type, ticket_key, reds_json, blue, strategy, source_name, source_url,
              base_issue, base_date, reason, score, pinned_at, created_at
            )
            VALUES ${values}
            ON CONFLICT(user_id, type, ticket_key, base_issue, strategy, source_name) DO NOTHING
            RETURNING *
          `,
          params
        );
        added.push(...result.rows.map(rowToRecord));
      }
      await client.query("COMMIT");
      return added;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function readRecords(options = 3000, maybeUserId = DEFAULT_USER_ID) {
  const normalized =
    typeof options === "object" && options
      ? {
          limit: options.limit ?? 3000,
          userId: options.userId ?? DEFAULT_USER_ID,
          type: options.type ?? ""
        }
      : {
          limit: options,
          userId: maybeUserId,
          type: ""
        };
  const clauses = ["user_id = $1"];
  const params = [normalized.userId];
  if (normalized.type) {
    params.push(normalized.type);
    clauses.push(`type = $${params.length}`);
  }
  params.push(normalized.limit);
  const result = await query(
    `
      SELECT *
      FROM records
      WHERE ${clauses.join(" AND ")}
      ORDER BY pinned_at DESC NULLS LAST, created_at DESC
      LIMIT $${params.length}
    `,
    params
  );
  return result.rows.map(rowToRecord);
}

async function deleteRecord(id, userId = DEFAULT_USER_ID) {
  const result = await query("DELETE FROM records WHERE id = $1 AND user_id = $2", [id, userId]);
  return result.rowCount || 0;
}

async function setRecordPinned(id, pinned, userId = DEFAULT_USER_ID) {
  const pinnedAt = pinned ? new Date().toISOString() : "";
  const result = await query(
    "UPDATE records SET pinned_at = NULLIF($1, '')::timestamptz WHERE id = $2 AND user_id = $3",
    [pinnedAt, id, userId]
  );
  return { changed: result.rowCount || 0, pinnedAt };
}

async function upsertIndicators(indicators) {
  if (!indicators.length) return 0;
  const now = new Date().toISOString();
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const batch of chunkItems(indicators, 500)) {
        const { params, values } = buildValuesClause(batch, 34, (item) => [
          item.issue,
          item.date || "",
          item.sum,
          item.span,
          item.odd,
          item.even,
          item.big,
          item.small,
          item.prime,
          item.composite,
          item.zones[0],
          item.zones[1],
          item.zones[2],
          item.mod012[0],
          item.mod012[1],
          item.mod012[2],
          item.consecutive,
          item.ac,
          item.repeat,
          item.blueOdd,
          item.hotCount,
          item.warmCount,
          item.coldCount,
          item.hotRatio,
          item.coldRatio,
          item.sumType,
          item.parityType,
          item.sizeType,
          item.zoneType,
          item.hotColdType,
          item.typeLabel,
          item.regressionSum,
          item.regressionResidual,
          now
        ]);
        await client.query(
          `
            INSERT INTO draw_indicators (
              issue, draw_date, sum_value, span_value, odd_count, even_count, big_count,
              small_count, prime_count, composite_count, zone_low, zone_mid, zone_high,
              mod0, mod1, mod2, consecutive_count, ac_value, repeat_count, blue_odd,
              hot_count, warm_count, cold_count, hot_ratio, cold_ratio, sum_type,
              parity_type, size_type, zone_type, hot_cold_type, type_label,
              regression_sum, regression_residual, updated_at
            )
            VALUES ${values}
            ON CONFLICT(issue) DO UPDATE SET
              draw_date = EXCLUDED.draw_date,
              sum_value = EXCLUDED.sum_value,
              span_value = EXCLUDED.span_value,
              odd_count = EXCLUDED.odd_count,
              even_count = EXCLUDED.even_count,
              big_count = EXCLUDED.big_count,
              small_count = EXCLUDED.small_count,
              prime_count = EXCLUDED.prime_count,
              composite_count = EXCLUDED.composite_count,
              zone_low = EXCLUDED.zone_low,
              zone_mid = EXCLUDED.zone_mid,
              zone_high = EXCLUDED.zone_high,
              mod0 = EXCLUDED.mod0,
              mod1 = EXCLUDED.mod1,
              mod2 = EXCLUDED.mod2,
              consecutive_count = EXCLUDED.consecutive_count,
              ac_value = EXCLUDED.ac_value,
              repeat_count = EXCLUDED.repeat_count,
              blue_odd = EXCLUDED.blue_odd,
              hot_count = EXCLUDED.hot_count,
              warm_count = EXCLUDED.warm_count,
              cold_count = EXCLUDED.cold_count,
              hot_ratio = EXCLUDED.hot_ratio,
              cold_ratio = EXCLUDED.cold_ratio,
              sum_type = EXCLUDED.sum_type,
              parity_type = EXCLUDED.parity_type,
              size_type = EXCLUDED.size_type,
              zone_type = EXCLUDED.zone_type,
              hot_cold_type = EXCLUDED.hot_cold_type,
              type_label = EXCLUDED.type_label,
              regression_sum = EXCLUDED.regression_sum,
              regression_residual = EXCLUDED.regression_residual,
              updated_at = EXCLUDED.updated_at
          `,
          params
        );
      }
      await client.query("COMMIT");
      return indicators.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function readIndicators(limit = 240) {
  const result = await query(
    `
      SELECT *
      FROM draw_indicators
      ORDER BY issue::BIGINT DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map(rowToIndicator);
}

async function readIndicatorIssues(limit = 0) {
  const normalizedLimit = Number(limit);
  const result =
    Number.isFinite(normalizedLimit) && normalizedLimit > 0
      ? await query(
          `
            SELECT issue
            FROM draw_indicators
            ORDER BY issue::BIGINT DESC
            LIMIT $1
          `,
          [normalizedLimit]
        )
      : await query("SELECT issue FROM draw_indicators");
  return new Set(result.rows.map((row) => row.issue));
}

function databasePath() {
  return DATABASE_URL ? DATABASE_URL.replace(/:\/\/([^:@]+):([^@]+)@/, "://$1:***@") : "";
}

async function closeDb() {
  if (!pool) return;
  await pool.end();
  pool = null;
  migrationPromise = null;
}

module.exports = {
  appendRecords,
  closeDb,
  countRecords,
  databasePath,
  deleteRecord,
  ensureDatabaseReady: migrate,
  readDraws,
  readIndicatorIssues,
  readIndicators,
  readRecords,
  query,
  setRecordPinned,
  upsertDraws,
  upsertIndicators,
  withClient
};
