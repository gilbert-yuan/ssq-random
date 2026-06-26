const { DATABASE_URL, DB_SSL } = require("../config");

let PoolCtor;
let pool;

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
  return getPool().query(text, params);
}

async function withClient(run) {
  const client = await getPool().connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

function databasePath() {
  return DATABASE_URL ? DATABASE_URL.replace(/:\/\/([^:@]+):([^@]+)@/, "://$1:***@") : "";
}

async function closeDb() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  closeDb,
  databasePath,
  getPool,
  query,
  withClient
};
