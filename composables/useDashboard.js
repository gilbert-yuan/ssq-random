import { analyze, drawKey, getDrawShape, pct } from "~/utils/analysis.js";
import { generateTicket, runBacktestData } from "~/utils/generator.js";
import { buildDashboardCsv, downloadCsvFile } from "~/utils/export.js";
import { defaultSources, formatTicketText, recordTypeLabel, strategyLabels } from "~/utils/format.js";

export function useDashboard() {
  const { getJson, postJson } = useApiFetch();
  const { copyText } = useClipboard();

  const status = reactive({ message: "准备就绪", detail: "等待获取开奖数据", type: "ok" });
  const busy = ref(false);
  const limit = ref(240);
  const strategy = ref("cold");
  const manualStrategy = ref("cold");
  const sourceUrls = ref(defaultSources.join("\n"));
  const draws = ref([]);
  const analysis = ref(null);
  const metrics = ref(null);
  const community = ref(null);
  const tickets = ref([]);
  const favorites = ref([]);
  const records = ref(null);
  const manualReds = ref([]);
  const manualBlue = ref("");
  const manualCompletion = ref(null);
  const copiedText = ref("");
  let manualTimer = null;

  function setStatus(message, detail = "", type = "ok") {
    status.message = message;
    status.detail = detail;
    status.type = type;
  }

  function latestBase() {
    const latest = draws.value[0] || {};
    return { baseIssue: latest.issue || "", baseDate: latest.date || "" };
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

  const latestDraw = computed(() => draws.value[0] || null);
  const latestShape = computed(() => (latestDraw.value ? getDrawShape(latestDraw.value, draws.value[1]) : null));
  const summaryItems = computed(() => {
    const data = analysis.value;
    if (!data) return [];
    const topTrend = data.trendReds.slice(0, 4).map((item) => item.number).join(" ");
    const topBlue = data.hotBlues.slice(0, 3).map((item) => item.number).join(" ");
    const entropy = data.entropy || { red: 0, redMax: 0, redRatio: 0 };
    return [
      { label: "样本期数", value: data.count, detail: `最近窗口 ${data.recentWindow} 期` },
      { label: "红球均值", value: data.sum.average, detail: `近期开奖均值 ${data.sum.recentAverage}` },
      { label: "趋势红球", value: topTrend, detail: "频次、近期热度、遗漏综合" },
      { label: "红球分布熵", value: entropy.red, detail: `${entropy.red} / ${entropy.redMax} · 均衡度 ${Math.round((entropy.redRatio || 0) * 100)}%` },
      { label: "冷号阈值", value: `P75=${data.missQuantiles?.p75 || 0}`, detail: `P90=${data.missQuantiles?.p90 || 0}，默认偏冷号补位` },
      { label: "蓝球关注", value: topBlue, detail: "近期权重更高" }
    ];
  });
  const adviceItems = computed(() => {
    const data = analysis.value;
    if (!data) return [];
    const zoneTotal = data.shape.zones.reduce((sum, value) => sum + value, 0) || 1;
    const oddTotal = data.shape.parity.odd + data.shape.parity.even || 1;
    const sizeTotal = data.shape.size.big + data.shape.size.small || 1;
    const formatMissItem = (item) => `${item.number}(${item.miss}${item.missLevel === "p90" ? "⚠️" : item.missLevel === "p75" ? "⚠" : ""})`;
    const longMiss = data.coldReds.slice(0, 5).map(formatMissItem).join(" ");
    const trends = data.trendReds.slice(0, 6).map((item) => item.number).join(" ");
    const blues = data.hotBlues.map((item) => `${item.number}(${item.miss})`).join(" ");
    const quantiles = data.missQuantiles || { p75: 0, p90: 0 };
    const alerts = (data.missAlerts || []).map(formatMissItem).join(" ") || "无";
    return [
      `红球三区占比 ${data.shape.zones.map((value) => pct(value, zoneTotal)).join("% / ")}%，建议三段都有覆盖。`,
      `奇偶 ${pct(data.shape.parity.odd, oddTotal)}% / ${pct(data.shape.parity.even, oddTotal)}%，大小 ${pct(data.shape.size.big, sizeTotal)}% / ${pct(data.shape.size.small, sizeTotal)}%。`,
      `综合趋势红球：${trends}；可和长遗漏号 ${longMiss} 做少量搭配。`,
      `平均跨度 ${data.shape.spanAverage}，平均 AC ${data.shape.acAverage}，012 路常见形态 ${data.shape.common012 || "--"}。`,
      `遗漏分位 P75=${quantiles.p75} / P90=${quantiles.p90}；超阈号码：${alerts}（⚠ 超 P75，⚠️ 超 P90）。`,
      `蓝球近期关注：${blues}；蓝球更适合分组追踪，不适合一次铺满。`
    ];
  });
  const shapeItems = computed(() => {
    const data = analysis.value;
    if (!data) return [];
    const zoneTotal = data.shape.zones.reduce((sum, value) => sum + value, 0) || 1;
    const oddTotal = data.shape.parity.odd + data.shape.parity.even || 1;
    const sizeTotal = data.shape.size.big + data.shape.size.small || 1;
    const primeTotal = data.shape.prime.prime + data.shape.prime.composite || 1;
    const blueTotal = data.shape.blueOddEven.odd + data.shape.blueOddEven.even || 1;
    return [
      { label: "三区比例", value: `${data.shape.zones.map((value) => pct(value, zoneTotal)).join("% : ")}%` },
      { label: "奇偶比例", value: `${pct(data.shape.parity.odd, oddTotal)}% : ${pct(data.shape.parity.even, oddTotal)}%` },
      { label: "大小比例", value: `${pct(data.shape.size.big, sizeTotal)}% : ${pct(data.shape.size.small, sizeTotal)}%` },
      { label: "质合比例", value: `${pct(data.shape.prime.prime, primeTotal)}% : ${pct(data.shape.prime.composite, primeTotal)}%` },
      { label: "012 路", value: data.shape.mod012.join(" : ") },
      { label: "平均跨度", value: data.shape.spanAverage },
      { label: "平均 AC", value: data.shape.acAverage },
      { label: "平均重号", value: data.shape.repeatAverage.toFixed(2) },
      { label: "平均连号", value: data.shape.consecutiveAverage.toFixed(2) },
      { label: "平均邻号 (差≤2)", value: data.shape.adjacentAverage.toFixed(2) },
      { label: "平均同尾号", value: data.shape.sameTailAverage.toFixed(2) },
      { label: "蓝球奇偶", value: `${pct(data.shape.blueOddEven.odd, blueTotal)}% : ${pct(data.shape.blueOddEven.even, blueTotal)}%` }
    ];
  });
  const manualTicket = computed(() => manualCompletion.value?.ticket || null);
  const redMarkers = computed(() => manualTicket.value?.reds || []);
  const blueMarkers = computed(() => (manualTicket.value?.blue ? [manualTicket.value.blue] : []));
  const backtest = ref(null);

  async function fetchRecords() {
    try {
      records.value = await getJson(`/api/records?limit=${Number(limit.value || 240)}`);
    } catch (error) {
      console.warn("记录读取失败", error);
    }
  }

  async function fetchMetrics() {
    metrics.value = await getJson(`/api/metrics?limit=${Number(limit.value || 240)}`);
  }

  async function fetchDraws(refresh = false) {
    busy.value = true;
    setStatus("正在获取开奖数据", "连接公开开奖数据源并写入 PostgreSQL");
    try {
      const data = await getJson(`/api/draws?limit=${Number(limit.value || 240)}${refresh ? "&refresh=1" : ""}`);
      draws.value = data.draws || [];
      analysis.value = analyze(draws.value);
      await fetchMetrics();
      const detail = data.source === "official"
        ? `官方数据 ${draws.value.length} 期，${data.fromCache ? "来自本地缓存" : "刚刚更新"}，PostgreSQL 已同步`
        : `${data.warning || "使用备用数据"} ${data.error ? `原因：${data.error}` : ""}`;
      setStatus(data.source === "official" ? "开奖数据已更新" : "使用备用数据", detail, data.source === "official" ? "ok" : "warn");
    } catch (error) {
      setStatus("获取失败", error.message, "warn");
    } finally {
      busy.value = false;
      fetchRecords();
    }
  }

  async function saveRecords(recordsToSave) {
    if (!recordsToSave.length) return;
    try {
      await postJson("/api/records", { records: recordsToSave });
      await fetchRecords();
    } catch (error) {
      console.warn("记录保存失败", error);
    }
  }

  function runBacktest(kind) {
    if (!draws.value.length) return;
    backtest.value = runBacktestData(draws.value, kind, community.value);
  }

  function generateTickets() {
    if (!analysis.value) {
      setStatus("请先获取开奖数据", "没有历史样本时无法生成建议号", "warn");
      return;
    }
    const modes = strategy.value === "cold"
      ? ["cold", "cold", "balanced", "blue", "hot", "cold"]
      : strategy.value === "balanced"
        ? ["balanced", "cold", "hot", "blue", "balanced", "cold"]
        : [strategy.value, strategy.value, "cold", "balanced", "hot", "blue"];
    const generated = [];
    modes.forEach((mode) => {
      generated.push(generateTicket(analysis.value, mode, community.value, { previousTickets: generated }));
    });
    tickets.value = generated;
    saveRecords(tickets.value.map((ticket) => toRecord(ticket, "ticket")));
    runBacktest(strategy.value);
    setStatus("已生成建议号", "建议号来自历史分布权重、形态约束和策略回测，仅供参考。");
  }

  function addFavorite(ticket) {
    if (!ticket) return;
    const key = drawKey(ticket);
    if (favorites.value.some((item) => drawKey(item) === key)) {
      setStatus("已在收藏中", key);
      return;
    }
    favorites.value.push({ ...ticket, savedAt: new Date().toLocaleString() });
    saveRecords([toRecord(ticket, "favorite")]);
    setStatus("已收藏号码", key);
  }

  async function fetchCommunity() {
    busy.value = true;
    setStatus("正在拉取社区推荐", "解析公开页面中的红蓝球组合");
    try {
      const urls = sourceUrls.value.split(/\n+/).map((item) => item.trim()).filter(Boolean).join("\n");
      community.value = await getJson(`/api/community?urls=${encodeURIComponent(urls)}`);
      const communityRecords = (community.value.recommendations || []).slice(0, 80).map((item) => ({
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
      const errorText = community.value.errors?.length ? `，${community.value.errors.length} 个来源未成功` : "";
      setStatus("社区推荐已拉取", `识别到 ${community.value.count || 0} 条号码${errorText}`);
    } catch (error) {
      setStatus("社区拉取失败", error.message, "warn");
    } finally {
      busy.value = false;
    }
  }

  function toggleManualRed(number) {
    const next = new Set(manualReds.value);
    if (next.has(number)) next.delete(number);
    else if (next.size < 6) next.add(number);
    else {
      setStatus("红球最多选择 6 个", "可先取消一个红球再选择", "warn");
      return;
    }
    manualReds.value = Array.from(next).sort((a, b) => Number(a) - Number(b));
    manualCompletion.value = null;
    scheduleManualCompletion();
  }

  function toggleManualBlue(number) {
    manualBlue.value = manualBlue.value === number ? "" : number;
    manualCompletion.value = null;
    scheduleManualCompletion();
  }

  function scheduleManualCompletion() {
    clearTimeout(manualTimer);
    if (!manualReds.value.length && !manualBlue.value) return;
    manualTimer = setTimeout(() => completeManualTicket(), 220);
  }

  async function completeManualTicket() {
    if (!analysis.value) {
      setStatus("请先获取开奖数据", "自选补全需要历史指标作为规则依据", "warn");
      return;
    }
    try {
      manualCompletion.value = await postJson("/api/complete-ticket", {
        reds: manualReds.value,
        blue: manualBlue.value,
        strategy: manualStrategy.value
      });
      setStatus("已补全自选号码", "当前号码已同步标注到红蓝分布和指标走势图。");
    } catch (error) {
      setStatus("自选补全失败", error.message, "warn");
    }
  }

  function clearManualSelection() {
    manualReds.value = [];
    manualBlue.value = "";
    manualCompletion.value = null;
  }

  async function copyTicket(ticket) {
    const text = formatTicketText(ticket);
    try {
      await copyText(text);
      copiedText.value = text;
      setStatus("已复制号码", text);
      window.setTimeout(() => {
        if (copiedText.value === text) copiedText.value = "";
      }, 1200);
    } catch {
      setStatus("复制失败", "浏览器未允许访问剪贴板", "warn");
    }
  }

  async function copyTopTickets(count) {
    const selected = tickets.value.slice(0, count);
    if (!selected.length) {
      setStatus("暂无可复制号码", "请先生成建议号", "warn");
      return;
    }
    const text = selected.map((ticket, index) => `第${index + 1}注：${formatTicketText(ticket)}`).join("\n");
    try {
      await copyText(text);
      copiedText.value = `top-${selected.length}`;
      setStatus(`已复制前 ${selected.length} 注`, text.replace(/\n/g, "；"));
      window.setTimeout(() => {
        if (copiedText.value === `top-${selected.length}`) copiedText.value = "";
      }, 1200);
    } catch {
      setStatus("复制失败", "浏览器未允许访问剪贴板", "warn");
    }
  }

  function exportCsv() {
    const csv = buildDashboardCsv({ tickets: tickets.value, favorites: favorites.value, community: community.value, records: records.value });
    if (csv.split("\n").length <= 1) {
      setStatus("暂无可导出内容", "请先生成建议号或拉取社区推荐", "warn");
      return;
    }
    downloadCsvFile(csv);
    setStatus("CSV 已导出", "包含建议号、收藏号、社区共振号和命中记录");
  }

  onMounted(() => fetchDraws(false));
  onBeforeUnmount(() => clearTimeout(manualTimer));

  return {
    status,
    busy,
    limit,
    strategy,
    manualStrategy,
    sourceUrls,
    draws,
    analysis,
    metrics,
    community,
    tickets,
    favorites,
    records,
    manualReds,
    manualBlue,
    manualCompletion,
    manualTicket,
    redMarkers,
    blueMarkers,
    copiedText,
    latestDraw,
    latestShape,
    summaryItems,
    adviceItems,
    shapeItems,
    backtest,
    strategyLabels,
    recordTypeLabel,
    fetchDraws,
    generateTickets,
    fetchCommunity,
    addFavorite,
    copyTopTickets,
    toggleManualRed,
    toggleManualBlue,
    completeManualTicket,
    clearManualSelection,
    copyTicket,
    exportCsv
  };
}
