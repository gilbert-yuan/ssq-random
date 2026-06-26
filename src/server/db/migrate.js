const { getPool } = require("./pool");

let migrationPromise;

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

async function migrate() {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const dbClient = await getPool().connect();
    try {
      await dbClient.query("BEGIN");
      await dbClient.query(`
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

        CREATE TABLE IF NOT EXISTS community_snapshots (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          sources_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          recommendations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          aggregate_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          source_scores_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          count_value INTEGER NOT NULL DEFAULT 0,
          fetched_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
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

      await ensureColumn(dbClient, "records", "user_id", "TEXT NOT NULL DEFAULT 'default'");
      await ensureColumn(dbClient, "records", "pinned_at", "TIMESTAMPTZ");
      await dbClient.query(`
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
        CREATE INDEX IF NOT EXISTS idx_community_snapshots_updated
          ON community_snapshots (updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_draws_issue_order
          ON draws ((issue::BIGINT) DESC);
        CREATE INDEX IF NOT EXISTS idx_indicators_issue_order
          ON draw_indicators ((issue::BIGINT) DESC);
      `);
      await dbClient.query("COMMIT");
    } catch (error) {
      await dbClient.query("ROLLBACK");
      migrationPromise = null;
      throw error;
    } finally {
      dbClient.release();
    }
  })();
  return migrationPromise;
}

function resetMigration() {
  migrationPromise = null;
}

module.exports = {
  migrate,
  resetMigration
};
