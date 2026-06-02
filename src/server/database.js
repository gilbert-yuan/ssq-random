const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { DATA_DIR, SQLITE_FILE } = require("./config");

let db;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(SQLITE_FILE);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrate();
  return db;
}

function migrate() {
  db.exec(`
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
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      ticket_key TEXT NOT NULL,
      reds_json TEXT NOT NULL,
      blue TEXT NOT NULL,
      strategy TEXT NOT NULL DEFAULT '',
      source_name TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      base_issue TEXT NOT NULL DEFAULT '',
      base_date TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      score REAL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_records_dedup
      ON records (type, ticket_key, base_issue, strategy, source_name);

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
      hot_ratio REAL NOT NULL,
      cold_ratio REAL NOT NULL,
      sum_type TEXT NOT NULL,
      parity_type TEXT NOT NULL,
      size_type TEXT NOT NULL,
      zone_type TEXT NOT NULL,
      hot_cold_type TEXT NOT NULL,
      type_label TEXT NOT NULL,
      regression_sum REAL NOT NULL,
      regression_residual REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_draws_issue_order ON draws (CAST(issue AS INTEGER) DESC);
    CREATE INDEX IF NOT EXISTS idx_indicators_issue_order ON draw_indicators (CAST(issue AS INTEGER) DESC);
  `);
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
    type: row.type,
    key: row.ticket_key,
    reds: JSON.parse(row.reds_json),
    blue: row.blue,
    strategy: row.strategy,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    baseIssue: row.base_issue,
    baseDate: row.base_date,
    reason: row.reason,
    score: row.score,
    createdAt: row.created_at
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

function upsertDraws(draws) {
  if (!draws.length) return 0;
  const database = getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(`
    INSERT INTO draws (
      issue, draw_date, red1, red2, red3, red4, red5, red6, blue,
      sales, pool_money, source, fetched_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(issue) DO UPDATE SET
      draw_date = excluded.draw_date,
      red1 = excluded.red1,
      red2 = excluded.red2,
      red3 = excluded.red3,
      red4 = excluded.red4,
      red5 = excluded.red5,
      red6 = excluded.red6,
      blue = excluded.blue,
      sales = excluded.sales,
      pool_money = excluded.pool_money,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `);

  database.exec("BEGIN");
  try {
    draws.forEach((draw) => {
      stmt.run(
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
      );
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return draws.length;
}

function readDraws(limit = 240) {
  const stmt = getDb().prepare(`
    SELECT *
    FROM draws
    ORDER BY CAST(issue AS INTEGER) DESC
    LIMIT ?
  `);
  return stmt.all(limit).map(rowToDraw);
}

function countRecords() {
  return getDb().prepare("SELECT COUNT(*) AS total FROM records").get().total;
}

function appendRecords(records) {
  if (!records.length) return [];
  const database = getDb();
  const exists = database.prepare(`
    SELECT id
    FROM records
    WHERE type = ? AND ticket_key = ? AND base_issue = ? AND strategy = ? AND source_name = ?
    LIMIT 1
  `);
  const insert = database.prepare(`
    INSERT INTO records (
      id, type, ticket_key, reds_json, blue, strategy, source_name, source_url,
      base_issue, base_date, reason, score, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const added = [];

  database.exec("BEGIN");
  try {
    for (const record of records) {
      const duplicate = exists.get(
        record.type,
        record.key,
        record.baseIssue,
        record.strategy,
        record.sourceName
      );
      if (duplicate) continue;
      insert.run(
        record.id,
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
        record.createdAt
      );
      added.push(record);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return added;
}

function readRecords(limit = 3000) {
  const stmt = getDb().prepare(`
    SELECT *
    FROM records
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `);
  return stmt.all(limit).map(rowToRecord);
}

function upsertIndicators(indicators) {
  if (!indicators.length) return 0;
  const database = getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(`
    INSERT INTO draw_indicators (
      issue, draw_date, sum_value, span_value, odd_count, even_count, big_count,
      small_count, prime_count, composite_count, zone_low, zone_mid, zone_high,
      mod0, mod1, mod2, consecutive_count, ac_value, repeat_count, blue_odd,
      hot_count, warm_count, cold_count, hot_ratio, cold_ratio, sum_type,
      parity_type, size_type, zone_type, hot_cold_type, type_label,
      regression_sum, regression_residual, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(issue) DO UPDATE SET
      draw_date = excluded.draw_date,
      sum_value = excluded.sum_value,
      span_value = excluded.span_value,
      odd_count = excluded.odd_count,
      even_count = excluded.even_count,
      big_count = excluded.big_count,
      small_count = excluded.small_count,
      prime_count = excluded.prime_count,
      composite_count = excluded.composite_count,
      zone_low = excluded.zone_low,
      zone_mid = excluded.zone_mid,
      zone_high = excluded.zone_high,
      mod0 = excluded.mod0,
      mod1 = excluded.mod1,
      mod2 = excluded.mod2,
      consecutive_count = excluded.consecutive_count,
      ac_value = excluded.ac_value,
      repeat_count = excluded.repeat_count,
      blue_odd = excluded.blue_odd,
      hot_count = excluded.hot_count,
      warm_count = excluded.warm_count,
      cold_count = excluded.cold_count,
      hot_ratio = excluded.hot_ratio,
      cold_ratio = excluded.cold_ratio,
      sum_type = excluded.sum_type,
      parity_type = excluded.parity_type,
      size_type = excluded.size_type,
      zone_type = excluded.zone_type,
      hot_cold_type = excluded.hot_cold_type,
      type_label = excluded.type_label,
      regression_sum = excluded.regression_sum,
      regression_residual = excluded.regression_residual,
      updated_at = excluded.updated_at
  `);

  database.exec("BEGIN");
  try {
    indicators.forEach((item) => {
      stmt.run(
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
      );
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return indicators.length;
}

function readIndicators(limit = 240) {
  const stmt = getDb().prepare(`
    SELECT *
    FROM draw_indicators
    ORDER BY CAST(issue AS INTEGER) DESC
    LIMIT ?
  `);
  return stmt.all(limit).map(rowToIndicator);
}

function readIndicatorIssues() {
  return new Set(getDb().prepare("SELECT issue FROM draw_indicators").all().map((row) => row.issue));
}

function databasePath() {
  return path.resolve(SQLITE_FILE);
}

function closeDb() {
  if (!db) return;
  try {
    // SQLite WAL 模式下 close 前做一次 checkpoint，避免遗留 WAL 文件被认为损坏
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {}
  try {
    db.close();
  } catch {}
  db = null;
}

module.exports = {
  appendRecords,
  closeDb,
  countRecords,
  databasePath,
  getDb,
  readDraws,
  readIndicatorIssues,
  readIndicators,
  readRecords,
  upsertDraws,
  upsertIndicators
};
