import { analyze, getDrawShape, scoreHit, ticketFitness } from "./analysis.js";

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

export function generateTicket(analysisResult, kind = "balanced", community = null) {
  let redWeights = kind === "community" ? buildCommunityWeights(analysisResult.redStats, community) : buildWeights(analysisResult.redStats, kind);
  const blueWeights = buildWeights(analysisResult.blueStats, kind === "community" ? "balanced" : kind);

  if (kind === "community" && community?.aggregate?.[0]) {
    const top = community.aggregate[0];
    return {
      reds: top.reds,
      blue: top.blue,
      kind,
      score: ticketFitness(top.reds, top.blue),
      reason: `来自社区共振 ${top.count} 次，来源 ${top.sources.slice(0, 2).join(" / ")}`
    };
  }

  let best = null;
  let bestScore = -1;
  let bestBlue = "01";
  for (let attempt = 0; attempt < 220; attempt += 1) {
    const used = new Set();
    while (used.size < 6) {
      used.add(weightedPick(redWeights, used).number);
    }
    const reds = Array.from(used).sort((x, y) => Number(x) - Number(y));
    const blue = weightedPick(blueWeights).number;
    const score = ticketFitness(reds, blue);
    if (score > bestScore) {
      best = reds;
      bestBlue = blue;
      bestScore = score;
    }
    if (score >= 14) break;
  }

  const shape = getDrawShape({ red: best, blue: bestBlue });
  return {
    reds: best,
    blue: bestBlue,
    kind,
    score: bestScore,
    reason: `和值 ${shape.sum}，奇偶 ${shape.odd}:${shape.even}，跨度 ${shape.span}，AC ${shape.ac}`
  };
}

function deterministicTicketFromWindow(history, kind, community = null) {
  const snapshot = analyze(history);
  const redStats = snapshot.redStats;
  const blueStats = snapshot.blueStats;

  // 社区策略：若窗口中能拿到聚合票，直接复用其红蓝球
  if (kind === "community" && community?.aggregate?.[0]?.reds?.length === 6) {
    const top = community.aggregate[0];
    return {
      reds: [...top.reds].sort((a, b) => Number(a) - Number(b)),
      blue: top.blue
    };
  }

  let rankedReds;
  if (kind === "hot") rankedReds = [...redStats].sort((a, b) => b.recent - a.recent || b.freq - a.freq);
  else if (kind === "cold") rankedReds = [...redStats].sort((a, b) => b.miss - a.miss || b.freq - a.freq);
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

  // blue 策略给蓝球加重 recent + miss 权重，cold 用纯遗漏
  let blueRank;
  if (kind === "cold") {
    blueRank = [...blueStats].sort((a, b) => b.miss - a.miss || b.score - a.score);
  } else if (kind === "blue") {
    blueRank = [...blueStats].sort(
      (a, b) => b.recent - a.recent || b.miss - a.miss || b.score - a.score
    );
  } else {
    blueRank = [...blueStats].sort((a, b) => b.score - a.score);
  }
  return {
    reds: reds.sort((a, b) => Number(a) - Number(b)),
    blue: blueRank[0]?.number || "01"
  };
}

export function runBacktestData(draws, kind, community = null) {
  if (!draws.length) return { results: [], totalRed: 0, blueHits: 0, strongHits: 0, best: null, avgRed: "0.00", blueRate: 0 };
  const sampleSize = Math.min(80, Math.max(12, draws.length - 35));
  const results = [];
  let totalRed = 0;
  let blueHits = 0;

  for (let index = sampleSize - 1; index >= 0; index -= 1) {
    const target = draws[index];
    const history = draws.slice(index + 1);
    if (history.length < 30) continue;
    const ticket = deterministicTicketFromWindow(history, kind, community);
    const hit = scoreHit(ticket, target);
    totalRed += hit.redHits;
    blueHits += hit.blueHit;
    results.push({ issue: target.issue, ...hit });
  }

  const best = [...results].sort((a, b) => b.redHits + b.blueHit * 1.2 - (a.redHits + a.blueHit * 1.2))[0];
  const strongHits = results.filter((item) => item.redHits >= 4 || (item.redHits >= 3 && item.blueHit)).length;
  return {
    results,
    totalRed,
    blueHits,
    strongHits,
    best,
    avgRed: results.length ? (totalRed / results.length).toFixed(2) : "0.00",
    blueRate: results.length ? Math.round((blueHits / results.length) * 100) : 0
  };
}
