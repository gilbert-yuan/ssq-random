export function enrichSumSeries(series, window = 20, alpha = 0.2) {
  if (!series?.length) return [];
  const ordered = [...series].reverse();
  let emaPrev = null;
  const enriched = ordered.map((item, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = ordered.slice(start, index + 1).map((row) => Number(row.sum));
    const mean = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    const ema = emaPrev == null ? Number(item.sum) : alpha * Number(item.sum) + (1 - alpha) * emaPrev;
    emaPrev = ema;
    return {
      ...item,
      sumMean: Number(mean.toFixed(2)),
      sumStd: Number(std.toFixed(2)),
      sumUpper: Number((mean + std).toFixed(2)),
      sumLower: Number((mean - std).toFixed(2)),
      sumEma: Number(ema.toFixed(2))
    };
  });
  return enriched.reverse();
}
