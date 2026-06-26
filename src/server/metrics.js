const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mode(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0];
}

function sortReds(reds) {
  return reds.map(Number).sort((a, b) => a - b);
}

function getDrawShape(draw, previousDraw = null) {
  const nums = sortReds(draw.red);
  const sum = nums.reduce((total, value) => total + value, 0);
  const odd = nums.filter((value) => value % 2).length;
  const big = nums.filter((value) => value >= 17).length;
  const prime = nums.filter((value) => primes.has(value)).length;
  const zones = [0, 0, 0];
  const mod012 = [0, 0, 0];
  let consecutive = 0;
  let adjacent = 0;
  const distances = new Set();
  const tails = new Map();

  nums.forEach((value, index) => {
    if (value <= 11) zones[0] += 1;
    else if (value <= 22) zones[1] += 1;
    else zones[2] += 1;
    mod012[value % 3] += 1;
    if (index && value - nums[index - 1] === 1) consecutive += 1;
    if (index && value - nums[index - 1] <= 2) adjacent += 1;
    const tail = value % 10;
    tails.set(tail, (tails.get(tail) || 0) + 1);
  });

  let sameTail = 0;
  tails.forEach((count) => {
    if (count >= 2) sameTail += count - 1;
  });

  for (let i = 0; i < nums.length; i += 1) {
    for (let j = i + 1; j < nums.length; j += 1) {
      distances.add(nums[j] - nums[i]);
    }
  }

  const previousSet = new Set(previousDraw ? previousDraw.red.map(Number) : []);
  const repeat = nums.filter((value) => previousSet.has(value)).length;

  return {
    sum,
    span: nums[nums.length - 1] - nums[0],
    odd,
    even: 6 - odd,
    big,
    small: 6 - big,
    prime,
    composite: 6 - prime,
    zones,
    mod012,
    consecutive,
    adjacent,
    sameTail,
    ac: distances.size - (nums.length - 1),
    repeat,
    blueOdd: Number(draw.blue) % 2 ? 1 : 0
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function makeNumberStats(size, draws, picker, recentSize = 30) {
  const stats = Array.from({ length: size }, (_, index) => ({
    number: pad(index + 1),
    value: index + 1,
    freq: 0,
    recent: 0,
    miss: draws.length,
    lastIndex: -1,
    score: 0
  }));

  draws.forEach((draw, index) => {
    const values = picker(draw).map(Number);
    values.forEach((value) => {
      const item = stats[value - 1];
      if (!item) return;
      item.freq += 1;
      if (index < recentSize) item.recent += 1;
      if (item.lastIndex === -1) {
        item.lastIndex = index;
        item.miss = index;
      }
    });
  });

  const maxFreq = Math.max(1, ...stats.map((item) => item.freq));
  const maxRecent = Math.max(1, ...stats.map((item) => item.recent));
  const maxMiss = Math.max(1, ...stats.map((item) => item.miss));
  stats.forEach((item) => {
    const hot = item.freq / maxFreq;
    const recent = item.recent / maxRecent;
    const omission = Math.min(item.miss / maxMiss, 1);
    item.score = hot * 0.42 + recent * 0.4 + omission * 0.18;
  });

  return stats;
}

function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, predict: values[0] || 0 };
  const xs = values.map((_, index) => index + 1);
  const xMean = mean(xs);
  const yMean = mean(values);
  const numerator = values.reduce((sum, value, index) => sum + (xs[index] - xMean) * (value - yMean), 0);
  const denominator = xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0) || 1;
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  return {
    slope,
    intercept,
    predict: intercept + slope * (n + 1)
  };
}

function classifySum(sum) {
  if (sum <= 80) return "低和值";
  if (sum <= 110) return "中和值";
  if (sum <= 135) return "高和值";
  return "极高和值";
}

function classifyParity(odd) {
  if (odd >= 5) return "偏奇";
  if (odd <= 1) return "偏偶";
  return "均衡奇偶";
}

function classifySize(big) {
  if (big >= 5) return "偏大";
  if (big <= 1) return "偏小";
  return "大小均衡";
}

function classifyZone(zones) {
  if (zones.every((value) => value >= 1)) return `三区覆盖 ${zones.join(":")}`;
  const emptyIndex = zones.findIndex((value) => value === 0);
  return `${emptyIndex + 1}区空缺 ${zones.join(":")}`;
}

function classifyHotCold(hotCount, coldCount) {
  if (hotCount >= 3) return "热号集中";
  if (coldCount >= 2) return "冷号补位";
  if (hotCount <= 1 && coldCount <= 1) return "温号分散";
  return "冷热混合";
}

function hotColdSets(history) {
  if (history.length < 8) return { hotSet: new Set(), coldSet: new Set() };
  const stats = makeNumberStats(33, history, (draw) => draw.red, Math.min(30, history.length));
  const hot = [...stats]
    .sort((a, b) => b.score - a.score || b.recent - a.recent || b.freq - a.freq)
    .slice(0, 10)
    .map((item) => item.number);
  const hotSet = new Set(hot);
  const cold = [...stats]
    .filter((item) => !hotSet.has(item.number))
    .sort((a, b) => b.miss - a.miss || a.freq - b.freq)
    .slice(0, 8)
    .map((item) => item.number);
  return { hotSet, coldSet: new Set(cold) };
}

function computeIndicators(draws, options = {}) {
  // 调用方（readDraws）保证 issue DESC，这里不再重排
  const sorted = draws;
  const skip = options.skip instanceof Set ? options.skip : null;
  const result = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const draw = sorted[index];
    if (skip && skip.has(draw.issue)) continue;
    const previousDraw = sorted[index + 1] || null;
    const history = sorted.slice(index + 1);
    const shape = getDrawShape(draw, previousDraw);
    const { hotSet, coldSet } = hotColdSets(history.slice(0, 80));
    const hotCount = draw.red.filter((item) => hotSet.has(item)).length;
    const coldCount = draw.red.filter((item) => coldSet.has(item)).length;
    const warmCount = 6 - hotCount - coldCount;
    const regressionWindow = history.slice(0, 20).reverse().map((item, offset, list) =>
      getDrawShape(item, list[offset - 1] || null).sum
    );
    const regression = linearRegression(regressionWindow);
    const regressionSum = Number((regressionWindow.length >= 3 ? regression.predict : mean(regressionWindow)).toFixed(2));
    const regressionResidual = Number((shape.sum - regressionSum).toFixed(2));
    const sumType = classifySum(shape.sum);
    const parityType = classifyParity(shape.odd);
    const sizeType = classifySize(shape.big);
    const zoneType = classifyZone(shape.zones);
    const hotColdType = classifyHotCold(hotCount, coldCount);

    result.push({
      issue: draw.issue,
      date: draw.date,
      ...shape,
      hotCount,
      warmCount,
      coldCount,
      hotRatio: Number((hotCount / 6).toFixed(3)),
      coldRatio: Number((coldCount / 6).toFixed(3)),
      sumType,
      parityType,
      sizeType,
      zoneType,
      hotColdType,
      typeLabel: `${sumType} / ${parityType} / ${hotColdType}`,
      regressionSum,
      regressionResidual
    });
  }
  return result;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
    return acc;
  }, {});
}

function backtestClassifier(rows, key, windowSize = 20) {
  const chronological = [...rows].reverse();
  let checked = 0;
  let hits = 0;
  const latest = [];

  for (let index = windowSize; index < chronological.length; index += 1) {
    const window = chronological.slice(index - windowSize, index).map((row) => row[key]);
    const predicted = mode(window);
    const actual = chronological[index][key];
    if (!predicted || !actual) continue;
    checked += 1;
    if (predicted === actual) hits += 1;
    latest.push({
      issue: chronological[index].issue,
      predicted,
      actual,
      hit: predicted === actual
    });
  }

  return {
    checked,
    hits,
    hitRate: checked ? Math.round((hits / checked) * 100) : 0,
    latest: latest.slice(-8).reverse()
  };
}

function summarizeIndicators(rows) {
  const residuals = rows.map((row) => Math.abs(row.regressionResidual)).filter(Number.isFinite);
  const within10 = residuals.filter((value) => value <= 10).length;
  const latest = rows[0] || null;
  return {
    count: rows.length,
    latest,
    classCounts: {
      sumType: countBy(rows, "sumType"),
      parityType: countBy(rows, "parityType"),
      hotColdType: countBy(rows, "hotColdType"),
      sizeType: countBy(rows, "sizeType")
    },
    regression: {
      avgAbsResidual: Number(mean(residuals).toFixed(2)),
      within10Rate: residuals.length ? Math.round((within10 / residuals.length) * 100) : 0,
      latestPrediction: latest?.regressionSum ?? null,
      latestResidual: latest?.regressionResidual ?? null
    },
    backtest: {
      sumType: backtestClassifier(rows, "sumType"),
      parityType: backtestClassifier(rows, "parityType"),
      hotColdType: backtestClassifier(rows, "hotColdType")
    }
  };
}

module.exports = {
  classifyParity,
  classifySum,
  computeIndicators,
  getDrawShape,
  linearRegression,
  makeNumberStats,
  mean,
  summarizeIndicators
};
