const state = {
  draws: [],
  analysis: null,
  community: null,
  tickets: [],
  favorites: [],
  records: null
};

const $ = (selector) => document.querySelector(selector);

const els = {
  limitInput: $("#limitInput"),
  fetchDrawsBtn: $("#fetchDrawsBtn"),
  generateBtn: $("#generateBtn"),
  communityBtn: $("#communityBtn"),
  exportBtn: $("#exportBtn"),
  strategySelect: $("#strategySelect"),
  statusBand: $("#statusBand"),
  statusText: $("#statusText"),
  sourceText: $("#sourceText"),
  latestIssue: $("#latestIssue"),
  latestBalls: $("#latestBalls"),
  latestMeta: $("#latestMeta"),
  adviceList: $("#adviceList"),
  confidenceText: $("#confidenceText"),
  sourceUrls: $("#sourceUrls"),
  communityCount: $("#communityCount"),
  communityResults: $("#communityResults"),
  communityAggregate: $("#communityAggregate"),
  communitySourceText: $("#communitySourceText"),
  summaryGrid: $("#summaryGrid"),
  tickets: $("#tickets"),
  ticketMode: $("#ticketMode"),
  redChart: $("#redChart"),
  blueChart: $("#blueChart"),
  shapeStats: $("#shapeStats"),
  shapeScope: $("#shapeScope"),
  backtestPanel: $("#backtestPanel"),
  backtestScope: $("#backtestScope"),
  favoritesPanel: $("#favoritesPanel"),
  favoriteCount: $("#favoriteCount"),
  sourceScores: $("#sourceScores"),
  sourceScoreScope: $("#sourceScoreScope"),
  recordScope: $("#recordScope"),
  recordSummary: $("#recordSummary"),
  recordList: $("#recordList"),
  performanceScope: $("#performanceScope"),
  performanceList: $("#performanceList")
};

const defaultSources = [
  "https://zx.500.com/ssq/n_zjtj/",
  "https://zx.500.com/ssq/zhuanjiashahao.php",
  "https://bbss.17500.cn/forum-35-1.html"
];

const strategyLabels = {
  balanced: "均衡趋势",
  hot: "热号追踪",
  cold: "冷号补位",
  community: "社区共振",
  blue: "蓝球重点"
};

const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);

els.sourceUrls.value = defaultSources.join("\n");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : "#";
  } catch {
    return "#";
  }
}

function percentWidth(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function setStatus(message, detail = "", type = "ok") {
  els.statusText.textContent = message;
  els.sourceText.textContent = detail;
  els.statusBand.classList.toggle("warn", type === "warn");
}

function setBusy(isBusy) {
  [els.fetchDrawsBtn, els.generateBtn, els.communityBtn].forEach((button) => {
    button.disabled = isBusy;
  });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function ball(number, type = "red", small = false) {
  return `<span class="ball ${type === "blue" ? "blue" : ""} ${small ? "small" : ""}">${escapeHtml(number)}</span>`;
}

function pct(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mode(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0];
}

function sortReds(reds) {
  return reds.map(Number).sort((a, b) => a - b);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function drawKey(ticket) {
  return `${ticket.reds.join(",")}+${ticket.blue}`;
}

function latestBase() {
  const latest = state.draws[0] || {};
  return {
    baseIssue: latest.issue || "",
    baseDate: latest.date || ""
  };
}

function toRecord(ticket, type = "ticket") {
  return {
    type,
    reds: ticket.reds,
    blue: ticket.blue,
    strategy: ticket.kind || ticket.strategy || "",
    sourceName: ticket.sourceName || "",
    sourceUrl: ticket.sourceUrl || "",
    reason: ticket.reason || ticket.context || "",
    score: ticket.score ?? null,
    ...latestBase()
  };
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
  const distances = new Set();

  nums.forEach((value, index) => {
    if (value <= 11) zones[0] += 1;
    else if (value <= 22) zones[1] += 1;
    else zones[2] += 1;
    mod012[value % 3] += 1;
    if (index && value - nums[index - 1] === 1) consecutive += 1;
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
    ac: distances.size - (nums.length - 1),
    repeat,
    blueOdd: Number(draw.blue) % 2 ? 1 : 0
  };
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

function analyze(draws) {
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

  const hotReds = [...redStats].sort((a, b) => b.freq - a.freq).slice(0, 8);
  const trendReds = [...redStats].sort((a, b) => b.score - a.score).slice(0, 10);
  const coldReds = [...redStats].sort((a, b) => b.miss - a.miss).slice(0, 8);
  const hotBlues = [...blueStats].sort((a, b) => b.score - a.score).slice(0, 5);

  return {
    count: draws.length,
    recentWindow,
    redStats,
    blueStats,
    shapes,
    hotReds,
    trendReds,
    coldReds,
    hotBlues,
    sum: {
      average: Math.round(mean(sums)),
      median: Math.round(median(sums)),
      recentAverage: Math.round(mean(recentShapes.map((shape) => shape.sum))),
      min: Math.min(...sums),
      max: Math.max(...sums)
    },
    shape: {
      zones,
      parity,
      size,
      prime,
      mod012,
      blueOddEven,
      consecutiveAverage: mean(recentShapes.map((shape) => shape.consecutive)),
      repeatAverage: mean(recentShapes.map((shape) => shape.repeat)),
      spanAverage: Math.round(mean(spans)),
      acAverage: Number(mean(acValues).toFixed(1)),
      common012: mode(recentShapes.map((shape) => shape.mod012.join(":")))
    }
  };
}

function renderLatest() {
  const latest = state.draws[0];
  if (!latest) return;
  const shape = getDrawShape(latest, state.draws[1]);
  els.latestIssue.textContent = latest.issue ? `第 ${latest.issue} 期` : "最新";
  els.latestBalls.innerHTML = [...latest.red.map((item) => ball(item)), ball(latest.blue, "blue")].join("");
  els.latestMeta.innerHTML = `
    <dt>开奖日期</dt><dd>${escapeHtml(latest.date || "--")}</dd>
    <dt>数据源</dt><dd>${escapeHtml(latest.source || "cwl.gov.cn")}</dd>
    <dt>红球和值</dt><dd>${shape.sum}</dd>
    <dt>跨度 / AC</dt><dd>${shape.span} / ${shape.ac}</dd>
  `;
}

function metric(label, value, detail) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </div>
  `;
}

function renderSummary() {
  const a = state.analysis;
  if (!a) return;
  const topTrend = a.trendReds.slice(0, 4).map((item) => item.number).join(" ");
  const topBlue = a.hotBlues.slice(0, 3).map((item) => item.number).join(" ");
  els.summaryGrid.innerHTML = [
    metric("样本期数", a.count, `最近窗口 ${a.recentWindow} 期`),
    metric("红球均值", a.sum.average, `近期开奖均值 ${a.sum.recentAverage}`),
    metric("趋势红球", topTrend, "频次、近期热度、遗漏综合"),
    metric("蓝球关注", topBlue, "近期权重更高")
  ].join("");
}

function renderChart(container, stats, totalSlots) {
  const max = Math.max(1, ...stats.map((item) => item.freq));
  container.innerHTML = stats
    .slice(0, totalSlots)
    .map((item) => {
      const height = Math.max(3, Math.round((item.freq / max) * 100));
      return `
        <div class="bar-item" title="${escapeHtml(`${item.number}: ${item.freq} 次，遗漏 ${item.miss} 期`)}">
          <div class="bar-track"><div class="bar-fill" style="height:${height}%"></div></div>
          <div class="bar-label">${escapeHtml(item.number)}</div>
        </div>
      `;
    })
    .join("");
}

function renderAdvice() {
  const a = state.analysis;
  if (!a) return;
  const zoneTotal = a.shape.zones.reduce((sum, value) => sum + value, 0) || 1;
  const oddTotal = a.shape.parity.odd + a.shape.parity.even || 1;
  const sizeTotal = a.shape.size.big + a.shape.size.small || 1;
  const longMiss = a.coldReds.slice(0, 5).map((item) => `${item.number}(${item.miss})`).join(" ");
  const trends = a.trendReds.slice(0, 6).map((item) => item.number).join(" ");
  const blues = a.hotBlues.map((item) => `${item.number}(${item.miss})`).join(" ");

  els.confidenceText.textContent = `近 ${a.recentWindow} 期`;
  els.adviceList.innerHTML = [
    `红球三区占比 ${a.shape.zones.map((value) => pct(value, zoneTotal)).join("% / ")}%，建议三段都有覆盖。`,
    `奇偶 ${pct(a.shape.parity.odd, oddTotal)}% / ${pct(a.shape.parity.even, oddTotal)}%，大小 ${pct(a.shape.size.big, sizeTotal)}% / ${pct(a.shape.size.small, sizeTotal)}%。`,
    `综合趋势红球：${trends}；可和长遗漏号 ${longMiss} 做少量搭配。`,
    `平均跨度 ${a.shape.spanAverage}，平均 AC ${a.shape.acAverage}，012 路常见形态 ${a.shape.common012 || "--"}。`,
    `蓝球近期关注：${blues}；蓝球更适合分组追踪，不适合一次铺满。`
  ]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function shapeItem(label, value) {
  return `<div class="shape-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderShape() {
  const a = state.analysis;
  if (!a) return;
  const zoneTotal = a.shape.zones.reduce((sum, value) => sum + value, 0) || 1;
  const oddTotal = a.shape.parity.odd + a.shape.parity.even || 1;
  const sizeTotal = a.shape.size.big + a.shape.size.small || 1;
  const primeTotal = a.shape.prime.prime + a.shape.prime.composite || 1;
  const blueTotal = a.shape.blueOddEven.odd + a.shape.blueOddEven.even || 1;
  els.shapeScope.textContent = `近 ${a.recentWindow} 期`;
  els.shapeStats.innerHTML = [
    shapeItem("三区比例", a.shape.zones.map((value) => pct(value, zoneTotal)).join("% : ") + "%"),
    shapeItem("奇偶比例", `${pct(a.shape.parity.odd, oddTotal)}% : ${pct(a.shape.parity.even, oddTotal)}%`),
    shapeItem("大小比例", `${pct(a.shape.size.big, sizeTotal)}% : ${pct(a.shape.size.small, sizeTotal)}%`),
    shapeItem("质合比例", `${pct(a.shape.prime.prime, primeTotal)}% : ${pct(a.shape.prime.composite, primeTotal)}%`),
    shapeItem("012 路", a.shape.mod012.join(" : ")),
    shapeItem("平均跨度", a.shape.spanAverage),
    shapeItem("平均 AC", a.shape.acAverage),
    shapeItem("平均重号", a.shape.repeatAverage.toFixed(2)),
    shapeItem("平均连号", a.shape.consecutiveAverage.toFixed(2)),
    shapeItem("蓝球奇偶", `${pct(a.shape.blueOddEven.odd, blueTotal)}% : ${pct(a.shape.blueOddEven.even, blueTotal)}%`)
  ].join("");
}

function renderAnalysis() {
  renderLatest();
  renderSummary();
  renderChart(els.redChart, state.analysis.redStats, 33);
  renderChart(els.blueChart, state.analysis.blueStats, 16);
  renderAdvice();
  renderShape();
}

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

function communityBias(number) {
  const aggregate = state.community?.aggregate || [];
  let score = 0;
  aggregate.forEach((item, index) => {
    if (item.reds.includes(number)) score += Math.max(1, 8 - index) * item.count;
  });
  return score;
}

function buildCommunityWeights(stats) {
  const base = buildWeights(stats, "balanced");
  const maxBias = Math.max(1, ...base.map((item) => communityBias(item.number)));
  return base.map((item) => ({
    ...item,
    weight: item.weight + (communityBias(item.number) / maxBias) * 5
  }));
}

function ticketShape(reds, blue) {
  return getDrawShape({ red: reds, blue });
}

function ticketFitness(reds, blue = "01") {
  const shape = ticketShape(reds, blue);
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

function generateTicket(kind = "balanced") {
  const a = state.analysis;
  let redWeights = kind === "community" ? buildCommunityWeights(a.redStats) : buildWeights(a.redStats, kind);
  const blueWeights = buildWeights(a.blueStats, kind === "community" ? "balanced" : kind);

  if (kind === "community" && state.community?.aggregate?.[0]) {
    const top = state.community.aggregate[0];
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

  const shape = ticketShape(best, bestBlue);
  return {
    reds: best,
    blue: bestBlue,
    kind,
    score: bestScore,
    reason: `和值 ${shape.sum}，奇偶 ${shape.odd}:${shape.even}，跨度 ${shape.span}，AC ${shape.ac}`
  };
}

function renderTickets(tickets) {
  state.tickets = tickets;
  els.tickets.classList.remove("empty-state");
  els.tickets.innerHTML = tickets
    .map(
      (ticket, index) => `
      <div class="ticket">
        <div class="ticket-head">
          <span>建议 ${index + 1}</span>
          <span>${escapeHtml(strategyLabels[ticket.kind] || ticket.kind)} · ${escapeHtml(ticket.score)} 分</span>
        </div>
        <div class="ball-row">
          ${ticket.reds.map((item) => ball(item, "red", true)).join("")}
          ${ball(ticket.blue, "blue", true)}
        </div>
        <p>${escapeHtml(ticket.reason)}</p>
        <button class="small-button" data-favorite="${index}" type="button">收藏</button>
      </div>
    `
    )
    .join("");

  els.tickets.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", () => addFavorite(tickets[Number(button.dataset.favorite)]));
  });
}

function generateTickets() {
  if (!state.analysis) {
    setStatus("请先获取开奖数据", "没有历史样本时无法生成建议号", "warn");
    return;
  }
  const selected = els.strategySelect.value;
  const modes =
    selected === "balanced"
      ? ["balanced", "balanced", "hot", "cold", "blue", "balanced"]
      : [selected, selected, selected, "balanced", "hot", "cold"];
  const tickets = modes.map((mode) => generateTicket(mode));
  renderTickets(tickets);
  saveRecords(tickets.map((ticket) => toRecord(ticket, "ticket")));
  runBacktest(selected);
  els.ticketMode.textContent = strategyLabels[selected];
  setStatus("已生成建议号", "建议号来自历史分布权重、形态约束和策略回测，仅供参考");
}

function scoreHit(ticket, draw) {
  const reds = new Set(ticket.reds);
  const redHits = draw.red.filter((item) => reds.has(item)).length;
  const blueHit = ticket.blue === draw.blue ? 1 : 0;
  return { redHits, blueHit, key: `${redHits}+${blueHit}` };
}

function deterministicTicketFromWindow(history, kind) {
  const snapshot = analyze(history);
  const redStats = snapshot.redStats;
  const blueStats = snapshot.blueStats;
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

  const blueRank = [...blueStats].sort((a, b) =>
    kind === "cold" ? b.miss - a.miss || b.score - a.score : b.score - a.score
  );
  return {
    reds: reds.sort((a, b) => Number(a) - Number(b)),
    blue: blueRank[0]?.number || "01"
  };
}

function runBacktest(kind) {
  if (!state.draws.length) return;
  const sampleSize = Math.min(80, Math.max(12, state.draws.length - 35));
  const results = [];
  const counts = new Map();
  let totalRed = 0;
  let blueHits = 0;

  for (let index = sampleSize - 1; index >= 0; index -= 1) {
    const target = state.draws[index];
    const history = state.draws.slice(index + 1);
    if (history.length < 30) continue;
    const ticket = deterministicTicketFromWindow(history, kind === "community" ? "balanced" : kind);
    const hit = scoreHit(ticket, target);
    totalRed += hit.redHits;
    blueHits += hit.blueHit;
    counts.set(hit.key, (counts.get(hit.key) || 0) + 1);
    results.push({ issue: target.issue, ...hit });
  }

  const best = [...results].sort((a, b) => b.redHits + b.blueHit * 1.2 - (a.redHits + a.blueHit * 1.2))[0];
  const avgRed = results.length ? (totalRed / results.length).toFixed(2) : "0.00";
  const blueRate = results.length ? pct(blueHits, results.length) : 0;
  const strongHits = results.filter((item) => item.redHits >= 4 || (item.redHits >= 3 && item.blueHit)).length;
  els.backtestScope.textContent = `${strategyLabels[kind] || kind} · ${results.length} 期`;
  els.backtestPanel.classList.remove("muted");
  els.backtestPanel.innerHTML = [
    metric("平均红球", avgRed, "逐期滚动回测"),
    metric("蓝球命中率", `${blueRate}%`, `${blueHits}/${results.length}`),
    metric("较好命中", strongHits, "4 红或 3 红+蓝"),
    metric("最佳单期", best ? `${best.redHits}+${best.blueHit}` : "--", best ? `第 ${best.issue} 期` : "暂无")
  ].join("");
}

function addFavorite(ticket) {
  if (!ticket) return;
  const key = drawKey(ticket);
  if (state.favorites.some((item) => drawKey(item) === key)) {
    setStatus("已在收藏中", key);
    return;
  }
  state.favorites.push({ ...ticket, savedAt: new Date().toLocaleString() });
  renderFavorites();
  saveRecords([toRecord(ticket, "favorite")]);
  setStatus("已收藏号码", key);
}

function renderFavorites() {
  els.favoriteCount.textContent = `${state.favorites.length} 注`;
  if (!state.favorites.length) {
    els.favoritesPanel.classList.add("muted");
    els.favoritesPanel.textContent = "暂无收藏";
    return;
  }
  els.favoritesPanel.classList.remove("muted");
  els.favoritesPanel.innerHTML = state.favorites
    .map(
      (ticket) => `
      <div class="ticket">
        <div class="ticket-head"><span>${escapeHtml(strategyLabels[ticket.kind] || ticket.kind)}</span><span>${escapeHtml(ticket.savedAt)}</span></div>
        <div class="ball-row">${ticket.reds.map((red) => ball(red, "red", true)).join("")}${ball(ticket.blue, "blue", true)}</div>
      </div>
    `
    )
    .join("");
}

function renderCommunity() {
  const data = state.community;
  if (!data) return;
  els.communityCount.textContent = `${data.count || 0} 条`;
  els.communitySourceText.textContent = `${data.sources?.length || 0} 个来源`;

  if (data.recommendations?.length) {
    els.communityResults.classList.remove("muted");
    els.communityResults.innerHTML = data.recommendations
      .slice(0, 6)
      .map(
        (item) => `
        <div class="community-item">
          <div class="ball-row">
            ${item.reds.map((red) => ball(red, "red", true)).join("")}
            ${ball(item.blue, "blue", true)}
          </div>
          <p><a href="${safeExternalUrl(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceName)}</a></p>
        </div>
      `
      )
      .join("");
  } else {
    els.communityResults.classList.add("muted");
    els.communityResults.textContent = data.errors?.length
      ? "未识别到号码，可能页面需要登录、强反爬或结构已变"
      : "暂无数据";
  }

  if (data.aggregate?.length) {
    els.communityAggregate.classList.remove("muted");
    els.communityAggregate.innerHTML = data.aggregate
      .slice(0, 6)
      .map(
        (item) => `
        <div class="ticket">
          <div class="ticket-head">
            <span>共振 ${item.count}</span>
            <span>可信 ${Math.round((item.confidence || 0) * 100)}%</span>
          </div>
          <div class="ball-row">
            ${item.reds.map((red) => ball(red, "red", true)).join("")}
            ${ball(item.blue, "blue", true)}
          </div>
          <p>${escapeHtml(item.sources.slice(0, 2).join(" / "))}</p>
        </div>
      `
      )
      .join("");
  } else {
    els.communityAggregate.classList.add("muted");
    els.communityAggregate.textContent = "暂无共振号码";
  }

  renderSourceScores();
}

function renderSourceScores() {
  const scores = state.community?.sourceScores || [];
  els.sourceScoreScope.textContent = scores.length ? `${scores.length} 个来源` : "待拉取";
  if (!scores.length) {
    els.sourceScores.classList.add("muted");
    els.sourceScores.textContent = "暂无数据";
    return;
  }
  els.sourceScores.classList.remove("muted");
  els.sourceScores.innerHTML = scores
    .map(
      (item) => `
      <div class="score-row">
        <div>
          <strong>${escapeHtml(item.sourceName)}</strong>
          <span>${item.parsed} 条 / ${item.unique} 组唯一号码${item.error ? " / 访问异常" : ""}</span>
        </div>
        <div class="score-bar"><i style="width:${percentWidth(item.score)}%"></i></div>
        <b>${escapeHtml(item.score)}</b>
      </div>
    `
    )
    .join("");
}

async function saveRecords(records) {
  if (!records.length) return;
  try {
    await postJson("/api/records", { records });
    await fetchRecords();
  } catch (error) {
    console.warn("记录保存失败", error);
  }
}

function hitBadge(hit) {
  if (!hit) return `<span class="hit-badge">待核对</span>`;
  const strong = hit.redHits >= 4 || (hit.redHits >= 3 && hit.blueHit);
  return `<span class="hit-badge ${strong ? "strong" : ""}">${escapeHtml(hit.hitText)}</span>`;
}

function recordTypeLabel(type) {
  return type === "community" ? "社区" : type === "favorite" ? "收藏" : "建议";
}

function renderRecords() {
  const data = state.records;
  const records = data?.records || [];
  const summary = data?.summary || {};

  els.recordScope.textContent = summary.checked ? `${summary.checked} 条已核对` : "待核对";
  if (!records.length) {
    els.recordSummary.classList.add("muted");
    els.recordSummary.textContent = "暂无记录";
    els.recordList.classList.add("muted");
    els.recordList.textContent = "暂无历史推荐";
  } else {
    els.recordSummary.classList.remove("muted");
    els.recordSummary.innerHTML = [
      metric("记录总数", summary.total || 0, `开奖源 ${data.drawSource || "--"}`),
      metric("平均红球", summary.avgRed ?? "0.00", `${summary.checked || 0} 条已核对`),
      metric("蓝球命中率", `${summary.blueRate || 0}%`, `${summary.blueHits || 0}/${summary.checked || 0}`),
      metric("较好命中", summary.strongHits || 0, summary.best ? `最佳 ${summary.best.hitText}` : "暂无")
    ].join("");

    els.recordList.classList.remove("muted");
    els.recordList.innerHTML = records
      .slice(0, 10)
      .map(
        (item) => `
        <div class="record-row">
          <div>
            <strong>${escapeHtml(recordTypeLabel(item.type))} · ${escapeHtml(strategyLabels[item.strategy] || item.sourceName || item.strategy || "未标注")}</strong>
            <span>生成基准 ${escapeHtml(item.baseIssue || "--")}，核对 ${escapeHtml(item.hit?.issue || "--")}</span>
          </div>
          <div class="ball-row">${item.reds.map((red) => ball(red, "red", true)).join("")}${ball(item.blue, "blue", true)}</div>
          ${hitBadge(item.hit)}
        </div>
      `
      )
      .join("");
  }

  renderPerformance();
}

function renderPerformance() {
  const rows = state.records?.sourcePerformance || [];
  els.performanceScope.textContent = rows.length ? `${rows.length} 个来源` : "待积累";
  if (!rows.length) {
    els.performanceList.classList.add("muted");
    els.performanceList.textContent = "暂无战绩";
    return;
  }

  els.performanceList.classList.remove("muted");
  els.performanceList.innerHTML = rows
    .slice(0, 8)
    .map(
      (item) => `
      <div class="score-row">
        <div>
          <strong>${escapeHtml(item.sourceName)}</strong>
          <span>${escapeHtml(`${item.checked} 条核对，均红 ${item.avgRed}，蓝球 ${item.blueRate}% ，最佳 ${item.bestHit}`)}</span>
        </div>
        <div class="score-bar"><i style="width:${percentWidth(item.performanceScore)}%"></i></div>
        <b>${escapeHtml(item.performanceScore)}</b>
      </div>
    `
    )
    .join("");
}

async function fetchRecords() {
  try {
    state.records = await getJson(`/api/records?limit=${Number(els.limitInput.value || 240)}`);
    renderRecords();
  } catch (error) {
    console.warn("记录读取失败", error);
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv() {
  const rows = [
    ["类型", "红球", "蓝球", "策略/来源", "说明"],
    ...state.tickets.map((ticket, index) => [
      `建议${index + 1}`,
      ticket.reds.join(" "),
      ticket.blue,
      strategyLabels[ticket.kind] || ticket.kind,
      ticket.reason
    ]),
    ...state.favorites.map((ticket, index) => [
      `收藏${index + 1}`,
      ticket.reds.join(" "),
      ticket.blue,
      strategyLabels[ticket.kind] || ticket.kind,
      ticket.savedAt
    ]),
    ...(state.community?.aggregate || []).slice(0, 20).map((item, index) => [
      `社区共振${index + 1}`,
      item.reds.join(" "),
      item.blue,
      item.sources.join(" / "),
      `共振 ${item.count}，可信 ${item.confidence}`
    ]),
    ...(state.records?.records || []).slice(0, 100).map((item, index) => [
      `命中记录${index + 1}`,
      item.reds.join(" "),
      item.blue,
      item.sourceName || strategyLabels[item.strategy] || item.strategy || recordTypeLabel(item.type),
      item.hit ? `基准 ${item.baseIssue}，核对 ${item.hit.issue}，命中 ${item.hit.hitText}` : "待核对"
    ])
  ];

  if (rows.length <= 1) {
    setStatus("暂无可导出内容", "请先生成建议号或拉取社区推荐", "warn");
    return;
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ssq-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("CSV 已导出", "包含建议号、收藏号和社区共振号");
}

async function fetchDraws(refresh = false) {
  const limit = Number(els.limitInput.value || 240);
  setBusy(true);
  setStatus("正在获取开奖数据", "连接公开开奖数据源");
  try {
    const data = await getJson(`/api/draws?limit=${limit}${refresh ? "&refresh=1" : ""}`);
    state.draws = data.draws || [];
    state.analysis = analyze(state.draws);
    renderAnalysis();
    fetchRecords();
    const detail =
      data.source === "official"
        ? `官方数据 ${state.draws.length} 期，${data.fromCache ? "来自本地缓存" : "刚刚更新"}`
        : `${data.warning || "使用备用数据"} ${data.error ? `原因：${data.error}` : ""}`;
    setStatus(data.source === "official" ? "开奖数据已更新" : "使用备用数据", detail, data.source === "official" ? "ok" : "warn");
  } catch (error) {
    setStatus("获取失败", error.message, "warn");
  } finally {
    setBusy(false);
  }
}

async function fetchCommunity() {
  setBusy(true);
  setStatus("正在拉取社区推荐", "解析公开页面中的红蓝球组合");
  try {
    const urls = els.sourceUrls.value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(",");
    state.community = await getJson(`/api/community?urls=${encodeURIComponent(urls)}`);
    renderCommunity();
    const communityRecords = (state.community.recommendations || []).slice(0, 80).map((item) => ({
      type: "community",
      reds: item.reds,
      blue: item.blue,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      reason: item.context,
      score: Math.round((item.confidence || 0) * 100),
      ...latestBase()
    }));
    saveRecords(communityRecords);
    const errorText = state.community.errors?.length ? `，${state.community.errors.length} 个来源未成功` : "";
    setStatus("社区推荐已拉取", `识别到 ${state.community.count || 0} 条号码${errorText}`);
  } catch (error) {
    setStatus("社区拉取失败", error.message, "warn");
  } finally {
    setBusy(false);
  }
}

els.fetchDrawsBtn.addEventListener("click", () => fetchDraws(true));
els.generateBtn.addEventListener("click", generateTickets);
els.communityBtn.addEventListener("click", fetchCommunity);
els.exportBtn.addEventListener("click", downloadCsv);
els.strategySelect.addEventListener("change", () => {
  els.ticketMode.textContent = strategyLabels[els.strategySelect.value];
});

fetchDraws(false);
fetchRecords();
