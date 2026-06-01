import { getJson, postJson } from "../services/api.js";
import { defaultSources, state, strategyLabels } from "../state.js";
import { analyze, drawKey, getDrawShape, pct } from "../domain/analysis.js";
import { generateTicket, runBacktestData } from "../domain/generator.js";
import { renderBarChart, renderLineChart, renderPositionRows } from "../components/charts.js";
import { ball, escapeHtml, hitBadge, metric, percentWidth, safeExternalUrl, shapeItem } from "../components/html.js";
import { renderNumberGrid } from "../components/number-picker.js";

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
  performanceList: $("#performanceList"),
  manualStrategySelect: $("#manualStrategySelect"),
  manualRedGrid: $("#manualRedGrid"),
  manualBlueGrid: $("#manualBlueGrid"),
  completePickBtn: $("#completePickBtn"),
  clearPickBtn: $("#clearPickBtn"),
  manualPickResult: $("#manualPickResult"),
  manualPositionList: $("#manualPositionList"),
  indicatorScope: $("#indicatorScope"),
  indicatorBacktest: $("#indicatorBacktest"),
  classificationList: $("#classificationList"),
  sumLineChart: $("#sumLineChart"),
  ratioLineChart: $("#ratioLineChart"),
  oddLineChart: $("#oddLineChart")
};

function setStatus(message, detail = "", type = "ok") {
  els.statusText.textContent = message;
  els.sourceText.textContent = detail;
  els.statusBand.classList.toggle("warn", type === "warn");
}

function setBusy(isBusy) {
  [els.fetchDrawsBtn, els.generateBtn, els.communityBtn, els.completePickBtn].forEach((button) => {
    if (button) button.disabled = isBusy;
  });
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

function currentManualTicket() {
  return state.manual.completion?.ticket || null;
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

function renderSummary() {
  const a = state.analysis;
  if (!a) return;
  const topTrend = a.trendReds.slice(0, 4).map((item) => item.number).join(" ");
  const topBlue = a.hotBlues.slice(0, 3).map((item) => item.number).join(" ");
  const entropy = a.entropy || { red: 0, redMax: 0, redRatio: 0, blue: 0, blueMax: 0, blueRatio: 0 };
  const redEntropyDetail = `${entropy.red} / ${entropy.redMax} · 均衡度 ${Math.round((entropy.redRatio || 0) * 100)}%`;
  els.summaryGrid.innerHTML = [
    metric("样本期数", a.count, `最近窗口 ${a.recentWindow} 期`),
    metric("红球均值", a.sum.average, `近期开奖均值 ${a.sum.recentAverage}`),
    metric("趋势红球", topTrend, "频次、近期热度、遗漏综合"),
    metric("红球分布熵", entropy.red, redEntropyDetail),
    metric("蓝球关注", topBlue, "近期权重更高")
  ].join("");
}

function formatMissItem(item) {
  const tag = item.missLevel === "p90" ? "⚠️" : item.missLevel === "p75" ? "⚠" : "";
  return `${item.number}(${item.miss}${tag})`;
}

function renderAdvice() {
  const a = state.analysis;
  if (!a) return;
  const zoneTotal = a.shape.zones.reduce((sum, value) => sum + value, 0) || 1;
  const oddTotal = a.shape.parity.odd + a.shape.parity.even || 1;
  const sizeTotal = a.shape.size.big + a.shape.size.small || 1;
  const longMiss = a.coldReds.slice(0, 5).map(formatMissItem).join(" ");
  const trends = a.trendReds.slice(0, 6).map((item) => item.number).join(" ");
  const blues = a.hotBlues.map((item) => `${item.number}(${item.miss})`).join(" ");
  const quantiles = a.missQuantiles || { p75: 0, p90: 0 };
  const alerts = (a.missAlerts || []).map(formatMissItem).join(" ") || "无";

  els.confidenceText.textContent = `近 ${a.recentWindow} 期`;
  els.adviceList.innerHTML = [
    `红球三区占比 ${a.shape.zones.map((value) => pct(value, zoneTotal)).join("% / ")}%，建议三段都有覆盖。`,
    `奇偶 ${pct(a.shape.parity.odd, oddTotal)}% / ${pct(a.shape.parity.even, oddTotal)}%，大小 ${pct(a.shape.size.big, sizeTotal)}% / ${pct(a.shape.size.small, sizeTotal)}%。`,
    `综合趋势红球：${trends}；可和长遗漏号 ${longMiss} 做少量搭配。`,
    `平均跨度 ${a.shape.spanAverage}，平均 AC ${a.shape.acAverage}，012 路常见形态 ${a.shape.common012 || "--"}。`,
    `遗漏分位 P75=${quantiles.p75} / P90=${quantiles.p90}；超阈号码：${alerts}（⚠ 超 P75，⚠️ 超 P90）。`,
    `蓝球近期关注：${blues}；蓝球更适合分组追踪，不适合一次铺满。`
  ]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
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
    shapeItem("平均邻号 (差≤2)", a.shape.adjacentAverage.toFixed(2)),
    shapeItem("平均同尾号", a.shape.sameTailAverage.toFixed(2)),
    shapeItem("蓝球奇偶", `${pct(a.shape.blueOddEven.odd, blueTotal)}% : ${pct(a.shape.blueOddEven.even, blueTotal)}%`)
  ].join("");
}

function enrichSumSeries(series, window = 20, alpha = 0.2) {
  if (!series?.length) return [];
  const ordered = [...series].reverse(); // 旧 → 新
  let emaPrev = null;
  const enriched = ordered.map((item, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = ordered.slice(start, index + 1).map((row) => Number(row.sum));
    const m = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - m) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    const ema = emaPrev == null ? Number(item.sum) : alpha * Number(item.sum) + (1 - alpha) * emaPrev;
    emaPrev = ema;
    return {
      ...item,
      sumMean: Number(m.toFixed(2)),
      sumStd: Number(std.toFixed(2)),
      sumUpper: Number((m + std).toFixed(2)),
      sumLower: Number((m - std).toFixed(2)),
      sumEma: Number(ema.toFixed(2))
    };
  });
  return enriched.reverse(); // 还原 DESC
}

function renderMetricCharts() {
  const data = state.metrics;
  const markers = state.manual.completion?.position?.markers || {};
  if (!data?.series?.length) return;

  const enrichedSum = enrichSumSeries(data.series, 20, 0.2);
  renderLineChart(
    els.sumLineChart,
    enrichedSum,
    [
      { key: "sum", label: "和值", color: "#d83b45" },
      { key: "regressionSum", label: "线性回归", color: "#13845f" },
      { key: "sumMean", label: "20 期均值", color: "#666", dash: "4 3" },
      { key: "sumEma", label: "EMA(0.2)", color: "#b56a12", dash: "2 3" }
    ],
    markers,
    { bands: [{ upperKey: "sumUpper", lowerKey: "sumLower", color: "#d83b45", opacity: 0.12 }] }
  );
  renderLineChart(
    els.ratioLineChart,
    data.series,
    [
      { key: "hotRatio", label: "热号占比", color: "#b56a12" },
      { key: "coldRatio", label: "冷号占比", color: "#2167d5" }
    ],
    markers
  );
  renderLineChart(
    els.oddLineChart,
    data.series,
    [
      { key: "odd", label: "奇数个数", color: "#7b4ab8" },
      { key: "even", label: "偶数个数", color: "#13845f" }
    ],
    markers
  );
}

function renderMetricDashboard() {
  const data = state.metrics;
  if (!data) return;
  const summary = data.summary || {};
  els.indicatorScope.textContent = `${summary.count || 0} 期 · SQLite`;
  const backtest = summary.backtest || {};
  const regression = summary.regression || {};
  els.indicatorBacktest.innerHTML = [
    metric("和值分类回测", `${backtest.sumType?.hitRate || 0}%`, `${backtest.sumType?.hits || 0}/${backtest.sumType?.checked || 0}`),
    metric("奇偶分类回测", `${backtest.parityType?.hitRate || 0}%`, `${backtest.parityType?.hits || 0}/${backtest.parityType?.checked || 0}`),
    metric("冷热分类回测", `${backtest.hotColdType?.hitRate || 0}%`, `${backtest.hotColdType?.hits || 0}/${backtest.hotColdType?.checked || 0}`),
    metric("和值回归误差", regression.avgAbsResidual ?? "--", `10点内 ${regression.within10Rate || 0}%`)
  ].join("");

  els.classificationList.innerHTML = (data.series || [])
    .slice(0, 10)
    .map(
      (item) => `
        <div class="classification-row">
          <strong>${escapeHtml(item.issue)}</strong>
          <span>${escapeHtml(item.typeLabel)}</span>
          <em>和值 ${escapeHtml(item.sum)} · 热/冷 ${Math.round(item.hotRatio * 100)}%/${Math.round(item.coldRatio * 100)}%</em>
        </div>
      `
    )
    .join("");

  renderMetricCharts();
}

function renderAnalysis() {
  if (!state.analysis) return;
  const manualTicket = currentManualTicket();
  const redMarker = new Set(manualTicket?.reds || []);
  const blueMarker = new Set(manualTicket?.blue ? [manualTicket.blue] : []);
  renderLatest();
  renderSummary();
  renderBarChart(els.redChart, state.analysis.redStats, 33, redMarker);
  renderBarChart(els.blueChart, state.analysis.blueStats, 16, blueMarker);
  renderAdvice();
  renderShape();
  renderMetricCharts();
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
  const tickets = modes.map((mode) => generateTicket(state.analysis, mode, state.community));
  renderTickets(tickets);
  saveRecords(tickets.map((ticket) => toRecord(ticket, "ticket")));
  runBacktest(selected);
  els.ticketMode.textContent = strategyLabels[selected];
  setStatus("已生成建议号", "建议号来自历史分布权重、形态约束和策略回测，仅供参考。");
}

function runBacktest(kind) {
  if (!state.draws.length) return;
  const result = runBacktestData(state.draws, kind);
  els.backtestScope.textContent = `${strategyLabels[kind] || kind} · ${result.results.length} 期`;
  els.backtestPanel.classList.remove("muted");
  els.backtestPanel.innerHTML = [
    metric("平均红球", result.avgRed, "逐期滚动回测"),
    metric("蓝球命中率", `${result.blueRate}%`, `${result.blueHits}/${result.results.length}`),
    metric("较好命中", result.strongHits, "4 红或 3 红+蓝"),
    metric("最佳单期", result.best ? `${result.best.redHits}+${result.best.blueHit}` : "--", result.best ? `第 ${result.best.issue} 期` : "暂无")
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

function renderManualPicker() {
  renderNumberGrid(els.manualRedGrid, 33, state.manual.reds, "red");
  renderNumberGrid(els.manualBlueGrid, 16, new Set(state.manual.blue ? [state.manual.blue] : []), "blue");

  els.manualRedGrid.querySelectorAll("[data-number]").forEach((button) => {
    button.addEventListener("click", () => {
      const number = button.dataset.number;
      if (state.manual.reds.has(number)) state.manual.reds.delete(number);
      else if (state.manual.reds.size < 6) state.manual.reds.add(number);
      else setStatus("红球最多选择 6 个", "可先取消一个红球再选择", "warn");
      state.manual.completion = null;
      renderManualPicker();
      scheduleManualCompletion();
    });
  });

  els.manualBlueGrid.querySelectorAll("[data-number]").forEach((button) => {
    button.addEventListener("click", () => {
      const number = button.dataset.number;
      state.manual.blue = state.manual.blue === number ? "" : number;
      state.manual.completion = null;
      renderManualPicker();
      scheduleManualCompletion();
    });
  });
}

function scheduleManualCompletion() {
  clearTimeout(state.manual.timer);
  if (!state.manual.reds.size && !state.manual.blue) {
    renderManualResult();
    renderAnalysis();
    return;
  }
  state.manual.timer = setTimeout(() => completeManualTicket(), 220);
}

async function completeManualTicket() {
  if (!state.analysis) {
    setStatus("请先获取开奖数据", "自选补全需要历史指标作为规则依据", "warn");
    return;
  }
  try {
    state.manual.completion = await postJson("/api/complete-ticket", {
      reds: Array.from(state.manual.reds),
      blue: state.manual.blue,
      strategy: els.manualStrategySelect.value
    });
    renderManualResult();
    renderAnalysis();
    setStatus("已补全自选号码", "当前号码已同步标注到红蓝分布和指标走势图。");
  } catch (error) {
    setStatus("自选补全失败", error.message, "warn");
  }
}

function clearManualSelection() {
  state.manual.reds.clear();
  state.manual.blue = "";
  state.manual.completion = null;
  renderManualPicker();
  renderManualResult();
  renderAnalysis();
}

function renderManualResult() {
  const completion = state.manual.completion;
  if (!completion?.ticket) {
    els.manualPickResult.classList.add("muted");
    els.manualPickResult.textContent = "选择部分红球或蓝球后会自动补全。";
    els.manualPositionList.innerHTML = `<div class="muted">暂无指标定位</div>`;
    return;
  }

  const ticket = completion.ticket;
  els.manualPickResult.classList.remove("muted");
  els.manualPickResult.innerHTML = `
    <div class="ticket">
      <div class="ticket-head">
        <span>${escapeHtml(strategyLabels[ticket.kind] || ticket.kind)}</span>
        <span>${escapeHtml(ticket.score)} 分 · ${escapeHtml(completion.position?.typeLabel || "")}</span>
      </div>
      <div class="ball-row">${ticket.reds.map((red) => ball(red, "red", true)).join("")}${ball(ticket.blue, "blue", true)}</div>
      <p>${escapeHtml(ticket.reason)}</p>
      <button class="small-button" data-manual-favorite type="button">收藏当前</button>
    </div>
  `;
  els.manualPositionList.innerHTML = renderPositionRows(completion.position?.rows || []);
  els.manualPickResult.querySelector("[data-manual-favorite]")?.addEventListener("click", () => addFavorite(ticket));
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
      ? "未识别到号码，可能页面需要登录、强反爬或结构已变。"
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
          <span>${escapeHtml(`${item.checked} 条核对，均红 ${item.avgRed}，蓝球 ${item.blueRate}%，最佳 ${item.bestHit}`)}</span>
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

async function fetchMetrics() {
  state.metrics = await getJson(`/api/metrics?limit=${Number(els.limitInput.value || 240)}`);
  renderMetricDashboard();
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
  setStatus("CSV 已导出", "包含建议号、收藏号、社区共振号和命中记录");
}

async function fetchDraws(refresh = false) {
  const limit = Number(els.limitInput.value || 240);
  setBusy(true);
  setStatus("正在获取开奖数据", "连接公开开奖数据源并写入 SQLite");
  try {
    const data = await getJson(`/api/draws?limit=${limit}${refresh ? "&refresh=1" : ""}`);
    state.draws = data.draws || [];
    state.analysis = analyze(state.draws);
    renderAnalysis();
    await fetchMetrics();
    const detail =
      data.source === "official"
        ? `官方数据 ${state.draws.length} 期，${data.fromCache ? "来自本地缓存" : "刚刚更新"}，SQLite 已同步`
        : `${data.warning || "使用备用数据"} ${data.error ? `原因：${data.error}` : ""}`;
    setStatus(data.source === "official" ? "开奖数据已更新" : "使用备用数据", detail, data.source === "official" ? "ok" : "warn");
  } catch (error) {
    setStatus("获取失败", error.message, "warn");
  } finally {
    setBusy(false);
    fetchRecords();
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
      .join("\n");
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

function wireEvents() {
  els.fetchDrawsBtn.addEventListener("click", () => fetchDraws(true));
  els.generateBtn.addEventListener("click", generateTickets);
  els.communityBtn.addEventListener("click", fetchCommunity);
  els.exportBtn.addEventListener("click", downloadCsv);
  els.strategySelect.addEventListener("change", () => {
    els.ticketMode.textContent = strategyLabels[els.strategySelect.value];
  });
  els.manualStrategySelect.addEventListener("change", completeManualTicket);
  els.completePickBtn.addEventListener("click", completeManualTicket);
  els.clearPickBtn.addEventListener("click", clearManualSelection);
}

export function initDashboard() {
  els.sourceUrls.value = defaultSources.join("\n");
  renderManualPicker();
  renderManualResult();
  wireEvents();
  fetchDraws(false);
}
