const { getDrawShape } = require("./metrics");

function buildWeights(stats, kind) {
  const maxFreq = Math.max(1, ...stats.map((item) => item.freq));
  const maxRecent = Math.max(1, ...stats.map((item) => item.recent));
  const maxMiss = Math.max(1, ...stats.map((item) => item.miss));
  return stats.map((item) => {
    const hot = item.freq / maxFreq;
    const recent = item.recent / maxRecent;
    const miss = item.miss / maxMiss;
    let base = 1 + hot * 2 + recent * 3 + miss * 1.4;
    if (kind === "hot") base = 1 + hot * 5 + recent * 2;
    if (kind === "cold") base = 1 + miss * 5 + hot * 0.8;
    if (kind === "blue") base = 1 + recent * 4 + miss * 1.2 + hot * 1.5;
    return { ...item, weight: Math.max(0.1, base) };
  });
}

function ticketFitness(reds, blue = "01") {
  if (!Array.isArray(reds) || reds.length !== 6) return 0;
  if (new Set(reds).size !== 6) return 0;
  const shape = getDrawShape({ red: reds, blue });
  let score = 0;
  if (shape.sum >= 70 && shape.sum <= 135) score += 3;
  if (shape.odd >= 2 && shape.odd <= 4) score += 3;
  if (shape.big >= 2 && shape.big <= 4) score += 2;
  if (shape.zones.every((value) => value >= 1)) score += 3;
  if (shape.span >= 18 && shape.span <= 31) score += 2;
  if (shape.ac >= 5 && shape.ac <= 10) score += 2;
  if (shape.consecutive <= 2) score += 1;
  return score;
}

module.exports = {
  buildWeights,
  ticketFitness
};
