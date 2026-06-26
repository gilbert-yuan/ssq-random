const { globalCache } = require("../cache");
const { query } = require("./pool");

const INDICATOR_CACHE_TTL = 5 * 60 * 1000;

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

async function upsertIndicators(indicators) {
  if (!indicators.length) return 0;
  const now = new Date().toISOString();
  const colCount = 34;
  const values = [];
  const placeholders = [];

  for (let i = 0; i < indicators.length; i++) {
    const item = indicators[i];
    const offset = i * colCount;
    const ph = Array.from({ length: colCount }, (_, j) => `$${offset + j + 1}`).join(", ");
    placeholders.push(`(${ph})`);
    values.push(
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
  }

  await query(
    `INSERT INTO draw_indicators (
      issue, draw_date, sum_value, span_value, odd_count, even_count, big_count,
      small_count, prime_count, composite_count, zone_low, zone_mid, zone_high,
      mod0, mod1, mod2, consecutive_count, ac_value, repeat_count, blue_odd,
      hot_count, warm_count, cold_count, hot_ratio, cold_ratio, sum_type,
      parity_type, size_type, zone_type, hot_cold_type, type_label,
      regression_sum, regression_residual, updated_at
    )
    VALUES ${placeholders.join(", ")}
    ON CONFLICT(issue) DO UPDATE SET
      draw_date = EXCLUDED.draw_date,
      sum_value = EXCLUDED.sum_value, span_value = EXCLUDED.span_value,
      odd_count = EXCLUDED.odd_count, even_count = EXCLUDED.even_count,
      big_count = EXCLUDED.big_count, small_count = EXCLUDED.small_count,
      prime_count = EXCLUDED.prime_count, composite_count = EXCLUDED.composite_count,
      zone_low = EXCLUDED.zone_low, zone_mid = EXCLUDED.zone_mid, zone_high = EXCLUDED.zone_high,
      mod0 = EXCLUDED.mod0, mod1 = EXCLUDED.mod1, mod2 = EXCLUDED.mod2,
      consecutive_count = EXCLUDED.consecutive_count, ac_value = EXCLUDED.ac_value,
      repeat_count = EXCLUDED.repeat_count, blue_odd = EXCLUDED.blue_odd,
      hot_count = EXCLUDED.hot_count, warm_count = EXCLUDED.warm_count, cold_count = EXCLUDED.cold_count,
      hot_ratio = EXCLUDED.hot_ratio, cold_ratio = EXCLUDED.cold_ratio,
      sum_type = EXCLUDED.sum_type, parity_type = EXCLUDED.parity_type,
      size_type = EXCLUDED.size_type, zone_type = EXCLUDED.zone_type,
      hot_cold_type = EXCLUDED.hot_cold_type, type_label = EXCLUDED.type_label,
      regression_sum = EXCLUDED.regression_sum, regression_residual = EXCLUDED.regression_residual,
      updated_at = EXCLUDED.updated_at`,
    values
  );
  globalCache.invalidatePrefix("indicators:");
  return indicators.length;
}

async function readIndicators(limit = 240) {
  const cacheKey = `indicators:${limit}`;
  const cached = globalCache.get(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT * FROM draw_indicators ORDER BY issue::BIGINT DESC LIMIT $1`,
    [limit]
  );
  const indicators = result.rows.map(rowToIndicator);
  globalCache.set(cacheKey, indicators, INDICATOR_CACHE_TTL);
  return indicators;
}

async function readIndicatorIssues() {
  const result = await query("SELECT issue FROM draw_indicators");
  return new Set(result.rows.map((row) => row.issue));
}

module.exports = {
  readIndicatorIssues,
  readIndicators,
  upsertIndicators
};
