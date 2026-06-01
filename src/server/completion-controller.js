const { readIndicators } = require("./database");
const { ensureStoredDraws } = require("./draw-controller");
const { readRequestBody, sendJson } = require("./http");
const { getDrawShape, makeNumberStats } = require("./metrics");
const { padBall, parseBallList } = require("./utils");

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

function percentile(rows, key, value) {
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
  if (!values.length) return 0;
  const lowerOrEqual = values.filter((item) => item <= value).length;
  return Math.round((lowerOrEqual / values.length) * 100);
}

function hotColdForTicket(reds, redStats) {
  const hotSet = new Set(
    [...redStats]
      .sort((a, b) => b.score - a.score || b.recent - a.recent || b.freq - a.freq)
      .slice(0, 10)
      .map((item) => item.number)
  );
  const coldSet = new Set(
    [...redStats]
      .filter((item) => !hotSet.has(item.number))
      .sort((a, b) => b.miss - a.miss || a.freq - b.freq)
      .slice(0, 8)
      .map((item) => item.number)
  );
  const hotCount = reds.filter((item) => hotSet.has(item)).length;
  const coldCount = reds.filter((item) => coldSet.has(item)).length;
  return {
    hotCount,
    coldCount,
    warmCount: 6 - hotCount - coldCount,
    hotRatio: Number((hotCount / 6).toFixed(3)),
    coldRatio: Number((coldCount / 6).toFixed(3))
  };
}

function chooseBlue(selectedBlue, blueWeights) {
  if (selectedBlue) return selectedBlue;
  return [...blueWeights].sort((a, b) => b.weight - a.weight || b.score - a.score)[0]?.number || "01";
}

function completeReds(selectedReds, redWeights, blue) {
  if (selectedReds.length === 6) return selectedReds;
  const selected = new Set(selectedReds);
  const weightMap = new Map(redWeights.map((item) => [item.number, item.weight]));
  const needed = 6 - selectedReds.length;
  const poolSize = selectedReds.length ? 24 : 20;
  const pool = [...redWeights]
    .filter((item) => !selected.has(item.number))
    .sort((a, b) => b.weight - a.weight || Number(a.number) - Number(b.number))
    .slice(0, poolSize)
    .map((item) => item.number);

  let best = null;
  let bestScore = -Infinity;

  function evaluate(extra) {
    const reds = [...selectedReds, ...extra].sort((a, b) => Number(a) - Number(b));
    const shape = getDrawShape({ red: reds, blue });
    const shapeScore = ticketFitness(reds, blue);
    const weightScore = reds.reduce((sum, item) => sum + (weightMap.get(item) || 0), 0);
    const sumCenterPenalty = Math.abs(shape.sum - 102) * 0.04;
    const score = shapeScore * 4 + weightScore - sumCenterPenalty;
    if (score > bestScore) {
      best = reds;
      bestScore = score;
    }
  }

  function walk(start, extra) {
    if (extra.length === needed) {
      evaluate(extra);
      return;
    }
    const remaining = needed - extra.length;
    for (let index = start; index <= pool.length - remaining; index += 1) {
      extra.push(pool[index]);
      walk(index + 1, extra);
      extra.pop();
    }
  }

  walk(0, []);
  return best || selectedReds;
}

function buildPosition(ticket, shape, indicators, redStats) {
  const hotCold = hotColdForTicket(ticket.reds, redStats);
  const sumValue = shape.sum;
  const oddValue = shape.odd;
  const bigValue = shape.big;
  const hotRatio = hotCold.hotRatio;
  const coldRatio = hotCold.coldRatio;

  return {
    markers: {
      sum: sumValue,
      odd: oddValue,
      even: shape.even,
      hotRatio,
      coldRatio
    },
    rows: [
      { label: "和值", value: sumValue, percentile: percentile(indicators, "sum", sumValue) },
      { label: "奇数个数", value: `${oddValue}: ${shape.even}`, percentile: percentile(indicators, "odd", oddValue) },
      { label: "大号个数", value: `${bigValue}: ${shape.small}`, percentile: percentile(indicators, "big", bigValue) },
      { label: "热号占比", value: `${Math.round(hotRatio * 100)}%`, percentile: percentile(indicators, "hotRatio", hotRatio) },
      { label: "冷号占比", value: `${Math.round(coldRatio * 100)}%`, percentile: percentile(indicators, "coldRatio", coldRatio) },
      { label: "跨度", value: shape.span, percentile: percentile(indicators, "span", shape.span) }
    ],
    hotCold,
    typeLabel: `${classifySum(sumValue)} / ${classifyParity(oddValue)}`
  };
}

async function handleCompleteTicket(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  const body = await readRequestBody(req);
  const payload = body ? JSON.parse(body) : {};
  const selectedReds = Array.from(new Set(parseBallList(payload.reds || payload.red || [], 33))).slice(0, 6);
  const selectedBlue = parseBallList(payload.blue || payload.blues || "", 16)[0] || "";
  const strategy = ["balanced", "hot", "cold", "community", "blue"].includes(payload.strategy)
    ? payload.strategy
    : "balanced";
  const draws = await ensureStoredDraws(240);
  const recentWindow = Math.min(30, draws.length);
  const redStats = makeNumberStats(33, draws, (draw) => draw.red, recentWindow);
  const blueStats = makeNumberStats(16, draws, (draw) => [draw.blue], recentWindow);
  const redWeights = buildWeights(redStats, strategy === "community" ? "balanced" : strategy);
  const blueWeights = buildWeights(blueStats, strategy === "community" ? "balanced" : strategy);
  const blue = chooseBlue(selectedBlue, blueWeights);
  const reds = completeReds(selectedReds, redWeights, blue);
  const shape = getDrawShape({ red: reds, blue });
  const indicators = readIndicators(240);
  const position = buildPosition({ reds, blue }, shape, indicators, redStats);

  sendJson(res, 200, {
    ok: true,
    ticket: {
      reds,
      blue,
      kind: strategy,
      score: ticketFitness(reds, blue),
      reason: `已保留 ${selectedReds.length} 个红球${selectedBlue ? "和蓝球" : ""}，按当前策略补足。`
    },
    selected: {
      reds: selectedReds,
      blue: selectedBlue
    },
    shape,
    position
  });
}

module.exports = {
  handleCompleteTicket
};
