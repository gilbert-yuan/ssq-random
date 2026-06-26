import { getJson, postJson, requestJson } from "./js/services/api.js";
import { defaultSources, strategyLabels } from "./js/state.js";
import { analyze, drawKey, getDrawShape } from "./js/domain/analysis.js";
import { generateTicket, runBacktestData } from "./js/domain/generator.js";
import { ball, escapeHtml, hitBadge, metric, percentWidth, safeExternalUrl, shapeItem } from "./js/components/html.js";
import { renderBarChart, renderLineChart, renderPositionRows } from "./js/components/charts.js";
import { renderNumberGrid } from "./js/components/number-picker.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const TICKET_BATCH_SIZE = 6;
const COMBO_RECOMMEND_MODES = ["hot", "blue", "blue", "cold", "community"];

const state = {
  auth: { authenticated: null, user: null, busy: false },
  draws: [],
  analysis: null,
  metrics: null,
  community: null,
  tickets: [],
  records: null,
  manual: {
    reds: new Set(),
    blue: "",
    completion: null,
    timer: null
  },
  filters: {
    favoriteIssue: "",
    favoriteIssueTouched: false,
    manualIssue: "",
    manualIssueTouched: false
  }
};

const els = {
  status: $("#mobileStatus"),
  statusText: $("#mobileStatusText"),
  statusDetail: $("#mobileStatusDetail"),
  navButtons: $$("[data-mobile-tab]"),
  views: $$("[data-mobile-view]"),
  latestIssue: $("#mobileLatestIssue"),
  latestBalls: $("#mobileLatestBalls"),
  latestMeta: $("#mobileLatestMeta"),
  latestActions: $("#mobileLatestActions"),
  refreshDrawsBtn: $("#mobileRefreshDrawsBtn"),
  summaryGrid: $("#mobileSummaryGrid"),
  adviceList: $("#mobileAdviceList"),
  confidenceText: $("#mobileConfidenceText"),
  strategySelect: $("#mobileStrategySelect"),
  generateBtn: $("#mobileGenerateBtn"),
  comboRecommendBtn: $("#mobileComboRecommendBtn"),
  replaceBtn: $("#mobileReplaceBtn"),
  tickets: $("#mobileTickets"),
  manualStrategySelect: $("#mobileManualStrategySelect"),
  manualRedGrid: $("#mobileManualRedGrid"),
  manualBlueGrid: $("#mobileManualBlueGrid"),
  completePickBtn: $("#mobileCompletePickBtn"),
  clearPickBtn: $("#mobileClearPickBtn"),
  manualPickResult: $("#mobileManualPickResult"),
  manualPositionList: $("#mobileManualPositionList"),
  redChart: $("#mobileRedChart"),
  blueChart: $("#mobileBlueChart"),
  shapeScope: $("#mobileShapeScope"),
  shapeStats: $("#mobileShapeStats"),
  indicatorScope: $("#mobileIndicatorScope"),
  indicatorBacktest: $("#mobileIndicatorBacktest"),
  sumLineChart: $("#mobileSumLineChart"),
  ratioLineChart: $("#mobileRatioLineChart"),
  oddLineChart: $("#mobileOddLineChart"),
  classificationList: $("#mobileClassificationList"),
  refreshRecordsBtn: $("#mobileRefreshRecordsBtn"),
  recordHint: $("#mobileRecordHint"),
  recordSummary: $("#mobileRecordSummary"),
  recordList: $("#mobileRecordList"),
  favoriteCount: $("#mobileFavoriteCount"),
  favoriteIssueFilter: $("#mobileFavoriteIssueFilter"),
  favoritesPanel: $("#mobileFavoritesPanel"),
  manualRecordCount: $("#mobileManualRecordCount"),
  manualIssueFilter: $("#mobileManualIssueFilter"),
  manualRecordList: $("#mobileManualRecordList"),
  sourceUrls: $("#mobileSourceUrls"),
  communityBtn: $("#mobileCommunityBtn"),
  communityResults: $("#mobileCommunityResults"),
  communityAggregate: $("#mobileCommunityAggregate"),
  communitySourceText: $("#mobileCommunitySourceText"),
  sourceScores: $("#mobileSourceScores"),
  sourceScoreScope: $("#mobileSourceScoreScope"),
  authModeText: $("#mobileAuthModeText"),
  authHint: $("#mobileAuthHint"),
  authGuestPanel: $("#mobileAuthGuestPanel"),
  authUserPanel: $("#mobileAuthUserPanel"),
  authUserTitle: $("#mobileAuthUserTitle"),
  authUserSummary: $("#mobileAuthUserSummary"),
  authStatTotal: $("#mobileAuthStatTotal"),
  authStatChecked: $("#mobileAuthStatChecked"),
  authStatWins: $("#mobileAuthStatWins"),
  authStatPending: $("#mobileAuthStatPending"),
  authUsernameInput: $("#mobileAuthUsernameInput"),
  authPasswordInput: $("#mobileAuthPasswordInput"),
  authDisplayNameInput: $("#mobileAuthDisplayNameInput"),
  registerBtn: $("#mobileRegisterBtn"),
  loginBtn: $("#mobileLoginBtn"),
  logoutBtn: $("#mobileLogoutBtn")
};

function setStatus(message, detail = "", type = "ok") {
  els.statusText.textContent = message;
  els.statusDetail.textContent = detail;
  els.status.classList.toggle("warn", type === "warn");
}

function setBusy(isBusy) {
  [
    els.refreshDrawsBtn,
    els.generateBtn,
    els.comboRecommendBtn,
    els.replaceBtn,
    els.completePickBtn,
    els.communityBtn,
    els.refreshRecordsBtn
  ].forEach((button) => {
    if (button) button.disabled = isBusy;
  });
}

function setActiveView(viewId) {
  els.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mobileTab === viewId);
  });
  els.views.forEach((view) => {
    const active = view.dataset.mobileView === viewId;
    view.classList.toggle("active", active);
    view.hidden = !active;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  refreshView(viewId);
}

function syncAuth(payload) {
  if (typeof payload?.authenticated !== "boolean") return;
  state.auth.authenticated = payload.authenticated;
  state.auth.user = payload.user || null;
  renderAuth();
}

function syncRecords(payload) {
  if (!payload) return;
  state.records = payload;
  syncAuth(payload);
  renderRecords();
}

function latestBase() {
  const latest = state.draws[0] || {};
  return {
    baseIssue: latest.issue || "",
    baseDate: latest.date || ""
  };
}

function formatTicketText(ticket) {
  const reds = Array.isArray(ticket?.reds) ? ticket.reds : Array.isArray(ticket?.red) ? ticket.red : [];
  return `${reds.join(" ")} + ${ticket?.blue || ""}`.trim();
}

function copyButton(ticket, extraClass = "") {
  const className = ["small-button", "copy-button", extraClass].filter(Boolean).join(" ");
  return `<button class="${className}" data-copy-ticket="${escapeHtml(formatTicketText(ticket))}" type="button">复制</button>`;
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

async function copyTicketFromButton(button) {
  const text = button.dataset.copyTicket || "";
  if (!text) return;
  try {
    await writeClipboardText(text);
    setStatus("已复制号码", text);
  } catch {
    setStatus("复制失败", "浏览器未允许访问剪贴板", "warn");
  }
}

function normalizeCommunitySnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    fetchedAt: snapshot.fetchedAt || "",
    sources: Array.isArray(snapshot.sources) ? snapshot.sources : [],
    count: Number(snapshot.count || 0),
    recommendations: Array.isArray(snapshot.recommendations) ? snapshot.recommendations : [],
    aggregate: Array.isArray(snapshot.aggregate) ? snapshot.aggregate : [],
    sourceScores: Array.isArray(snapshot.sourceScores) ? snapshot.sourceScores : [],
    errors: Array.isArray(snapshot.errors) ? snapshot.errors : []
  };
}

function renderLatest() {
  const latest = state.draws[0];
  if (!latest) {
    els.latestIssue.textContent = "--";
    els.latestBalls.textContent = "暂无数据";
    els.latestBalls.classList.add("muted");
    els.latestMeta.innerHTML = "";
    return;
  }
  const shape = getDrawShape(latest, state.draws[1] || null);
  els.latestIssue.textContent = latest.issue || "--";
  els.latestBalls.classList.remove("muted");
  els.latestBalls.innerHTML = `${latest.red.map((red) => ball(red)).join("")}${ball(latest.blue, "blue")}`;
  els.latestMeta.innerHTML = `
    <dt>开奖日期</dt><dd>${escapeHtml(latest.date || "--")}</dd>
    <dt>和值/跨度</dt><dd>${shape.sum} / ${shape.span}</dd>
    <dt>奇偶/大小</dt><dd>${shape.odd}:${shape.even} / ${shape.big}:${shape.small}</dd>
  `;
  els.latestActions.classList.remove("muted");
  els.latestActions.innerHTML = copyButton({ reds: latest.red, blue: latest.blue });
}

function renderSummary() {
  const a = state.analysis;
  if (!a) {
    els.summaryGrid.innerHTML = `<div class="muted">暂无分析数据</div>`;
    return;
  }
  els.summaryGrid.innerHTML = [
    metric("样本期数", a.count, `近 ${a.recentWindow} 期参与形态统计`),
    metric("平均和值", a.sum.recentAverage, `历史中位 ${a.sum.median}`),
    metric("平均跨度", a.shape.spanAverage, `AC 均值 ${a.shape.acAverage}`),
    metric("红球熵值", a.entropy.redRatio, `越接近 1 越均衡`),
    metric("蓝球熵值", a.entropy.blueRatio, `近 ${a.recentWindow} 期分布`)
  ].join("");
}

function renderAdvice() {
  const a = state.analysis;
  if (!a) {
    els.adviceList.innerHTML = `<li>暂无趋势建议</li>`;
    return;
  }
  const hot = a.trendReds.slice(0, 6).map((item) => item.number).join(" ");
  const cold = a.coldReds.slice(0, 4).map((item) => `${item.number}(${item.miss})`).join(" ");
  const blue = a.hotBlues.slice(0, 3).map((item) => item.number).join(" ");
  els.confidenceText.textContent = `${Math.round(a.entropy.redRatio * 100)}%`;
  els.adviceList.innerHTML = [
    `<li>红球趋势：${escapeHtml(hot || "--")}</li>`,
    `<li>冷号观察：${escapeHtml(cold || "--")}</li>`,
    `<li>蓝球重点：${escapeHtml(blue || "--")}</li>`
  ].join("");
}

function renderShape() {
  const a = state.analysis;
  if (!a) {
    els.shapeStats.innerHTML = `<div class="muted">暂无形态数据</div>`;
    return;
  }
  const shape = a.shape;
  els.shapeScope.textContent = `近 ${a.recentWindow} 期`;
  els.shapeStats.innerHTML = [
    shapeItem("三区比例", shape.zones.join(":")),
    shapeItem("奇偶比例", `${shape.parity.odd}:${shape.parity.even}`),
    shapeItem("大小比例", `${shape.size.big}:${shape.size.small}`),
    shapeItem("质合比例", `${shape.prime.prime}:${shape.prime.composite}`),
    shapeItem("012 路", shape.mod012.join(":")),
    shapeItem("连号均值", shape.consecutiveAverage.toFixed(2)),
    shapeItem("邻号均值", shape.adjacentAverage.toFixed(2)),
    shapeItem("重号均值", shape.repeatAverage.toFixed(2))
  ].join("");
}

function renderAnalysisCharts() {
  const a = state.analysis;
  if (!a) return;
  const latest = state.draws[0] || {};
  renderBarChart(els.redChart, a.redStats, 33, new Set(latest.red || []));
  renderBarChart(els.blueChart, a.blueStats, 16, new Set(latest.blue ? [latest.blue] : []));
}

function renderMetricDashboard() {
  const metrics = state.metrics;
  if (!metrics?.series?.length) {
    els.indicatorBacktest.textContent = "暂无指标回测";
    els.indicatorBacktest.classList.add("muted");
    return;
  }
  const summary = metrics.summary || {};
  const current = metrics.series[0];
  els.indicatorScope.textContent = `${summary.count || metrics.series.length} 期`;
  const backtest = summary.backtest || {};
  const regression = summary.regression || {};
  els.indicatorBacktest.classList.remove("muted");
  els.indicatorBacktest.innerHTML = [
    metric("和值分类回测", `${backtest.sumType?.hitRate || 0}%`, `${backtest.sumType?.hits || 0}/${backtest.sumType?.checked || 0}`),
    metric("奇偶分类回测", `${backtest.parityType?.hitRate || 0}%`, `${backtest.parityType?.hits || 0}/${backtest.parityType?.checked || 0}`),
    metric("冷热分类回测", `${backtest.hotColdType?.hitRate || 0}%`, `${backtest.hotColdType?.hits || 0}/${backtest.hotColdType?.checked || 0}`),
    metric("和值回归误差", regression.avgAbsResidual ?? "--", `10 点内 ${regression.within10Rate || 0}%`)
  ].join("");
  const enrichedSum = enrichSumSeries(metrics.series, 20, 0.2);
  renderLineChart(
    els.sumLineChart,
    enrichedSum,
    [
      { key: "sum", label: "和值", color: "#ef4444" },
      { key: "regressionSum", label: "回归", color: "#10b981" },
      { key: "sumMean", label: "均线", color: "#3b82f6", dash: "6 6" },
      { key: "sumEma", label: "EMA", color: "#fb923c", dash: "2 3" }
    ],
    { sum: current.sum },
    { bands: [{ upperKey: "sumUpper", lowerKey: "sumLower", color: "#ef4444", opacity: 0.12 }] }
  );
  renderLineChart(
    els.ratioLineChart,
    metrics.series,
    [
      { key: "hotRatio", label: "热号", color: "#fb923c" },
      { key: "coldRatio", label: "冷号", color: "#10b981" }
    ],
    { hotRatio: current.hotRatio, coldRatio: current.coldRatio }
  );
  renderLineChart(
    els.oddLineChart,
    metrics.series,
    [
      { key: "odd", label: "奇数", color: "#ef4444" },
      { key: "even", label: "偶数", color: "#10b981" }
    ],
    { odd: current.odd, even: current.even }
  );
  els.classificationList.innerHTML = metrics.series
    ? metrics.series
        .slice(0, 6)
        .map(
          (item) => `
          <div class="classification-row">
            <strong>${escapeHtml(item.issue)}</strong>
            <span>${escapeHtml(item.typeLabel)}</span>
            <em>和值 ${escapeHtml(item.sum)} · 热/冷 ${Math.round(item.hotRatio * 100)}%/${Math.round(item.coldRatio * 100)}%</em>
          </div>
        `
        )
        .join("")
    : "";
}

function enrichSumSeries(series, windowSize = 20, alpha = 0.2) {
  if (!series?.length) return [];
  const ordered = [...series].reverse();
  let emaPrev = null;
  const enriched = ordered.map((item, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = ordered.slice(start, index + 1).map((row) => Number(row.sum));
    const mean = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    const ema = emaPrev == null ? Number(item.sum) : alpha * Number(item.sum) + (1 - alpha) * emaPrev;
    emaPrev = ema;
    return {
      ...item,
      sumMean: Number(mean.toFixed(2)),
      sumUpper: Number((mean + std).toFixed(2)),
      sumLower: Number((mean - std).toFixed(2)),
      sumEma: Number(ema.toFixed(2))
    };
  });
  return enriched.reverse();
}

function renderAnalysis() {
  renderLatest();
  renderSummary();
  renderAdvice();
  renderShape();
  renderAnalysisCharts();
  renderMetricDashboard();
}

function buildTicketModes(selected, size = TICKET_BATCH_SIZE) {
  return selected === "balanced"
    ? ["balanced", "balanced", "hot", "cold", "blue", "balanced"].slice(0, size)
    : [selected, selected, selected, "balanced", "hot", "cold"].slice(0, size);
}

function generateTicketBatch(selected, size = TICKET_BATCH_SIZE) {
  const modes = buildTicketModes(selected, size);
  return generateTicketsByModes(modes, selected, size);
}

function generateTicketsByModes(modes, fallbackMode = "balanced", size = modes.length) {
  const tickets = [];
  const seen = new Set();
  let guard = 0;
  while (tickets.length < size && guard < size * 16) {
    const mode = modes[tickets.length % modes.length] || fallbackMode;
    const ticket = generateTicket(state.analysis, mode, state.community);
    const key = drawKey(ticket);
    if (!seen.has(key)) {
      seen.add(key);
      tickets.push(ticket);
    }
    guard += 1;
  }
  return tickets;
}

function generateComboRecommendBatch() {
  return generateTicketsByModes(COMBO_RECOMMEND_MODES, "balanced", COMBO_RECOMMEND_MODES.length);
}

function renderTickets(tickets) {
  if (!tickets.length) {
    els.tickets.classList.add("empty-state");
    els.tickets.textContent = "暂无建议号";
    return;
  }
  els.tickets.classList.remove("empty-state", "muted");
  els.tickets.innerHTML = tickets
    .map(
      (ticket, index) => `
      <div class="ticket">
        <div class="ticket-head">
          <span>${escapeHtml(strategyLabels[ticket.kind] || ticket.kind)}</span>
          <span>${escapeHtml(ticket.score)} 分</span>
        </div>
        <div class="ball-row">${ticket.reds.map((red) => ball(red, "red", true)).join("")}${ball(ticket.blue, "blue", true)}</div>
        <p>${escapeHtml(ticket.reason)}</p>
        <div class="ticket-actions">
          ${copyButton(ticket)}
          <button class="small-button" data-favorite-ticket="${index}" type="button">收藏</button>
        </div>
      </div>
    `
    )
    .join("");
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

async function saveRecords(records) {
  if (!records.length) return { ok: true };
  try {
    await postJson("/api/records", { records });
    await fetchRecords();
    return { ok: true };
  } catch (error) {
    syncAuth(error?.data);
    setStatus("记录保存失败", error.status === 401 ? "请先登录账户" : error.message, "warn");
    return { ok: false, error };
  }
}

async function generateTickets({ replaceCurrentIssue = false } = {}) {
  if (!state.analysis) {
    setStatus("请先刷新数据", "开奖数据加载后才能生成建议号", "warn");
    return;
  }
  const selected = els.strategySelect.value;
  state.tickets = generateTicketBatch(selected);
  renderTickets(state.tickets);
  if (replaceCurrentIssue) await replaceCurrentIssueTicketRecords();
  await saveRecords(state.tickets.map((ticket) => toRecord(ticket, "ticket")));
  setStatus("已生成建议号", `${state.tickets.length} 注，策略：${strategyLabels[selected] || selected}`);
}

async function generateComboRecommendTickets() {
  if (!state.analysis) {
    setStatus("请先刷新数据", "开奖数据加载后才能生成推荐组合", "warn");
    return;
  }
  state.tickets = generateComboRecommendBatch();
  renderTickets(state.tickets);
  await saveRecords(state.tickets.map((ticket) => toRecord(ticket, "ticket")));
  setStatus("已生成推荐组合", "热号 1 注 + 蓝球 2 注 + 冷号 1 注 + 社区 1 注");
}

async function replaceCurrentIssueTicketRecords() {
  const latestIssue = state.draws[0]?.issue || "";
  if (!latestIssue || !state.records?.records?.length) return;
  const current = state.records.records.filter((item) => item.type === "ticket" && item.baseIssue === latestIssue);
  for (const item of current) {
    await requestJson(`/api/records?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
  }
  await fetchRecords();
}

async function addFavorite(ticket) {
  await saveRecords([toRecord(ticket, "favorite")]);
  setStatus("已收藏号码", formatTicketText(ticket));
}

function renderManualPicker() {
  renderNumberGrid(els.manualRedGrid, 33, state.manual.reds, "red");
  renderNumberGrid(els.manualBlueGrid, 16, new Set(state.manual.blue ? [state.manual.blue] : []), "blue");
}

function renderManualResult() {
  const completion = state.manual.completion;
  if (!completion?.ticket) {
    els.manualPickResult.classList.add("muted");
    els.manualPickResult.textContent = "选择部分号码后会自动补全。";
    els.manualPositionList.classList.add("muted");
    els.manualPositionList.innerHTML = "暂无指标定位";
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
      <div class="ticket-actions">
        ${copyButton(ticket)}
        <button class="small-button" data-manual-favorite type="button">收藏</button>
      </div>
    </div>
  `;
  els.manualPositionList.classList.remove("muted");
  els.manualPositionList.innerHTML = renderPositionRows(completion.position?.rows || []);
}

async function completeManualTicket() {
  if (!state.analysis) {
    setStatus("请先刷新数据", "自选补全需要开奖指标作为依据", "warn");
    return;
  }
  try {
    const completion = await postJson("/api/complete-ticket", {
      reds: Array.from(state.manual.reds),
      blue: state.manual.blue,
      strategy: els.manualStrategySelect.value
    });
    state.manual.completion = completion;
    await saveRecords([toRecord(completion.ticket, "manual")]);
    renderManualResult();
    setStatus("已补全自选号", formatTicketText(completion.ticket));
  } catch (error) {
    setStatus("自选补全失败", error.message, "warn");
  }
}

function scheduleManualCompletion() {
  clearTimeout(state.manual.timer);
  if (!state.manual.reds.size && !state.manual.blue) {
    state.manual.completion = null;
    renderManualResult();
    return;
  }
  state.manual.timer = setTimeout(() => completeManualTicket(), 260);
}

function clearManualSelection() {
  state.manual.reds.clear();
  state.manual.blue = "";
  state.manual.completion = null;
  renderManualPicker();
  renderManualResult();
}

function issueOptions(records, selected) {
  const issues = Array.from(new Set(records.map((item) => item.baseIssue).concat(currentIssueFilterValue()).filter(Boolean))).sort(
    (a, b) => Number(b) - Number(a)
  );
  return `<option value="">全部期数</option>${issues
    .map((issue) => `<option value="${escapeHtml(issue)}" ${issue === selected ? "selected" : ""}>${escapeHtml(issue)}</option>`)
    .join("")}`;
}

function recordTypeLabel(type) {
  return type === "community" ? "社区" : type === "favorite" ? "收藏" : type === "manual" ? "自选" : "建议";
}

function currentIssueFilterValue() {
  return state.draws[0]?.issue || "";
}

function ensureIssueFilterDefault(filterKey) {
  const touchedKey = `${filterKey}Touched`;
  const currentIssue = currentIssueFilterValue();
  if (!state.filters[touchedKey] && currentIssue) {
    state.filters[filterKey] = currentIssue;
  }
  return state.filters[filterKey] || "";
}

function renderRecordList() {
  const records = state.records?.records || [];
  if (!records.length) {
    els.recordList.classList.add("muted");
    els.recordList.textContent = state.auth.authenticated ? "暂无历史记录" : "当前为访客模式，登录后可查看个人记录。";
    return;
  }
  els.recordList.classList.remove("muted");
  els.recordList.innerHTML = records
    .slice(0, 20)
    .map(
      (item) => `
      <div class="record-row">
        <div>
          <strong>${escapeHtml(recordTypeLabel(item.type))} · ${escapeHtml(strategyLabels[item.strategy] || item.sourceName || item.strategy || "未标注")}</strong>
          <span>基准 ${escapeHtml(item.baseIssue || "--")}，状态 ${escapeHtml(item.status === "pending" ? "待开奖" : item.status === "won" ? "已中奖" : "未中奖")}</span>
        </div>
        <div class="ball-row">${item.reds.map((red) => ball(red, "red", true)).join("")}${ball(item.blue, "blue", true)}</div>
        <div class="record-actions">${hitBadge(item.hit)}${copyButton(item)}<button class="small-button" data-delete-record="${escapeHtml(item.id)}" type="button">删除</button></div>
      </div>
    `
    )
    .join("");
}

function renderRecordCollection(container, emptyText, records, deleteAttr) {
  if (!records.length) {
    container.classList.add("muted");
    container.textContent = emptyText;
    return;
  }
  container.classList.remove("muted");
  container.innerHTML = records
    .map(
      (item) => `
      <div class="ticket">
        <div class="ticket-head">
          <span>${escapeHtml(item.baseIssue || "未分期")}</span>
          <span>${escapeHtml(item.status || "pending")}</span>
        </div>
        <div class="ball-row">${item.reds.map((red) => ball(red, "red", true)).join("")}${ball(item.blue, "blue", true)}</div>
        <p>${escapeHtml(item.reason || item.sourceName || "")}</p>
        <div class="ticket-actions">${hitBadge(item.hit)}${copyButton(item)}<button class="small-button" ${deleteAttr}="${escapeHtml(item.id)}" type="button">删除</button></div>
      </div>
    `
    )
    .join("");
}

function renderRecords() {
  const summary = state.records?.summary || {};
  els.recordHint.textContent = state.auth.authenticated ? "已同步当前账户的选号和中奖核对记录" : "登录后同步建议号、收藏号、社区号和自选号";
  els.recordSummary.classList.toggle("muted", !state.records?.records?.length);
  els.recordSummary.innerHTML = [
    metric("记录总数", summary.total || 0, `${summary.checked || 0} 条已核对`),
    metric("平均红球", summary.avgRed ?? "0.00", `蓝球命中 ${summary.blueHits || 0}/${summary.checked || 0}`),
    metric("中奖注数", summary.winCount || 0, summary.best ? `最佳 ${summary.best.hitText}` : "暂无中奖"),
    metric("待开奖", summary.pendingCount || 0, "等待下一期开奖")
  ].join("");
  renderRecordList();

  const records = state.records?.records || [];
  const favorites = records.filter((item) => item.type === "favorite");
  const manuals = records.filter((item) => item.type === "manual");
  const selectedFavoriteIssue = ensureIssueFilterDefault("favoriteIssue");
  const selectedManualIssue = ensureIssueFilterDefault("manualIssue");
  const filteredFavorites = favorites.filter((item) => !state.filters.favoriteIssue || item.baseIssue === state.filters.favoriteIssue);
  const filteredManuals = manuals.filter((item) => !state.filters.manualIssue || item.baseIssue === state.filters.manualIssue);
  els.favoriteCount.textContent = `${filteredFavorites.length} 注`;
  els.manualRecordCount.textContent = `${filteredManuals.length} 注`;
  els.favoriteIssueFilter.innerHTML = issueOptions(favorites, selectedFavoriteIssue);
  els.manualIssueFilter.innerHTML = issueOptions(manuals, selectedManualIssue);
  renderRecordCollection(
    els.favoritesPanel,
    "暂无收藏",
    filteredFavorites,
    "data-delete-favorite"
  );
  renderRecordCollection(
    els.manualRecordList,
    "暂无自选号记录",
    filteredManuals,
    "data-delete-manual"
  );
  renderAuth();
}

function renderCommunity() {
  const data = state.community;
  if (!data) {
    els.communityResults.classList.add("muted");
    els.communityResults.textContent = "尚未抓取";
    els.communityAggregate.classList.add("muted");
    els.communityAggregate.textContent = "暂无数据";
    els.sourceScores.classList.add("muted");
    els.sourceScores.textContent = "暂无数据";
    els.communitySourceText.textContent = "待抓取";
    els.sourceScoreScope.textContent = "待抓取";
    return;
  }
  if (data.recommendations?.length) {
    els.communityResults.classList.remove("muted");
    els.communityResults.innerHTML = data.recommendations
      .slice(0, 6)
      .map(
        (item) => `
        <div class="community-item">
          <div class="ball-row">${item.reds.map((red) => ball(red, "red", true)).join("")}${ball(item.blue, "blue", true)}</div>
          <p><a href="${safeExternalUrl(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceName)}</a></p>
          <div class="ticket-actions">${copyButton(item)}<button class="small-button" data-save-community="${escapeHtml(
            data.recommendations.indexOf(item)
          )}" type="button">保存</button></div>
        </div>
      `
      )
      .join("");
  } else {
    els.communityResults.classList.add("muted");
    els.communityResults.textContent = data.errors?.length ? "未识别到号码，可能页面结构已变。" : "暂无数据";
  }
  els.communitySourceText.textContent = `${data.sources?.length || 0} 个来源`;
  if (data.aggregate?.length) {
    els.communityAggregate.classList.remove("muted");
    els.communityAggregate.innerHTML = data.aggregate
      .slice(0, 6)
      .map(
        (item) => `
        <div class="ticket">
          <div class="ticket-head"><span>共振 ${item.count}</span><span>${Math.round((item.confidence || 0) * 100)}%</span></div>
          <div class="ball-row">${item.reds.map((red) => ball(red, "red", true)).join("")}${ball(item.blue, "blue", true)}</div>
          <p>${escapeHtml(item.sources.slice(0, 2).join(" / "))}</p>
          <div class="ticket-actions">${copyButton(item)}</div>
        </div>
      `
      )
      .join("");
  }
  els.sourceScoreScope.textContent = `${data.sourceScores?.length || 0} 个来源`;
  els.sourceScores.classList.toggle("muted", !data.sourceScores?.length);
  els.sourceScores.innerHTML = data.sourceScores?.length
    ? data.sourceScores
        .slice(0, 6)
        .map(
          (item) => `
          <div class="score-row">
            <div><strong>${escapeHtml(item.sourceName)}</strong><span>${item.parsed} 条 / ${item.unique} 组唯一号码</span></div>
            <div class="score-bar"><i style="width:${percentWidth(item.score)}%"></i></div>
            <b>${escapeHtml(item.score)}</b>
          </div>
        `
        )
        .join("")
    : "暂无数据";
}

function authSummaryText() {
  const summary = state.records?.summary || {};
  if (!state.auth.authenticated || !state.auth.user) return "登录后自动记录每次选号，并在开奖后核对是否中奖。";
  return `已记录 ${summary.total || 0} 注，已核对 ${summary.checked || 0} 注，中奖 ${summary.winCount || 0} 注。`;
}

function renderAuth() {
  const loggedIn = Boolean(state.auth.authenticated && state.auth.user);
  const summary = state.records?.summary || {};
  els.authModeText.textContent = loggedIn ? "已登录" : "访客模式";
  els.authHint.textContent = authSummaryText();
  els.authGuestPanel.hidden = loggedIn;
  els.authUserPanel.hidden = !loggedIn;
  els.authUserTitle.textContent = loggedIn ? state.auth.user.displayName || state.auth.user.username : "--";
  els.authUserSummary.textContent = loggedIn ? authSummaryText() : "登录后这里会展示选号与中奖统计。";
  els.authStatTotal.textContent = String(summary.total || 0);
  els.authStatChecked.textContent = String(summary.checked || 0);
  els.authStatWins.textContent = String(summary.winCount || 0);
  els.authStatPending.textContent = String(summary.pendingCount || 0);
}

function authPayloadFromInputs(includeDisplayName = false) {
  const payload = {
    username: els.authUsernameInput.value.trim(),
    password: els.authPasswordInput.value
  };
  if (includeDisplayName) payload.displayName = els.authDisplayNameInput.value.trim() || payload.username;
  return payload;
}

async function refreshAuth() {
  try {
    syncAuth(await getJson("/api/auth/me"));
  } catch {
    state.auth.authenticated = false;
    state.auth.user = null;
    renderAuth();
  }
}

async function registerUser() {
  try {
    syncAuth(await postJson("/api/auth/register", authPayloadFromInputs(true)));
    setStatus("注册并登录成功", "后续记录会同步到当前账户");
    await fetchRecords();
  } catch (error) {
    setStatus("注册失败", error.message, "warn");
  }
}

async function loginUser() {
  try {
    syncAuth(await postJson("/api/auth/login", authPayloadFromInputs(false)));
    setStatus("登录成功", "你的选号记录已同步");
    await fetchRecords();
    await restoreSavedCommunitySnapshot();
  } catch (error) {
    setStatus("登录失败", error.message, "warn");
  }
}

async function logoutUser() {
  try {
    await postJson("/api/auth/logout", {});
    state.auth.authenticated = false;
    state.auth.user = null;
    state.records = null;
    renderAuth();
    renderRecords();
    setStatus("已退出登录", "当前仍可分析开奖，但不会保存到账户");
  } catch (error) {
    setStatus("退出失败", error.message, "warn");
  }
}

async function fetchRecords() {
  try {
    syncRecords(await getJson("/api/records?limit=240"));
  } catch (error) {
    syncAuth(error?.data);
    setStatus("读取记录失败", error.message, "warn");
  }
}

async function fetchMetrics() {
  try {
    state.metrics = await getJson("/api/metrics?limit=240");
    renderMetricDashboard();
  } catch (error) {
    setStatus("指标读取失败", error.message, "warn");
  }
}

async function fetchDraws(refresh = false) {
  setBusy(true);
  setStatus("正在获取开奖数据", "连接开奖数据源并更新本地缓存");
  try {
    const data = await getJson(`/api/draws?limit=240${refresh ? "&refresh=1" : ""}`);
    state.draws = data.draws || [];
    state.analysis = analyze(state.draws);
    renderAnalysis();
    await fetchMetrics();
    await fetchRecords();
    setStatus(data.source === "official" ? "开奖数据已更新" : "使用备用数据", `${state.draws.length} 期数据已加载`, data.source === "official" ? "ok" : "warn");
  } catch (error) {
    setStatus("获取开奖失败", error.message, "warn");
  } finally {
    setBusy(false);
  }
}

async function restoreSavedCommunitySnapshot() {
  if (!state.auth.authenticated) return;
  try {
    const payload = await getJson("/api/community?saved=1");
    syncAuth(payload);
    state.community = normalizeCommunitySnapshot(payload.snapshot);
    if (state.community?.sources?.length) {
      els.sourceUrls.value = state.community.sources.map((item) => item.url).filter(Boolean).join("\n");
    }
    renderCommunity();
  } catch {
    // Saved community data is optional.
  }
}

async function fetchCommunity() {
  setBusy(true);
  setStatus("正在抓取社区推荐", "解析公开页面中的红蓝球组合");
  try {
    const urls = els.sourceUrls.value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n");
    els.sourceUrls.value = urls;
    state.community = normalizeCommunitySnapshot(await getJson(`/api/community?urls=${encodeURIComponent(urls)}`));
    renderCommunity();
    const records = (state.community.recommendations || []).slice(0, 80).map((item) => ({
      type: "community",
      reds: item.reds,
      blue: item.blue,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      reason: item.context,
      score: Math.round((item.confidence || 0) * 100),
      ...latestBase()
    }));
    await saveRecords(records);
    setStatus("社区推荐已抓取", `识别到 ${state.community.count || 0} 条号码`);
  } catch (error) {
    setStatus("社区抓取失败", error.message, "warn");
  } finally {
    setBusy(false);
  }
}

async function deleteRecord(id) {
  if (!id) return;
  try {
    await requestJson(`/api/records?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await fetchRecords();
    setStatus("记录已删除", "列表已刷新");
  } catch (error) {
    setStatus("删除失败", error.message, "warn");
  }
}

function refreshView(viewId) {
  if (viewId === "home" && state.analysis) {
    renderLatest();
    renderSummary();
    renderAdvice();
  }
  if (viewId === "picks") {
    renderManualPicker();
    renderManualResult();
  }
  if (viewId === "analysis") renderAnalysis();
  if (viewId === "records") renderRecords();
  if (viewId === "community") renderCommunity();
  if (viewId === "account") renderAuth();
}

function wireEvents() {
  els.navButtons.forEach((button) => button.addEventListener("click", () => setActiveView(button.dataset.mobileTab)));
  els.refreshDrawsBtn.addEventListener("click", () => fetchDraws(true));
  els.generateBtn.addEventListener("click", () => generateTickets());
  els.comboRecommendBtn.addEventListener("click", generateComboRecommendTickets);
  els.replaceBtn.addEventListener("click", () => generateTickets({ replaceCurrentIssue: true }));
  els.completePickBtn.addEventListener("click", completeManualTicket);
  els.clearPickBtn.addEventListener("click", clearManualSelection);
  els.communityBtn.addEventListener("click", fetchCommunity);
  els.refreshRecordsBtn.addEventListener("click", fetchRecords);
  els.registerBtn.addEventListener("click", registerUser);
  els.loginBtn.addEventListener("click", loginUser);
  els.logoutBtn.addEventListener("click", logoutUser);
  els.favoriteIssueFilter.addEventListener("change", (event) => {
    state.filters.favoriteIssueTouched = true;
    state.filters.favoriteIssue = event.currentTarget.value || "";
    renderRecords();
  });
  els.manualIssueFilter.addEventListener("change", (event) => {
    state.filters.manualIssueTouched = true;
    state.filters.manualIssue = event.currentTarget.value || "";
    renderRecords();
  });
  els.manualStrategySelect.addEventListener("change", completeManualTicket);
  els.manualRedGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-number]");
    if (!button) return;
    const number = button.dataset.number;
    if (state.manual.reds.has(number)) state.manual.reds.delete(number);
    else if (state.manual.reds.size < 6) state.manual.reds.add(number);
    else {
      setStatus("红球最多选择 6 个", "可先取消一个红球再选择", "warn");
      return;
    }
    state.manual.completion = null;
    renderManualPicker();
    scheduleManualCompletion();
  });
  els.manualBlueGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-number]");
    if (!button) return;
    const number = button.dataset.number;
    state.manual.blue = state.manual.blue === number ? "" : number;
    state.manual.completion = null;
    renderManualPicker();
    scheduleManualCompletion();
  });
  document.addEventListener("click", (event) => {
    const copyTrigger = event.target.closest("[data-copy-ticket]");
    if (copyTrigger) copyTicketFromButton(copyTrigger);
    const favoriteTrigger = event.target.closest("[data-favorite-ticket]");
    if (favoriteTrigger) addFavorite(state.tickets[Number(favoriteTrigger.dataset.favoriteTicket)]);
    const manualFavorite = event.target.closest("[data-manual-favorite]");
    if (manualFavorite && state.manual.completion?.ticket) addFavorite(state.manual.completion.ticket);
    const communityTrigger = event.target.closest("[data-save-community]");
    if (communityTrigger) {
      const item = state.community?.recommendations?.[Number(communityTrigger.dataset.saveCommunity)];
      if (item) saveRecords([toRecord({ ...item, kind: "community", reason: item.context }, "community")]);
    }
    const deleteTrigger = event.target.closest("[data-delete-record], [data-delete-favorite], [data-delete-manual]");
    if (deleteTrigger) {
      deleteRecord(
        deleteTrigger.dataset.deleteRecord || deleteTrigger.dataset.deleteFavorite || deleteTrigger.dataset.deleteManual || ""
      );
    }
  });
}

async function initMobileApp() {
  els.sourceUrls.value = defaultSources.join("\n");
  renderManualPicker();
  renderManualResult();
  renderCommunity();
  renderAuth();
  wireEvents();
  await refreshAuth();
  await fetchDraws(false);
  await restoreSavedCommunitySnapshot();
}

initMobileApp().catch((error) => {
  console.error(error);
  setStatus("手机端初始化失败", error.message, "warn");
});
