import { getJson, postJson, requestJson } from "../services/api.js";
import { defaultSources, state, strategyLabels } from "../state.js";
import { analyze, drawKey, getDrawShape, pct } from "../domain/analysis.js";
import { generateTicket } from "../domain/generator.js";
import { renderBarChart, renderLineChart, renderPositionRows } from "../components/charts.js";
import { ball, escapeHtml, hitBadge, metric, percentWidth, safeExternalUrl, shapeItem } from "../components/html.js";
import { renderNumberGrid } from "../components/number-picker.js";
import { bootstrapDashboardData } from "./bootstrap.js";

const $ = (selector) => document.querySelector(selector);
const TICKET_BATCH_SIZE = 6;

const els = {
  limitInput: $("#limitInput"),
  fetchDrawsBtn: $("#fetchDrawsBtn"),
  generateBtn: $("#generateBtn"),
  refreshTicketsBtn: $("#refreshTicketsBtn"),
  communityBtn: $("#communityBtn"),
  exportBtn: $("#exportBtn"),
  registerBtn: $("#registerBtn"),
  loginBtn: $("#loginBtn"),
  logoutBtn: $("#logoutBtn"),
  strategySelect: $("#strategySelect"),
  statusBand: $("#statusBand"),
  statusDismissBtn: $("#statusDismissBtn"),
  statusText: $("#statusText"),
  sourceText: $("#sourceText"),
  authModeText: $("#authModeText"),
  authHint: $("#authHint"),
  authUserTag: $("#authUserTag"),
  authUsernameInput: $("#authUsernameInput"),
  authPasswordInput: $("#authPasswordInput"),
  authDisplayNameInput: $("#authDisplayNameInput"),
  authGuestPanel: $("#authGuestPanel"),
  authUserPanel: $("#authUserPanel"),
  authUserTitle: $("#authUserTitle"),
  authUserSummary: $("#authUserSummary"),
  authStatTotal: $("#authStatTotal"),
  authStatChecked: $("#authStatChecked"),
  authStatWins: $("#authStatWins"),
  authStatPending: $("#authStatPending"),
  latestIssue: $("#latestIssue"),
  latestIssueMobile: $("#latestIssueMobile"),
  latestBalls: $("#latestBalls"),
  latestBallsMobile: $("#latestBallsMobile"),
  latestMeta: $("#latestMeta"),
  latestMetaMobile: $("#latestMetaMobile"),
  latestActions: $("#latestActions"),
  latestActionsMobile: $("#latestActionsMobile"),
  adviceList: $("#adviceList"),
  adviceListMobile: $("#adviceListMobile"),
  confidenceText: $("#confidenceText"),
  confidenceTextMobile: $("#confidenceTextMobile"),
  sourceUrls: $("#sourceUrls"),
  sourceUrlsMobile: $("#sourceUrlsMobile"),
  communityCount: $("#communityCount"),
  communityCountMobile: $("#communityCountMobile"),
  communityResults: $("#communityResults"),
  communityResultsMobile: $("#communityResultsMobile"),
  communityAggregate: $("#communityAggregate"),
  communitySourceText: $("#communitySourceText"),
  summaryGrid: $("#summaryGrid"),
  tickets: $("#tickets"),
  ticketMode: $("#ticketMode"),
  redChart: $("#redChart"),
  blueChart: $("#blueChart"),
  shapeStats: $("#shapeStats"),
  shapeScope: $("#shapeScope"),
  favoritesPanelTab: $("#favoritesPanelTab"),
  favoriteCountTab: $("#favoriteCountTab"),
  favoriteIssueFilter: $("#favoriteIssueFilter"),
  sourceScores: $("#sourceScores"),
  sourceScoreScope: $("#sourceScoreScope"),
  recordScope: $("#recordScope"),
  recordSummary: $("#recordSummary"),
  recordList: $("#recordList"),
  manualRecordCount: $("#manualRecordCount"),
  manualRecordList: $("#manualRecordList"),
  manualIssueFilter: $("#manualIssueFilter"),
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
  oddLineChart: $("#oddLineChart"),
  tabButtons: Array.from(document.querySelectorAll("[data-tab-target]")),
  tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]"))
};

const tabOrder = els.tabButtons.map((button) => button.dataset.tabTarget).filter(Boolean);

function setStatus(message, detail = "", type = "ok", placement = "auto") {
  els.statusText.textContent = message;
  els.sourceText.textContent = detail;
  els.statusBand.classList.toggle("warn", type === "warn");
  els.statusBand.classList.toggle("top", placement === "top");
  els.statusBand.hidden = false;
}

function setBusy(isBusy) {
  [els.fetchDrawsBtn, els.generateBtn, els.refreshTicketsBtn, els.communityBtn, els.completePickBtn].forEach((button) => {
    if (button) button.disabled = isBusy;
  });
}

function setAuthBusy(isBusy) {
  state.auth.busy = isBusy;
  [els.registerBtn, els.loginBtn, els.logoutBtn, els.authUsernameInput, els.authPasswordInput, els.authDisplayNameInput].forEach(
    (node) => {
      if (node) node.disabled = isBusy;
    }
  );
}

function refreshActiveTab(tabId) {
  if (tabId === "overview" && state.analysis) renderAnalysis();
  if (tabId === "mobile-info") {
    if (state.analysis) renderLatest();
    if (state.analysis) renderAdvice();
    renderCommunity();
  }
  if (tabId === "picks") {
    renderManualPicker();
    renderManualResult();
  }
  if (tabId === "my-records") {
    renderFavorites();
    renderSavedManualRecords();
  }
  if (tabId === "analysis" && state.metrics) renderMetricDashboard();
  if (tabId === "community") {
    if (state.community) renderCommunity();
    if (state.records) renderRecords();
  }
}

function setActiveTab(tabId, { focus = false } = {}) {
  const targetButton = els.tabButtons.find((button) => button.dataset.tabTarget === tabId) || els.tabButtons[0];
  const targetId = targetButton?.dataset.tabTarget;
  if (!targetId) return;

  els.tabButtons.forEach((button) => {
    const active = button === targetButton;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  });

  els.tabPanels.forEach((panel) => {
    const active = panel.dataset.tabPanel === targetId;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });

  if (focus) targetButton.focus();
  window.requestAnimationFrame(() => refreshActiveTab(targetId));
}

function onTabKeydown(event) {
  const currentIndex = els.tabButtons.indexOf(event.currentTarget);
  if (currentIndex < 0) return;

  let nextIndex = currentIndex;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % els.tabButtons.length;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    nextIndex = (currentIndex - 1 + els.tabButtons.length) % els.tabButtons.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = els.tabButtons.length - 1;
  if (nextIndex === currentIndex) return;

  event.preventDefault();
  setActiveTab(els.tabButtons[nextIndex].dataset.tabTarget, { focus: true });
}

function wireTabs() {
  els.tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget));
    button.addEventListener("keydown", onTabKeydown);
  });
  setActiveTab(tabOrder[0] || "overview");
}

function syncAuth(payload) {
  if (typeof payload?.authenticated !== "boolean") return;
  state.auth.authenticated = payload.authenticated;
  state.auth.user = payload.user || null;
  renderAuth();
}

function isAuthRequired(error) {
  return error?.status === 401 || error?.code === "AUTH_REQUIRED";
}

function authSummaryText() {
  const summary = state.records?.summary || {};
  if (!state.auth.authenticated || !state.auth.user) {
    return "登录后自动记录每次选号，并在下一期开奖后核对是否中奖。";
  }
  return `已记录 ${summary.total || 0} 注，已核对 ${summary.checked || 0} 注，中奖 ${summary.winCount || 0} 注，待开奖 ${summary.pendingCount || 0} 注。`;
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

function renderAuth() {
  const loggedIn = Boolean(state.auth.authenticated && state.auth.user);
  const showGuestPanel = state.auth.authenticated === false;
  const summary = state.records?.summary || {};
  if (els.authModeText) els.authModeText.textContent = loggedIn ? "已登录" : "访客模式";
  if (els.authHint) els.authHint.textContent = authSummaryText();
  if (els.authUserTag) {
    els.authUserTag.textContent = loggedIn
      ? `${state.auth.user.displayName || state.auth.user.username} · ${state.auth.user.username}`
      : "未登录";
  }
  if (els.authGuestPanel) els.authGuestPanel.hidden = !showGuestPanel;
  if (els.authUserPanel) els.authUserPanel.hidden = !loggedIn;
  if (els.authUserTitle) {
    els.authUserTitle.textContent = loggedIn ? state.auth.user.displayName || state.auth.user.username : "未登录";
  }
  if (els.authUserSummary) {
    els.authUserSummary.textContent = loggedIn
      ? `当前账号：${state.auth.user.displayName || state.auth.user.username}。系统会把你的选号按期号保存，并在下一期开奖后自动核对命中与奖金。`
      : "登录后这里会展示你的选号与中奖统计。";
  }
  if (els.authStatTotal) els.authStatTotal.textContent = String(summary.total || 0);
  if (els.authStatChecked) els.authStatChecked.textContent = String(summary.checked || 0);
  if (els.authStatWins) els.authStatWins.textContent = String(summary.winCount || 0);
  if (els.authStatPending) els.authStatPending.textContent = String(summary.pendingCount || 0);
}

function authPayloadFromInputs(includeDisplayName = false) {
  const payload = {
    username: els.authUsernameInput?.value?.trim() || "",
    password: els.authPasswordInput?.value || ""
  };
  if (includeDisplayName) payload.displayName = els.authDisplayNameInput?.value?.trim() || payload.username;
  return payload;
}

function clearAuthForm({ keepUsername = true } = {}) {
  if (!keepUsername && els.authUsernameInput) els.authUsernameInput.value = "";
  if (els.authPasswordInput) els.authPasswordInput.value = "";
  if (els.authDisplayNameInput) els.authDisplayNameInput.value = "";
}

function setTextPair(primary, secondary, text) {
  if (primary) primary.textContent = text;
  if (secondary) secondary.textContent = text;
}

function setHtmlPair(primary, secondary, html) {
  if (primary) primary.innerHTML = html;
  if (secondary) secondary.innerHTML = html;
}

function setMutedStatePair(primary, secondary, muted) {
  if (primary) primary.classList.toggle("muted", muted);
  if (secondary) secondary.classList.toggle("muted", muted);
}

function syncSourceInputs(value) {
  if (els.sourceUrls) els.sourceUrls.value = value;
  if (els.sourceUrlsMobile) els.sourceUrlsMobile.value = value;
}

function readSourceInput() {
  const mobileValue = els.sourceUrlsMobile?.value?.trim() || "";
  const desktopValue = els.sourceUrls?.value?.trim() || "";
  return mobileValue || desktopValue;
}

async function refreshAuth() {
  try {
    const payload = await getJson("/api/auth/me");
    syncAuth(payload);
  } catch {
    state.auth.authenticated = false;
    state.auth.user = null;
    renderAuth();
  }
}

async function restoreSavedCommunitySnapshot() {
  if (!state.auth.authenticated || !state.auth.user) return;
  try {
    const payload = await getJson("/api/community?saved=1");
    syncAuth(payload);
    const snapshot = normalizeCommunitySnapshot(payload.snapshot);
    if (!snapshot) return;
    state.community = snapshot;
    if (snapshot.sources?.length) {
      syncSourceInputs(snapshot.sources.map((item) => item.url).filter(Boolean).join("\n"));
    }
    renderCommunity();
  } catch (error) {
    console.warn("社区快照恢复失败", error);
  }
}

async function registerUser() {
  setAuthBusy(true);
  try {
    const payload = await postJson("/api/auth/register", authPayloadFromInputs(true));
    syncAuth(payload);
    clearAuthForm();
    setStatus("注册并登录成功", "后续生成、收藏和社区号码都会按当前用户保存。");
    await fetchRecords();
    await restoreSavedCommunitySnapshot();
  } catch (error) {
    setStatus("注册失败", error.message, "warn");
  } finally {
    setAuthBusy(false);
  }
}

async function loginUser() {
  setAuthBusy(true);
  try {
    const payload = await postJson("/api/auth/login", authPayloadFromInputs(false));
    syncAuth(payload);
    clearAuthForm();
    setStatus("登录成功", "你的个人选号记录和命中结果已可同步。");
    await fetchRecords();
    await restoreSavedCommunitySnapshot();
  } catch (error) {
    setStatus("登录失败", error.message, "warn");
  } finally {
    setAuthBusy(false);
  }
}

async function logoutUser() {
  setAuthBusy(true);
  try {
    await postJson("/api/auth/logout", {});
    state.auth.authenticated = false;
    state.auth.user = null;
    renderAuth();
    state.records = null;
    state.community = null;
    renderRecords();
    renderCommunity();
    syncSourceInputs(defaultSources.join("\n"));
    setStatus("已退出登录", "当前页面仍可分析开奖，但不会保存到个人账号。");
  } catch (error) {
    setStatus("退出失败", error.message, "warn");
  } finally {
    setAuthBusy(false);
  }
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

function formatTicketText(ticket) {
  const reds = Array.isArray(ticket?.reds) ? ticket.reds : Array.isArray(ticket?.red) ? ticket.red : [];
  return `${reds.join(" ")} + ${ticket?.blue || ""}`.trim();
}

function copyButton(ticket, extraClass = "") {
  const text = formatTicketText(ticket);
  const className = ["small-button", "copy-button", extraClass].filter(Boolean).join(" ");
  return `<button class="${className}" data-copy-ticket="${escapeHtml(text)}" type="button" title="复制号码" aria-label="复制号码">复制</button>`;
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
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("clipboard copy failed");
}

async function copyTicketFromButton(button) {
  const text = button.dataset.copyTicket || "";
  if (!text) return;

  try {
    await writeClipboardText(text);
    const originalText = button.textContent;
    button.textContent = "已复制";
    button.classList.add("copied");
    setStatus("已复制号码", text);
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.textContent = originalText || "复制";
      button.classList.remove("copied");
    }, 1200);
  } catch {
    setStatus("复制失败", "浏览器未允许访问剪贴板", "warn");
  }
}

function currentManualTicket() {
  return state.manual.completion?.ticket || null;
}

function formatSavedTime(value) {
  const text = String(value || "");
  return text ? text.replace("T", " ").slice(5, 16) : "";
}

function recordToSavedTicket(record) {
  return {
    id: record.id,
    reds: record.reds,
    blue: record.blue,
    kind: record.strategy || "",
    strategy: record.strategy || "",
    score: record.score ?? "--",
    reason: record.reason || `已记录于 ${formatSavedTime(record.createdAt) || "本期"}`,
    baseIssue: record.baseIssue || "",
    baseDate: record.baseDate || "",
    createdAt: record.createdAt || ""
  };
}

function recordToDisplayTicket(record) {
  return {
    id: record.id,
    reds: record.reds,
    blue: record.blue,
    kind: record.strategy || "",
    strategy: record.strategy || "",
    score: record.score ?? "--",
    reason: record.reason || `已记录于 ${formatSavedTime(record.createdAt) || "本期"}`,
    savedAt: formatSavedTime(record.createdAt) || "刚刚",
    baseIssue: record.baseIssue || "",
    status: record.status || "pending",
    hit: record.hit || null
  };
}

function buildTicketModes(selected, size = TICKET_BATCH_SIZE) {
  const seed =
    selected === "balanced"
      ? ["balanced", "balanced", "hot", "cold", "blue", "balanced"]
      : [selected, selected, selected, "balanced", "hot", "cold"];
  return seed.slice(0, size);
}

function generateTicketBatch(selected, size = TICKET_BATCH_SIZE) {
  const modes = buildTicketModes(selected, size);
  const tickets = [];
  const seen = new Set();
  let guard = 0;

  while (tickets.length < size && guard < size * 16) {
    const mode = modes[tickets.length % modes.length] || selected;
    const ticket = generateTicket(state.analysis, mode, state.community);
    const key = drawKey(ticket);
    if (!seen.has(key)) {
      seen.add(key);
      tickets.push(ticket);
    }
    guard += 1;
  }

  while (tickets.length < size) {
    const ticket = generateTicket(state.analysis, selected, state.community);
    tickets.push(ticket);
  }

  return tickets.slice(0, size);
}

function syncCurrentIssueTicketsFromRecords() {
  const latestIssue = state.draws[0]?.issue || "";
  const records = state.records?.records || [];
  if (!latestIssue || !records.length) {
    if (!state.tickets.length) {
      els.tickets.classList.add("empty-state");
      els.tickets.textContent = state.auth.authenticated ? "本期暂无已记录建议号，点击“生成建议号”" : "登录后可直接查看本期已记录建议号";
    }
    return;
  }

  const currentTickets = records
    .filter((item) => item.type === "ticket" && item.baseIssue === latestIssue)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, TICKET_BATCH_SIZE)
    .map(recordToSavedTicket);

  if (!currentTickets.length) {
    if (!state.tickets.length) {
      els.tickets.classList.add("empty-state");
      els.tickets.textContent = "本期暂无已记录建议号，点击“生成建议号”";
      els.ticketMode.textContent = strategyLabels[els.strategySelect.value];
    }
    return;
  }

  renderTickets(currentTickets);
  els.ticketMode.textContent = `本期已记录 ${Math.min(currentTickets.length, TICKET_BATCH_SIZE)} 注`;
}

function renderLatest() {
  const latest = state.draws[0];
  if (!latest) return;
  const shape = getDrawShape(latest, state.draws[1]);
  const issueText = latest.issue ? `第 ${latest.issue} 期` : "最新";
  const ballsHtml = `
    <div class="ticket-inline-row compact-inline-row">
      <div class="ball-row">${[...latest.red.map((item) => ball(item)), ball(latest.blue, "blue")].join("")}</div>
      <div class="ticket-mini-actions compact-ticket-actions">${copyButton(latest, "mini-button")}</div>
    </div>
  `;
  const metaHtml = `
    <dt>开奖日期</dt><dd>${escapeHtml(latest.date || "--")}</dd>
    <dt>数据源</dt><dd>${escapeHtml(latest.source || "cwl.gov.cn")}</dd>
    <dt>红球和值</dt><dd>${shape.sum}</dd>
    <dt>跨度 / AC</dt><dd>${shape.span} / ${shape.ac}</dd>
  `;
  setTextPair(els.latestIssue, els.latestIssueMobile, issueText);
  setHtmlPair(els.latestBalls, els.latestBallsMobile, ballsHtml);
  setHtmlPair(els.latestMeta, els.latestMetaMobile, metaHtml);
  setMutedStatePair(els.latestActions, els.latestActionsMobile, true);
  setTextPair(els.latestActions, els.latestActionsMobile, "");
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
  const longMiss = a.coldReds.slice(0, 3).map(formatMissItem).join(" ");
  const trends = a.trendReds.slice(0, 4).map((item) => item.number).join(" ");
  const blues = a.hotBlues.slice(0, 3).map((item) => `${item.number}(${item.miss})`).join(" ");
  const quantiles = a.missQuantiles || { p75: 0, p90: 0 };
  const alerts = (a.missAlerts || []).slice(0, 3).map(formatMissItem).join(" ") || "无";

  const confidenceText = `近 ${a.recentWindow} 期`;
  const adviceHtml = [
    `三区 ${a.shape.zones.map((value) => pct(value, zoneTotal)).join("% / ")}%，奇偶 ${pct(a.shape.parity.odd, oddTotal)} / ${pct(a.shape.parity.even, oddTotal)}，大小 ${pct(a.shape.size.big, sizeTotal)} / ${pct(a.shape.size.small, sizeTotal)}。`,
    `趋势红球 ${trends}；长遗漏 ${longMiss || "无"}；跨度 ${a.shape.spanAverage} / AC ${a.shape.acAverage}。`,
    `遗漏分位 P75=${quantiles.p75} P90=${quantiles.p90}；预警 ${alerts}；蓝球关注 ${blues}。`
  ]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  setTextPair(els.confidenceText, els.confidenceTextMobile, confidenceText);
  setHtmlPair(els.adviceList, els.adviceListMobile, adviceHtml);
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
  state.tickets = tickets.slice(0, TICKET_BATCH_SIZE);
  els.tickets.classList.remove("empty-state");
  els.tickets.innerHTML = state.tickets
    .map(
      (ticket, index) => `
      <div class="ticket">
        <div class="ticket-head">
          <span>建议 ${index + 1}</span>
          <span>${escapeHtml(strategyLabels[ticket.kind] || ticket.kind)} · ${escapeHtml(ticket.score)} 分</span>
        </div>
        <div class="ticket-inline-row">
          <div class="ball-row">
            ${ticket.reds.map((item) => ball(item, "red", true)).join("")}
            ${ball(ticket.blue, "blue", true)}
          </div>
          <div class="ticket-mini-actions">
            ${copyButton(ticket, "mini-button")}
            <button class="small-button mini-button" data-favorite="${index}" type="button">收藏</button>
          </div>
        </div>
        <p>${escapeHtml(ticket.reason)}</p>
      </div>
    `
    )
    .join("");
}

async function replaceCurrentIssueTicketRecords() {
  const latestIssue = state.draws[0]?.issue || "";
  const records = state.records?.records || [];
  if (!latestIssue || !state.auth.authenticated || !state.auth.user) return;

  const currentIssueTickets = records.filter((item) => item.type === "ticket" && item.baseIssue === latestIssue);
  if (!currentIssueTickets.length) return;

  await Promise.all(
    currentIssueTickets.map((item) => requestJson(`/api/records?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }))
  );
}

async function generateTickets({ replaceCurrentIssue = false } = {}) {
  if (!state.analysis) {
    setStatus("请先获取开奖数据", "没有历史样本时无法生成建议号", "warn");
    return;
  }
  const selected = els.strategySelect.value;
  setBusy(true);
  try {
    const tickets = generateTicketBatch(selected, TICKET_BATCH_SIZE);
    renderTickets(tickets);
    if (replaceCurrentIssue) await replaceCurrentIssueTicketRecords();
    const saveResult = await saveRecords(tickets.map((ticket) => toRecord(ticket, "ticket")));
    els.ticketMode.textContent = `${strategyLabels[selected]} · ${TICKET_BATCH_SIZE} 注`;
    if (saveResult?.ok) {
      setStatus("已生成建议号", `当前按 ${TICKET_BATCH_SIZE} 注一批输出，可点击“刷新重生成”快速换一批。`);
    } else if (saveResult?.authRequired) {
      setStatus("已生成建议号", `当前未登录，仅本地展示 ${TICKET_BATCH_SIZE} 注；登录后可刷新重生成并自动保存。`, "warn");
    }
  } catch (error) {
    syncAuth(error?.data);
    setStatus("建议号生成失败", error.message, "warn");
  } finally {
    setBusy(false);
  }
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

function renderTicketCollection(panel, emptyText, tickets) {
  if (!panel) return;
  if (!tickets.length) {
    panel.classList.add("muted");
    panel.textContent = emptyText;
    return;
  }
  panel.classList.remove("muted");
  panel.innerHTML = tickets
    .map(
      (ticket) => {
        const statusText =
          ticket.status === "won" ? `已中奖 · ${ticket.hit?.prize?.amountText || "待同步"}` : ticket.status === "lost" ? "未中奖 · ¥0" : "待开奖";
        const detailText = ticket.hit
          ? `生成基准 ${ticket.baseIssue || "--"}，核对 ${ticket.hit.issue || "--"}，命中 ${ticket.hit.hitText}，${ticket.hit.prize?.label || "未中奖"}`
          : `生成基准 ${ticket.baseIssue || "--"}，等待下一期开奖后自动核对中奖和金额`;
        return `
      <div class="ticket record-ticket">
        <div class="ticket-head"><span>${escapeHtml(strategyLabels[ticket.kind] || ticket.kind || "未标注")}</span><span>${escapeHtml(ticket.savedAt || "")}</span></div>
        <div class="ticket-inline-row record-ticket-inline-row">
          <div class="ball-row">${ticket.reds.map((red) => ball(red, "red", true)).join("")}${ball(ticket.blue, "blue", true)}</div>
          <div class="ticket-mini-actions record-ticket-actions">
            ${copyButton(ticket, "mini-button")}
            <span class="hit-badge compact">${escapeHtml(ticket.hit ? ticket.hit.hitText : "待")}</span>
            <span class="ticket-result-text compact">${escapeHtml(ticket.status === "won" ? ticket.hit?.prize?.amountText || "待同步" : ticket.status === "lost" ? "¥0" : "待开奖")}</span>
            <button class="small-button mini-button" data-delete-favorite-record="${escapeHtml(ticket.id)}" type="button">取消</button>
          </div>
        </div>
        <p>${escapeHtml(detailText)}</p>
      </div>
    `;
      }
    )
    .join("");
}

function uniqueIssueOptions(records) {
  return Array.from(new Set(records.map((item) => item.baseIssue).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
}

function syncIssueFilterOptions(select, records, selectedValue) {
  if (!select) return;
  const issues = uniqueIssueOptions(records);
  const options = [`<option value="">全部期数</option>`]
    .concat(issues.map((issue) => `<option value="${escapeHtml(issue)}">第 ${escapeHtml(issue)} 期</option>`))
    .join("");
  select.innerHTML = options;
  select.value = issues.includes(selectedValue) ? selectedValue : "";
}

function renderFavorites() {
  const favoriteSourceRecords = (state.records?.records || []).filter((item) => item.type === "favorite");
  syncIssueFilterOptions(els.favoriteIssueFilter, favoriteSourceRecords, state.filters.favoriteIssue);
  const filteredFavoriteRecords = favoriteSourceRecords
    .filter((item) => !state.filters.favoriteIssue || item.baseIssue === state.filters.favoriteIssue)
    .slice(0, 12);
  const favoriteRecords = filteredFavoriteRecords.map(recordToDisplayTicket);
  const tickets = favoriteRecords?.length ? favoriteRecords : state.favorites;
  const countText = `${tickets.length} 注`;
  if (els.favoriteCountTab) els.favoriteCountTab.textContent = countText;
  renderTicketCollection(els.favoritesPanelTab, state.auth.authenticated ? "暂无收藏" : "登录后可查看收藏记录", tickets);
}

function renderSavedManualRecords() {
  const manualSourceRecords = (state.records?.records || []).filter((item) => item.type === "manual");
  syncIssueFilterOptions(els.manualIssueFilter, manualSourceRecords, state.filters.manualIssue);
  const manualRecords = manualSourceRecords
    .filter((item) => !state.filters.manualIssue || item.baseIssue === state.filters.manualIssue)
    .slice(0, 12);
  if (els.manualRecordCount) els.manualRecordCount.textContent = `${manualRecords.length} 注`;
  if (!els.manualRecordList) return;
  if (!manualRecords.length) {
    els.manualRecordList.classList.add("muted");
    els.manualRecordList.textContent = state.auth.authenticated ? "暂无自选补全记录" : "登录后可查看自选补全记录";
    return;
  }
  els.manualRecordList.classList.remove("muted");
  els.manualRecordList.innerHTML = manualRecords
    .map((item) => {
      const statusText =
        item.status === "won" ? `已中奖 · ${item.hit?.prize?.amountText || "待同步"}` : item.status === "lost" ? "未中奖 · ¥0" : "待开奖";
      const detailText = item.hit
        ? `生成基准 ${item.baseIssue || "--"}，核对 ${item.hit.issue || "--"}，命中 ${item.hit.hitText}，${item.hit.prize?.label || "未中奖"}`
        : `生成基准 ${item.baseIssue || "--"}，等待下一期开奖后自动核对中奖和金额`;
      return `
      <div class="record-row">
        <div>
          <strong>${escapeHtml(strategyLabels[item.strategy] || item.strategy || "自选补全")} · ${escapeHtml(formatSavedTime(item.createdAt) || "刚刚")}</strong>
          <span>${escapeHtml(detailText)}</span>
        </div>
        <div class="ball-row">${item.reds.map((red) => ball(red, "red", true)).join("")}${ball(item.blue, "blue", true)}</div>
        <div class="record-actions">
          ${hitBadge(item.hit)}
          ${copyButton(item)}
          <button class="small-button" data-delete-manual-record="${escapeHtml(item.id)}" type="button">删除</button>
        </div>
        <div class="ticket-result-row">
          <span class="ticket-result-text">${escapeHtml(statusText)}</span>
        </div>
      </div>
    `
    })
    .join("");
}

async function deleteManualRecord(recordId) {
  if (!recordId) return;
  try {
    await requestJson(`/api/records?id=${encodeURIComponent(recordId)}`, { method: "DELETE" });
    await fetchRecords();
    setStatus("已删除自选记录", "当前这条自选补全号码已从个人记录中移除。");
  } catch (error) {
    syncAuth(error?.data);
    setStatus("删除失败", error.message, "warn");
  }
}

async function deleteFavoriteRecord(recordId) {
  if (!recordId) return;
  try {
    await requestJson(`/api/records?id=${encodeURIComponent(recordId)}`, { method: "DELETE" });
    state.favorites = state.favorites.filter((item) => item.id !== recordId);
    await fetchRecords();
    setStatus("已取消收藏", "当前这条收藏号码已从个人记录中移除。");
  } catch (error) {
    syncAuth(error?.data);
    setStatus("取消收藏失败", error.message, "warn");
  }
}

function renderManualPicker() {
  renderNumberGrid(els.manualRedGrid, 33, state.manual.reds, "red");
  renderNumberGrid(els.manualBlueGrid, 16, new Set(state.manual.blue ? [state.manual.blue] : []), "blue");
}

function onManualRedClick(event) {
  const button = event.target.closest("[data-number]");
  if (!button || !els.manualRedGrid.contains(button)) return;
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
}

function onManualBlueClick(event) {
  const button = event.target.closest("[data-number]");
  if (!button || !els.manualBlueGrid.contains(button)) return;
  const number = button.dataset.number;
  state.manual.blue = state.manual.blue === number ? "" : number;
  state.manual.completion = null;
  renderManualPicker();
  scheduleManualCompletion();
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
    await saveRecords([toRecord(state.manual.completion.ticket, "manual")]);
    renderManualResult();
    renderAnalysis();
    setStatus("已补全自选号码", "当前号码已同步标注到红蓝分布和指标走势图。", "ok", "top");
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
      <div class="ticket-actions">
        ${copyButton(ticket)}
        <button class="small-button" data-manual-favorite type="button">收藏当前</button>
      </div>
    </div>
  `;
  els.manualPositionList.innerHTML = renderPositionRows(completion.position?.rows || []);
  els.manualPickResult.querySelector("[data-manual-favorite]")?.addEventListener("click", () => addFavorite(ticket));
}

function renderCommunity() {
  const data = state.community;
  if (!data) {
    setTextPair(els.communityCount, els.communityCountMobile, "0 条");
    els.communitySourceText.textContent = "待抓取";
    setMutedStatePair(els.communityResults, els.communityResultsMobile, true);
    setTextPair(els.communityResults, els.communityResultsMobile, "尚未抓取");
    els.communityAggregate.classList.add("muted");
    els.communityAggregate.textContent = "暂无共振号码";
    els.sourceScoreScope.textContent = "待拉取";
    els.sourceScores.classList.add("muted");
    els.sourceScores.textContent = "暂无数据";
    return;
  }
  setTextPair(els.communityCount, els.communityCountMobile, `${data.count || 0} 条`);
  els.communitySourceText.textContent = `${data.sources?.length || 0} 个来源`;

  if (data.recommendations?.length) {
    const recommendationsHtml = data.recommendations
      .slice(0, 2)
      .map(
        (item) => `
        <div class="community-item">
          <div class="ticket-inline-row compact-inline-row">
            <div class="ball-row">
              ${item.reds.map((red) => ball(red, "red", true)).join("")}
              ${ball(item.blue, "blue", true)}
            </div>
            <div class="ticket-mini-actions compact-ticket-actions">${copyButton(item, "mini-button")}</div>
          </div>
          <p><a href="${safeExternalUrl(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceName)}</a></p>
        </div>
      `
      )
      .join("");
    setMutedStatePair(els.communityResults, els.communityResultsMobile, false);
    setHtmlPair(els.communityResults, els.communityResultsMobile, recommendationsHtml);
  } else {
    const emptyText = data.errors?.length ? "未识别到号码，可能页面需要登录、强反爬或结构已变。" : "暂无数据";
    setMutedStatePair(els.communityResults, els.communityResultsMobile, true);
    setTextPair(els.communityResults, els.communityResultsMobile, emptyText);
  }

  if (data.aggregate?.length) {
    els.communityAggregate.classList.remove("muted");
    els.communityAggregate.innerHTML = data.aggregate
      .slice(0, 4)
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
          <div class="ticket-actions">${copyButton(item)}</div>
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
    .slice(0, 5)
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
  if (!records.length) return { ok: true };
  try {
    await postJson("/api/records", { records });
    await fetchRecords();
    return { ok: true };
  } catch (error) {
    syncAuth(error?.data);
    if (isAuthRequired(error)) {
      setStatus("请先登录", "登录后才能记录每次选号，并在下期开奖后自动核对中奖。", "warn");
      return { ok: false, authRequired: true };
    }
    console.warn("记录保存失败", error);
    setStatus("记录保存失败", error.message, "warn");
    return { ok: false, error };
  }
}

function recordTypeLabel(type) {
  return type === "community" ? "社区" : type === "favorite" ? "收藏" : type === "manual" ? "自选" : "建议";
}

function renderRecords() {
  const data = state.records;
  const records = data?.records || [];
  const summary = data?.summary || {};

  syncAuth(data);
  renderAuth();

  els.recordScope.textContent = summary.checked ? `${summary.checked} 条已核对` : "待核对";
  if (!records.length) {
    els.recordSummary.classList.add("muted");
    els.recordSummary.textContent = state.auth.authenticated ? "暂无记录" : "登录后可查看个人选号记录与中奖核对";
    els.recordList.classList.add("muted");
    els.recordList.textContent = state.auth.authenticated ? "暂无历史推荐" : "当前是访客模式，尚未绑定个人选号历史。";
  } else {
    els.recordSummary.classList.remove("muted");
    els.recordSummary.innerHTML = [
      metric("记录总数", summary.total || 0, `开奖源 ${data.drawSource || "--"}`),
      metric("平均红球", summary.avgRed ?? "0.00", `${summary.checked || 0} 条已核对`),
      metric("蓝球命中率", `${summary.blueRate || 0}%`, `${summary.blueHits || 0}/${summary.checked || 0}`),
      metric(
        "中奖注数",
        summary.winCount || 0,
        summary.best ? `最佳 ${summary.best.prizeLabel || "命中"} · ${summary.best.prizeAmountText || summary.best.hitText}` : "暂无中奖"
      )
    ].join("");

    els.recordList.classList.remove("muted");
    els.recordList.innerHTML = records
      .slice(0, 5)
      .map(
        (item) => `
        <div class="record-row">
          <div>
            <strong>${escapeHtml(recordTypeLabel(item.type))} · ${escapeHtml(strategyLabels[item.strategy] || item.sourceName || item.strategy || "未标注")}</strong>
            <span>生成基准 ${escapeHtml(item.baseIssue || "--")}，核对 ${escapeHtml(item.hit?.issue || "--")}，状态 ${escapeHtml(item.status === "pending" ? "待开奖" : item.status === "won" ? "已中奖" : "未中奖")}</span>
          </div>
          <div class="ball-row">${item.reds.map((red) => ball(red, "red", true)).join("")}${ball(item.blue, "blue", true)}</div>
          <div class="record-actions">
            ${hitBadge(item.hit)}
            ${copyButton(item)}
          </div>
        </div>
      `
      )
      .join("");
  }

  syncCurrentIssueTicketsFromRecords();
  renderFavorites();
  renderSavedManualRecords();
}

async function fetchRecords() {
  try {
    state.records = await getJson(`/api/records?limit=${Number(els.limitInput.value || 240)}`);
    renderRecords();
  } catch (error) {
    syncAuth(error?.data);
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
    syncCurrentIssueTicketsFromRecords();
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
    const urls = readSourceInput()
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n");
    syncSourceInputs(urls);
    state.community = normalizeCommunitySnapshot(await getJson(`/api/community?urls=${encodeURIComponent(urls)}`));
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
  els.generateBtn.addEventListener("click", () => generateTickets());
  els.refreshTicketsBtn?.addEventListener("click", () => generateTickets({ replaceCurrentIssue: true }));
  els.communityBtn.addEventListener("click", fetchCommunity);
  els.exportBtn.addEventListener("click", downloadCsv);
  els.registerBtn?.addEventListener("click", registerUser);
  els.loginBtn?.addEventListener("click", loginUser);
  els.logoutBtn?.addEventListener("click", logoutUser);
  els.statusDismissBtn?.addEventListener("click", () => {
    els.statusBand.hidden = true;
  });
  els.strategySelect.addEventListener("change", () => {
    els.ticketMode.textContent = strategyLabels[els.strategySelect.value];
  });
  els.manualStrategySelect.addEventListener("change", completeManualTicket);
  els.completePickBtn.addEventListener("click", completeManualTicket);
  els.clearPickBtn.addEventListener("click", clearManualSelection);
  els.favoriteIssueFilter?.addEventListener("change", (event) => {
    state.filters.favoriteIssue = event.currentTarget?.value || "";
    renderFavorites();
  });
  els.manualIssueFilter?.addEventListener("change", (event) => {
    state.filters.manualIssue = event.currentTarget?.value || "";
    renderSavedManualRecords();
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-copy-ticket]");
    if (!trigger) return;
    copyTicketFromButton(trigger);
  });

  // 事件委托：建议号列表里的"收藏"按钮
  els.tickets.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-favorite]");
    if (!trigger || !els.tickets.contains(trigger)) return;
    const index = Number(trigger.dataset.favorite);
    const ticket = state.tickets[index];
    if (ticket) addFavorite(ticket);
  });

  els.manualRecordList?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-delete-manual-record]");
    if (!trigger || !els.manualRecordList.contains(trigger)) return;
    deleteManualRecord(trigger.dataset.deleteManualRecord || "");
  });

  els.favoritesPanelTab?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-delete-favorite-record]");
    if (!trigger || !els.favoritesPanelTab.contains(trigger)) return;
    deleteFavoriteRecord(trigger.dataset.deleteFavoriteRecord || "");
  });

  els.manualRedGrid.addEventListener("click", onManualRedClick);
  els.manualBlueGrid.addEventListener("click", onManualBlueClick);
  [els.sourceUrls, els.sourceUrlsMobile].filter(Boolean).forEach((input) => {
    input.addEventListener("input", (event) => {
      const value = event.currentTarget?.value || "";
      [els.sourceUrls, els.sourceUrlsMobile].filter(Boolean).forEach((node) => {
        if (node !== event.currentTarget) node.value = value;
      });
    });
  });
}

export function initDashboard() {
  syncSourceInputs(defaultSources.join("\n"));
  renderAuth();
  renderManualPicker();
  renderManualResult();
  renderCommunity();
  els.tickets.textContent = "登录后可直接查看本期已记录建议号";
  wireTabs();
  wireEvents();
  bootstrapDashboardData({ refreshAuth, restoreSavedCommunitySnapshot, fetchDraws }).catch((error) => {
    console.warn("页面初始化失败", error);
  });
}
