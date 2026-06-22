const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);

export function pct(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mode(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0];
}

export function sortReds(reds) {
  return reds.map(Number).sort((a, b) => a - b);
}

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function drawKey(ticket) {
  return `${ticket.reds.join(",")}+${ticket.blue}`;
}

export function getDrawShape(draw, previousDraw = null) {
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

function normalizeScore(value, max) {
  return max ? Number((value / max).toFixed(4)) : 0;
}

function windowKey(size) {
  return `w${size}`;
}

export function makeNumberStats(size, draws, picker, recentSize = 30, windows = [10, 30, 60]) {
  const stats = Array.from({ length: size }, (_, index) => ({
    number: pad(index + 1),
    value: index + 1,
    freq: 0,
    recent: 0,
    miss: draws.length,
    lastIndex: -1,
    score: 0,
    windowHits: Object.fromEntries(windows.map((window) => [windowKey(window), 0])),
    decay: 0,
    decayScore: 0,
    trend: 0
  }));

  draws.forEach((draw, index) => {
    const values = picker(draw).map(Number);
    values.forEach((value) => {
      const item = stats[value - 1];
      if (!item) return;
      item.freq += 1;
      if (index < recentSize) item.recent += 1;
      windows.forEach((window) => {
        if (index < window) item.windowHits[windowKey(window)] += 1;
      });
      item.decay += Math.exp(-index / 24);
      if (item.lastIndex === -1) {
        item.lastIndex = index;
        item.miss = index;
      }
    });
  });

  const maxFreq = Math.max(1, ...stats.map((item) => item.freq));
  const maxRecent = Math.max(1, ...stats.map((item) => item.recent));
  const maxMiss = Math.max(1, ...stats.map((item) => item.miss));
  const maxDecay = Math.max(1, ...stats.map((item) => item.decay));
  stats.forEach((item) => {
    const hot = item.freq / maxFreq;
    const recent = item.recent / maxRecent;
    const omission = Math.min(item.miss / maxMiss, 1);
    const decay = item.decay / maxDecay;
    const shortHot = normalizeScore(item.windowHits.w10 || 0, Math.min(10, draws.length));
    const longHot = normalizeScore(item.windowHits.w60 || 0, Math.min(60, draws.length));
    item.decayScore = Number(decay.toFixed(4));
    item.trend = Number((shortHot - longHot).toFixed(4));
    item.score = hot * 0.34 + recent * 0.28 + decay * 0.22 + omission * 0.16;
  });

  return stats;
}

export function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function percentileRank(values, value) {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length || !Number.isFinite(Number(value))) return 0;
  const lowerOrEqual = numeric.filter((item) => item <= Number(value)).length;
  return Math.round((lowerOrEqual / numeric.length) * 100);
}

function distributionSummary(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) {
    return { min: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, max: 0, average: 0 };
  }
  return {
    min: Math.min(...numeric),
    p10: Number(quantile(numeric, 0.1).toFixed(2)),
    p25: Number(quantile(numeric, 0.25).toFixed(2)),
    p50: Number(quantile(numeric, 0.5).toFixed(2)),
    p75: Number(quantile(numeric, 0.75).toFixed(2)),
    p90: Number(quantile(numeric, 0.9).toFixed(2)),
    max: Math.max(...numeric),
    average: Number(mean(numeric).toFixed(2))
  };
}

export function shannonEntropy(counts) {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  return -counts.reduce((acc, count) => {
    if (count <= 0) return acc;
    const p = count / total;
    return acc + p * Math.log2(p);
  }, 0);
}

function missTier(miss, quantiles) {
  if (miss >= quantiles.p90) return "p90";
  if (miss >= quantiles.p75) return "p75";
  return "normal";
}

function makeCooccurrence(draws, window = 80) {
  const pairMap = {};
  const partnerMap = new Map();
  draws.slice(0, window).forEach((draw, index) => {
    const reds = [...draw.red].sort((a, b) => Number(a) - Number(b));
    const recentWeight = index < 30 ? 2 : 1;
    for (let i = 0; i < reds.length; i += 1) {
      for (let j = i + 1; j < reds.length; j += 1) {
        const a = reds[i];
        const b = reds[j];
        const key = `${a}-${b}`;
        const current = pairMap[key] || { pair: [a, b], count: 0, recent: 0, score: 0 };
        current.count += 1;
        current.recent += index < 30 ? 1 : 0;
        current.score += recentWeight;
        pairMap[key] = current;
        [
          [a, b],
          [b, a]
        ].forEach(([number, partner]) => {
          if (!partnerMap.has(number)) partnerMap.set(number, new Map());
          const partners = partnerMap.get(number);
          const item = partners.get(partner) || { number: partner, count: 0, recent: 0, score: 0 };
          item.count += 1;
          item.recent += index < 30 ? 1 : 0;
          item.score += recentWeight;
          partners.set(partner, item);
        });
      }
    }
  });

  const topPairs = Object.values(pairMap).sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 20);
  const partners = {};
  partnerMap.forEach((value, key) => {
    partners[key] = Array.from(value.values()).sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 5);
  });
  return { window, topPairs, pairMap, partners };
}

function makeShapeRanges(shapes) {
  return {
    sum: distributionSummary(shapes.map((shape) => shape.sum)),
    span: distributionSummary(shapes.map((shape) => shape.span)),
    ac: distributionSummary(shapes.map((shape) => shape.ac)),
    odd: distributionSummary(shapes.map((shape) => shape.odd)),
    big: distributionSummary(shapes.map((shape) => shape.big)),
    consecutive: distributionSummary(shapes.map((shape) => shape.consecutive)),
    repeat: distributionSummary(shapes.map((shape) => shape.repeat))
  };
}

export function analyze(draws) {
  const recentWindow = Math.min(30, draws.length);
  const recentDraws = draws.slice(0, recentWindow);
  const redStats = makeNumberStats(33, draws, (draw) => draw.red, recentWindow);
  const blueStats = makeNumberStats(16, draws, (draw) => [draw.blue], recentWindow);
  const shapes = draws.map((draw, index) => getDrawShape(draw, draws[index + 1]));
  const recentShapes = shapes.slice(0, recentWindow);
  const sums = shapes.map((shape) => shape.sum);
  const spans = shapes.map((shape) => shape.span);
  const acValues = shapes.map((shape) => shape.ac);
  const zones = [0, 0, 0];
  const mod012 = [0, 0, 0];
  const parity = { odd: 0, even: 0 };
  const size = { big: 0, small: 0 };
  const prime = { prime: 0, composite: 0 };
  const blueOddEven = { odd: 0, even: 0 };

  recentShapes.forEach((shape) => {
    shape.zones.forEach((value, index) => (zones[index] += value));
    shape.mod012.forEach((value, index) => (mod012[index] += value));
    parity.odd += shape.odd;
    parity.even += shape.even;
    size.big += shape.big;
    size.small += shape.small;
    prime.prime += shape.prime;
    prime.composite += shape.composite;
    if (shape.blueOdd) blueOddEven.odd += 1;
    else blueOddEven.even += 1;
  });

  const missValues = redStats.map((item) => item.miss);
  const missP50 = Math.round(quantile(missValues, 0.5));
  const missP75 = Math.round(quantile(missValues, 0.75));
  const missP90 = Math.round(quantile(missValues, 0.9));
  const missQuantiles = { p50: missP50, p75: missP75, p90: missP90 };
  const annotateMiss = (item) => ({ ...item, missLevel: missTier(item.miss, missQuantiles) });
  const hotReds = [...redStats].sort((a, b) => b.freq - a.freq).slice(0, 8).map(annotateMiss);
  const trendReds = [...redStats].sort((a, b) => b.score - a.score).slice(0, 10).map(annotateMiss);
  const coldReds = [...redStats].sort((a, b) => b.miss - a.miss).slice(0, 8).map(annotateMiss);
  const missAlerts = redStats
    .filter((item) => item.miss >= missP75)
    .sort((a, b) => b.miss - a.miss)
    .map(annotateMiss);
  const hotBlues = [...blueStats].sort((a, b) => b.score - a.score).slice(0, 5);

  const redEntropy = shannonEntropy(redStats.map((item) => item.recent));
  const blueEntropy = shannonEntropy(blueStats.map((item) => item.recent));
  const redEntropyMax = Math.log2(33);
  const blueEntropyMax = Math.log2(16);
  const shapeRanges = makeShapeRanges(recentShapes.length ? recentShapes : shapes);
  const cooccurrence = makeCooccurrence(draws, 80);

  return {
    count: draws.length,
    recentWindow,
    recentDraws,
    redStats: redStats.map(annotateMiss),
    blueStats,
    shapes,
    hotReds,
    trendReds,
    coldReds,
    hotBlues,
    missAlerts,
    missQuantiles,
    entropy: {
      red: Number(redEntropy.toFixed(3)),
      redMax: Number(redEntropyMax.toFixed(3)),
      redRatio: redEntropyMax ? Number((redEntropy / redEntropyMax).toFixed(3)) : 0,
      blue: Number(blueEntropy.toFixed(3)),
      blueMax: Number(blueEntropyMax.toFixed(3)),
      blueRatio: blueEntropyMax ? Number((blueEntropy / blueEntropyMax).toFixed(3)) : 0
    },
    sum: {
      average: Math.round(mean(sums)),
      median: Math.round(median(sums)),
      recentAverage: Math.round(mean(recentShapes.map((shape) => shape.sum))),
      min: sums.length ? Math.min(...sums) : 0,
      max: sums.length ? Math.max(...sums) : 0
    },
    shape: {
      zones,
      parity,
      size,
      prime,
      mod012,
      blueOddEven,
      consecutiveAverage: mean(recentShapes.map((shape) => shape.consecutive)),
      adjacentAverage: mean(recentShapes.map((shape) => shape.adjacent)),
      sameTailAverage: mean(recentShapes.map((shape) => shape.sameTail)),
      repeatAverage: mean(recentShapes.map((shape) => shape.repeat)),
      spanAverage: Math.round(mean(spans)),
      acAverage: Number(mean(acValues).toFixed(1)),
      common012: mode(recentShapes.map((shape) => shape.mod012.join(":")))
    },
    features: {
      windows: [10, 30, 60],
      missQuantiles,
      cooccurrence,
      shapeRanges,
      predictionBias: "cold",
      riskNote: "彩票开奖结果具有强随机性，以下分析只反映历史样本结构，不代表未来必然命中。"
    }
  };
}

export function ticketFitness(reds, blue = "01") {
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

export function scoreHit(ticket, draw) {
  const reds = new Set(ticket.reds);
  const redHits = draw.red.filter((item) => reds.has(item)).length;
  const blueHit = ticket.blue === draw.blue ? 1 : 0;
  return { redHits, blueHit, key: `${redHits}+${blueHit}` };
}
