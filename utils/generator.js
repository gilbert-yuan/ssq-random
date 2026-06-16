import { analyze, getDrawShape, percentileRank, scoreHit, ticketFitness } from "./analysis.js";

function weightedPick(items, used = new Set()) {
  const available = items.filter((item) => !used.has(item.number));
  const total = available.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of available) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return available[available.length - 1];
}

function buildWeights(stats, kind) {
  const maxFreq = Math.max(1, ...stats.map((item) => item.freq));
  const maxRecent = Math.max(1, ...stats.map((item) => item.recent));
  const maxMiss = Math.max(1, ...stats.map((item) => item.miss));
  const maxDecay = Math.max(1, ...stats.map((item) => item.decay || 0));
  return stats.map((item) => {
    const hot = item.freq / maxFreq;
    const recent = item.recent / maxRecent;
    const miss = item.miss / maxMiss;
    const decay = (item.decay || 0) / maxDecay;
    const trend = Math.max(0, item.trend || 0);
    let base = 1 + hot * 1.8 + recent * 2.2 + decay * 2 + miss * 1.8 + trend;
    if (kind === "hot") base = 1 + hot * 4.8 + recent * 2.4 + decay * 1.8;
    if (kind === "cold") base = 1 + miss * 5.6 + hot * 0.8 + trend * 0.8;
    if (kind === "blue") base = 1 + recent * 3.2 + miss * 1.6 + hot * 1.3 + decay * 2.2;
    return { ...item, weight: Math.max(0.1, Number(base.toFixed(4))) };
  });
}

function communityBias(number, community) {
  const aggregate = community?.aggregate || [];
  let score = 0;
  aggregate.forEach((item, index) => {
    if (item.reds.includes(number)) score += Math.max(1, 8 - index) * item.count;
  });
  return score;
}

function buildCommunityWeights(stats, community) {
  const base = buildWeights(stats, "balanced");
  const maxBias = Math.max(1, ...base.map((item) => communityBias(item.number, community)));
  return base.map((item) => ({
    ...item,
    weight: item.weight + (communityBias(item.number, community) / maxBias) * 5
  }));
}

function shapePercentiles(shape, analysisResult) {
  const shapes = analysisResult.shapes || [];
  return {
    sum: percentileRank(shapes.map((item) => item.sum), shape.sum),
    span: percentileRank(shapes.map((item) => item.span), shape.span),
    ac: percentileRank(shapes.map((item) => item.ac), shape.ac),
    odd: percentileRank(shapes.map((item) => item.odd), shape.odd),
    big: percentileRank(shapes.map((item) => item.big), shape.big)
  };
}

function cooccurrenceScore(reds, analysisResult) {
  const pairMap = analysisResult.features?.cooccurrence?.pairMap || {};
  const pairs = [];
  let score = 0;
  for (let i = 0; i < reds.length; i += 1) {
    for (let j = i + 1; j < reds.length; j += 1) {
      const key = `${reds[i]}-${reds[j]}`;
      const item = pairMap[key];
      if (item) {
        score += item.score || item.count || 0;
        pairs.push(item);
      }
    }
  }
  return {
    score,
    pairs: pairs.sort((a, b) => (b.score || b.count) - (a.score || a.count)).slice(0, 3)
  };
}

function explainTicket(reds, blue, kind, analysisResult, scoreParts = {}) {
  const redStats = new Map((analysisResult.redStats || []).map((item) => [item.number, item]));
  const blueStats = new Map((analysisResult.blueStats || []).map((item) => [item.number, item]));
  const shape = getDrawShape({ red: reds, blue });
  const percentiles = shapePercentiles(shape, analysisResult);
  const co = cooccurrenceScore(reds, analysisResult);
  const coldNumbers = reds
    .map((number) => redStats.get(number))
    .filter((item) => item?.missLevel === "p75" || item?.missLevel === "p90")
    .sort((a, b) => b.miss - a.miss);
  const warmingNumbers = reds
    .map((number) => redStats.get(number))
    .filter((item) => (item?.trend || 0) > 0)
    .sort((a, b) => (b.trend || 0) - (a.trend || 0));
  const blueStat = blueStats.get(blue);
  const tags = [
    kind === "cold" ? "冷号补位" : kind === "hot" ? "热号追踪" : kind === "blue" ? "蓝球重点" : kind === "community" ? "社区共振" : "均衡趋势",
    coldNumbers.length ? `${coldNumbers.length} 个长遗漏` : "遗漏适中",
    co.pairs.length ? "有历史共现" : "组合分散",
    percentiles.sum >= 20 && percentiles.sum <= 85 ? "和值常见区间" : "和值边缘",
    shape.consecutive <= 2 ? "连号受控" : "连号偏多"
  ];
  const reasons = [
    coldNumbers.length
      ? `冷号补位：${coldNumbers.map((item) => `${item.number}(遗漏${item.miss})`).join("、")}`
      : "冷号补位：未强行堆叠极端遗漏号",
    warmingNumbers.length
      ? `多窗口热度：${warmingNumbers.slice(0, 3).map((item) => `${item.number}(近10趋势${item.trend > 0 ? "+" : ""}${item.trend})`).join("、")}`
      : "多窗口热度：整体偏稳，没有明显短窗过热",
    co.pairs.length
      ? `共现参考：${co.pairs.map((item) => `${item.pair.join("-")}(${item.count})`).join("、")}`
      : "共现参考：未依赖高频搭档，组合更分散",
    `形态位置：和值${shape.sum}(P${percentiles.sum})、跨度${shape.span}(P${percentiles.span})、AC${shape.ac}(P${percentiles.ac})`,
    `蓝球依据：${blue} 近期${blueStat?.recent || 0}次，遗漏${blueStat?.miss ?? "--"}期`
  ];
  return {
    tags,
    reasons,
    shape,
    percentiles,
    coldNumbers: coldNumbers.map((item) => item.number),
    cooccurrencePairs: co.pairs,
    scoreParts
  };
}

function evaluateTicket(reds, blue, redWeights, analysisResult, previousTickets = []) {
  const shapeScore = ticketFitness(reds, blue);
  const weightMap = new Map(redWeights.map((item) => [item.number, item.weight]));
  const statMap = new Map((analysisResult.redStats || []).map((item) => [item.number, item]));
  const weightScore = reds.reduce((sum, item) => sum + (weightMap.get(item) || 0), 0);
  const coldScore = reds.reduce((sum, item) => {
    const stat = statMap.get(item);
    if (!stat) return sum;
    if (stat.missLevel === "p90") return sum + 2.2;
    if (stat.missLevel === "p75") return sum + 1.2;
    return sum + Math.min(stat.miss / Math.max(1, analysisResult.features?.missQuantiles?.p75 || 1), 1) * 0.5;
  }, 0);
  const coScore = Math.min(6, cooccurrenceScore(reds, analysisResult).score / 3);
  const diversityPenalty = previousTickets.reduce((penalty, ticket) => {
    const overlap = ticket.reds.filter((number) => reds.includes(number)).length;
    return penalty + Math.max(0, overlap - 2) * 2;
  }, 0);
  const shape = getDrawShape({ red: reds, blue });
  const sumCenterPenalty = Math.abs(shape.sum - 102) * 0.04;
  const scoreParts = {
    weight: Number(weightScore.toFixed(2)),
    shape: shapeScore,
    cold: Number(coldScore.toFixed(2)),
    cooccurrence: Number(coScore.toFixed(2)),
    diversityPenalty: Number(diversityPenalty.toFixed(2)),
    sumPenalty: Number(sumCenterPenalty.toFixed(2))
  };
  const score = shapeScore * 4 + weightScore + coldScore + coScore - diversityPenalty - sumCenterPenalty;
  return { score, scoreParts };
}

export function generateTicket(analysisResult, kind = "cold", community = null, options = {}) {
  const previousTickets = options.previousTickets || [];
  const redWeights = kind === "community" ? buildCommunityWeights(analysisResult.redStats, community) : buildWeights(analysisResult.redStats, kind);
  const blueWeights = buildWeights(analysisResult.blueStats, kind === "community" ? "balanced" : kind);

  if (kind === "community" && community?.aggregate?.[0]) {
    const top = community.aggregate[0];
    const scoreParts = { weight: 0, shape: ticketFitness(top.reds, top.blue), cold: 0, cooccurrence: 0, diversityPenalty: 0, sumPenalty: 0 };
    return {
      reds: top.reds,
      blue: top.blue,
      kind,
      score: ticketFitness(top.reds, top.blue),
      reason: `来自社区共振 ${top.count} 次，来源 ${top.sources.slice(0, 2).join(" / ")}`,
      explanation: explainTicket(top.reds, top.blue, kind, analysisResult, scoreParts)
    };
  }

  let best = null;
  let bestScore = -Infinity;
  let bestBlue = "01";
  let bestParts = null;
  for (let attempt = 0; attempt < 260; attempt += 1) {
    const used = new Set();
    while (used.size < 6) {
      used.add(weightedPick(redWeights, used).number);
    }
    const reds = Array.from(used).sort((x, y) => Number(x) - Number(y));
    const blue = weightedPick(blueWeights).number;
    const { score, scoreParts } = evaluateTicket(reds, blue, redWeights, analysisResult, previousTickets);
    if (score > bestScore) {
      best = reds;
      bestBlue = blue;
      bestScore = score;
      bestParts = scoreParts;
    }
    if (scoreParts.shape >= 14 && scoreParts.cold >= 3 && scoreParts.diversityPenalty === 0) break;
  }

  const explanation = explainTicket(best, bestBlue, kind, analysisResult, bestParts || {});
  const shape = explanation.shape;
  return {
    reds: best,
    blue: bestBlue,
    kind,
    score: Number(bestScore.toFixed(1)),
    reason: `和值 ${shape.sum}，奇偶 ${shape.odd}:${shape.even}，跨度 ${shape.span}，AC ${shape.ac}；${explanation.reasons[0]}`,
    explanation
  };
}

function deterministicTicketFromWindow(history, kind = "cold", community = null) {
  const snapshot = analyze(history);
  const redStats = snapshot.redStats;
  const blueStats = snapshot.blueStats;

  if (kind === "community" && community?.aggregate?.[0]?.reds?.length === 6) {
    const top = community.aggregate[0];
    return {
      reds: [...top.reds].sort((a, b) => Number(a) - Number(b)),
      blue: top.blue
    };
  }

  let rankedReds;
  if (kind === "hot") rankedReds = [...redStats].sort((a, b) => b.recent - a.recent || b.freq - a.freq);
  else if (kind === "cold") rankedReds = [...redStats].sort((a, b) => b.miss - a.miss || b.score - a.score);
  else rankedReds = [...redStats].sort((a, b) => b.score - a.score);

  const reds = [];
  for (const item of rankedReds) {
    const next = [...reds, item.number].sort((a, b) => Number(a) - Number(b));
    if (next.length <= 6 && ticketFitness(next, "01") >= Math.min(8, next.length * 2)) {
      reds.push(item.number);
    } else if (reds.length < 3) {
      reds.push(item.number);
    }
    if (reds.length === 6) break;
  }

  while (reds.length < 6) {
    const candidate = rankedReds.find((item) => !reds.includes(item.number));
    if (!candidate) break;
    reds.push(candidate.number);
  }

  let blueRank;
  if (kind === "cold") {
    blueRank = [...blueStats].sort((a, b) => b.miss - a.miss || b.score - a.score);
  } else if (kind === "blue") {
    blueRank = [...blueStats].sort((a, b) => b.recent - a.recent || b.miss - a.miss || b.score - a.score);
  } else {
    blueRank = [...blueStats].sort((a, b) => b.score - a.score);
  }
  return {
    reds: reds.sort((a, b) => Number(a) - Number(b)),
    blue: blueRank[0]?.number || "01"
  };
}

function randomTicketFromWindow(history, seedIndex = 0) {
  const redPool = Array.from({ length: 33 }, (_, index) => String(index + 1).padStart(2, "0"));
  const bluePool = Array.from({ length: 16 }, (_, index) => String(index + 1).padStart(2, "0"));
  const used = new Set();
  let cursor = (history.length * 17 + seedIndex * 31) % redPool.length;
  while (used.size < 6) {
    cursor = (cursor * 7 + 11) % redPool.length;
    used.add(redPool[cursor]);
  }
  return {
    reds: Array.from(used).sort((a, b) => Number(a) - Number(b)),
    blue: bluePool[(history.length * 13 + seedIndex * 5) % bluePool.length]
  };
}

function frequencyTicketFromWindow(history) {
  const snapshot = analyze(history);
  const reds = [...snapshot.redStats]
    .sort((a, b) => b.freq - a.freq || b.recent - a.recent || Number(a.number) - Number(b.number))
    .slice(0, 6)
    .map((item) => item.number)
    .sort((a, b) => Number(a) - Number(b));
  const blue = [...snapshot.blueStats].sort((a, b) => b.freq - a.freq || b.recent - a.recent || Number(a.number) - Number(b.number))[0]?.number || "01";
  return { reds, blue };
}

function summarizeBacktest(results) {
  const totalRed = results.reduce((sum, item) => sum + item.redHits, 0);
  const blueHits = results.reduce((sum, item) => sum + item.blueHit, 0);
  const best = [...results].sort((a, b) => b.redHits + b.blueHit * 1.2 - (a.redHits + a.blueHit * 1.2))[0] || null;
  const strongHits = results.filter((item) => item.redHits >= 4 || (item.redHits >= 3 && item.blueHit)).length;
  const distribution = results.reduce((acc, item) => {
    acc[item.redHits] = (acc[item.redHits] || 0) + 1;
    return acc;
  }, {});
  return {
    results,
    totalRed,
    blueHits,
    strongHits,
    best,
    distribution,
    avgRed: results.length ? (totalRed / results.length).toFixed(2) : "0.00",
    blueRate: results.length ? Math.round((blueHits / results.length) * 100) : 0
  };
}

function runBacktestFor(draws, picker, sampleSize) {
  const results = [];
  for (let index = sampleSize - 1; index >= 0; index -= 1) {
    const target = draws[index];
    const history = draws.slice(index + 1);
    if (history.length < 30) continue;
    const ticket = picker(history, index);
    const hit = scoreHit(ticket, target);
    results.push({ issue: target.issue, ...hit });
  }
  return summarizeBacktest(results);
}

export function runBacktestData(draws, kind = "cold", community = null) {
  if (!draws.length) {
    return { results: [], totalRed: 0, blueHits: 0, strongHits: 0, best: null, avgRed: "0.00", blueRate: 0, baselines: {} };
  }
  const sampleSize = Math.min(80, Math.max(12, draws.length - 35));
  const strategy = runBacktestFor(draws, (history) => deterministicTicketFromWindow(history, kind, community), sampleSize);
  const random = runBacktestFor(draws, (history, index) => randomTicketFromWindow(history, index), sampleSize);
  const frequency = runBacktestFor(draws, (history) => frequencyTicketFromWindow(history), sampleSize);
  const checked = strategy.results.length;
  const range = checked
    ? {
        fromIssue: strategy.results[strategy.results.length - 1]?.issue || "",
        toIssue: strategy.results[0]?.issue || "",
        checked,
        trainingWindow: "滚动历史 ≥30 期",
        sampleSize
      }
    : { fromIssue: "", toIssue: "", checked: 0, trainingWindow: "滚动历史 ≥30 期", sampleSize };
  return {
    ...strategy,
    baselines: {
      random,
      frequency
    },
    lift: {
      avgRedVsRandom: Number((Number(strategy.avgRed) - Number(random.avgRed)).toFixed(2)),
      avgRedVsFrequency: Number((Number(strategy.avgRed) - Number(frequency.avgRed)).toFixed(2)),
      blueRateVsRandom: strategy.blueRate - random.blueRate,
      blueRateVsFrequency: strategy.blueRate - frequency.blueRate,
      strongHitsVsRandom: strategy.strongHits - random.strongHits,
      strongHitsVsFrequency: strategy.strongHits - frequency.strongHits
    },
    range,
    riskNote: "回测只说明历史样本内相对表现，不能代表未来开奖概率。"
  };
}
