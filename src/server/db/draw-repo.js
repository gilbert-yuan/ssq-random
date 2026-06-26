const { globalCache } = require("../cache");
const { query } = require("./pool");

const DRAW_CACHE_TTL = 5 * 60 * 1000;

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

async function upsertDraws(draws) {
  if (!draws.length) return 0;
  const now = new Date().toISOString();
  const colCount = 13;
  const values = [];
  const placeholders = [];

  for (let i = 0; i < draws.length; i++) {
    const draw = draws[i];
    const offset = i * colCount;
    const ph = Array.from({ length: colCount }, (_, j) => `$${offset + j + 1}`).join(", ");
    placeholders.push(`(${ph})`);
    values.push(
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
  }

  await query(
    `INSERT INTO draws (issue, draw_date, red1, red2, red3, red4, red5, red6, blue, sales, pool_money, source, fetched_at)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT(issue) DO UPDATE SET
       draw_date = EXCLUDED.draw_date,
       red1 = EXCLUDED.red1, red2 = EXCLUDED.red2, red3 = EXCLUDED.red3,
       red4 = EXCLUDED.red4, red5 = EXCLUDED.red5, red6 = EXCLUDED.red6,
       blue = EXCLUDED.blue, sales = EXCLUDED.sales, pool_money = EXCLUDED.pool_money,
       source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at`,
    values
  );
  globalCache.invalidatePrefix("draws:");
  return draws.length;
}

async function readDraws(limit = 240) {
  const cacheKey = `draws:${limit}`;
  const cached = globalCache.get(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT * FROM draws ORDER BY issue::BIGINT DESC LIMIT $1`,
    [limit]
  );
  const draws = result.rows.map(rowToDraw);
  globalCache.set(cacheKey, draws, DRAW_CACHE_TTL);
  return draws;
}

module.exports = {
  readDraws,
  upsertDraws
};
