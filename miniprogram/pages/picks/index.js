const { completeTicket, deleteRecord, fetchPicks, saveRecords, setRecordPinned } = require("../../utils/api");

const STRATEGIES = [
  { value: "balanced", label: "均衡趋势" },
  { value: "hot", label: "热号跟随" },
  { value: "cold", label: "冷号补位" },
  { value: "community", label: "社区共振" },
  { value: "blue", label: "蓝球优先" }
];

const FILTERS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待开奖" },
  { value: "won", label: "已中奖" },
  { value: "lost", label: "未中奖" }
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function createRange(total) {
  return Array.from({ length: total }, (_, index) => pad(index + 1));
}

function createOptionObjects(total, selectedValues = [], activeValue = "") {
  const selectedSet = new Set(selectedValues);
  return createRange(total).map((number) => ({
    number,
    selected: selectedSet.has(number),
    active: activeValue === number
  }));
}

function sortNumbers(values) {
  return [...values].sort((a, b) => Number(a) - Number(b));
}

function formatTime(value) {
  if (!value) return "--";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatSummary(summary) {
  const safe = summary || {};
  return {
    total: safe.total || 0,
    pendingCount: safe.pendingCount || 0,
    winCount: safe.winCount || 0,
    totalAmountText: safe.totalAmountText || "¥0"
  };
}

function formatAnnouncements(rows) {
  return (rows || []).map((item) => ({
    id: item.id,
    text: item.text
  }));
}

function formatManualRows(rows) {
  return (rows || []).map((item) => ({
    label: item.label,
    value: item.value,
    percentileText: `${item.percentile}%`
  }));
}

function formatRecord(record) {
  const prize = record.hit?.prize || null;
  const statusText =
    record.status === "pending"
      ? "待开奖"
      : record.status === "won"
        ? prize?.label || "已中奖"
        : "未中奖";
  const amountText =
    record.status === "won"
      ? prize?.amountText || "待同步"
      : record.status === "pending"
        ? "等待下一期开奖"
        : "¥0";
  const checkText = record.hit
    ? `核对期 ${record.hit.issue} · 命中 ${record.hit.hitText}`
    : record.baseIssue
      ? `基准期 ${record.baseIssue} · 等待开奖`
      : "等待开奖";

  return {
    id: record.id,
    reds: record.reds,
    blue: record.blue,
    status: record.status,
    isPinned: Boolean(record.isPinned),
    pinLabel: record.isPinned ? "取消置顶" : "置顶",
    createdAtText: formatTime(record.createdAt),
    statusText,
    amountText,
    checkText,
    isPending: record.status === "pending",
    isWon: record.status === "won",
    isLost: record.status === "lost",
    drawText: record.hit ? `开奖号码 ${record.hit.drawRed.join(" ")} + ${record.hit.drawBlue}` : "",
    prizeText: record.status === "won" ? `${statusText} · ${amountText}` : amountText
  };
}

function filterRecords(records, filterValue) {
  if (filterValue === "all") return records;
  return records.filter((record) => record.status === filterValue);
}

function toRecord(ticket) {
  return {
    type: "favorite",
    reds: ticket.reds,
    blue: ticket.blue,
    strategy: ticket.kind || "",
    reason: ticket.reason || "",
    score: ticket.score ?? null,
    baseIssue: ticket.baseIssue || "",
    baseDate: ticket.baseDate || ""
  };
}

Page({
  data: {
    loading: false,
    manualLoading: false,
    statusText: "准备就绪",
    strategyIndex: 0,
    strategyLabels: STRATEGIES.map((item) => item.label),
    currentStrategyLabel: STRATEGIES[0].label,
    filterIndex: 0,
    filterOptions: FILTERS.map((item) => item.label),
    currentFilterLabel: FILTERS[0].label,
    latestDraw: null,
    redOptions: createOptionObjects(33),
    blueOptions: createOptionObjects(16),
    selectedReds: [],
    selectedBlue: "",
    manualTicket: null,
    hasManualTicket: false,
    manualRows: [],
    manualTypeLabel: "",
    summary: formatSummary(null),
    records: [],
    filteredRecords: [],
    hasAnnouncements: false,
    announcements: []
  },

  onLoad() {
    this.refreshPicks();
  },

  onShow() {
    if (this.data.records.length) {
      this.refreshPicks(false);
    }
  },

  onPullDownRefresh() {
    this.refreshPicks(false);
  },

  async refreshPicks(showLoading = true) {
    if (showLoading) {
      this.setData({ loading: true, statusText: "正在同步我的选号" });
    }
    try {
      const payload = await fetchPicks();
      const records = (payload.records || []).map(formatRecord);
      const currentFilter = FILTERS[this.data.filterIndex]?.value || "all";
      this.setData({
        latestDraw: payload.latestDraw || null,
        summary: formatSummary(payload.summary),
        announcements: formatAnnouncements(payload.announcements),
        hasAnnouncements: Boolean(payload.announcements?.length),
        records,
        filteredRecords: filterRecords(records, currentFilter),
        statusText: "我的选号已更新"
      });
    } catch (error) {
      this.setData({ statusText: `加载失败：${error.message}` });
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  onStrategyChange(event) {
    const index = Number(event.detail.value || 0);
    this.setData({
      strategyIndex: index,
      currentStrategyLabel: STRATEGIES[index].label
    });
  },

  onFilterChange(event) {
    const index = Number(event.detail.value || 0);
    const currentFilter = FILTERS[index]?.value || "all";
    this.setData({
      filterIndex: index,
      currentFilterLabel: FILTERS[index]?.label || FILTERS[0].label,
      filteredRecords: filterRecords(this.data.records, currentFilter)
    });
  },

  toggleRed(event) {
    const number = event.currentTarget.dataset.number;
    const selected = new Set(this.data.selectedReds);
    if (selected.has(number)) {
      selected.delete(number);
    } else if (selected.size < 6) {
      selected.add(number);
    } else {
      wx.showToast({ title: "红球最多 6 个", icon: "none" });
      return;
    }
    const values = sortNumbers(Array.from(selected));
    this.setData({
      selectedReds: values,
      redOptions: createOptionObjects(33, values, this.data.selectedBlue),
      manualTicket: null,
      hasManualTicket: false,
      manualRows: [],
      manualTypeLabel: ""
    });
  },

  toggleBlue(event) {
    const number = event.currentTarget.dataset.number;
    const nextBlue = this.data.selectedBlue === number ? "" : number;
    this.setData({
      selectedBlue: nextBlue,
      blueOptions: createOptionObjects(16, [], nextBlue),
      manualTicket: null,
      hasManualTicket: false,
      manualRows: [],
      manualTypeLabel: ""
    });
  },

  async completeManual() {
    this.setData({ manualLoading: true, statusText: "正在补全号码" });
    try {
      const strategy = STRATEGIES[this.data.strategyIndex].value;
      const result = await completeTicket({
        reds: this.data.selectedReds,
        blue: this.data.selectedBlue,
        strategy
      });
      this.setData({
        manualTicket: result.ticket,
        hasManualTicket: Boolean(result.ticket),
        manualRows: formatManualRows(result.position?.rows || []),
        manualTypeLabel: result.position?.typeLabel || "",
        statusText: "号码补全完成"
      });
    } catch (error) {
      this.setData({ statusText: `补全失败：${error.message}` });
      wx.showToast({ title: "补全失败", icon: "none" });
    } finally {
      this.setData({ manualLoading: false });
    }
  },

  clearManual() {
    this.setData({
      selectedReds: [],
      selectedBlue: "",
      redOptions: createOptionObjects(33),
      blueOptions: createOptionObjects(16),
      manualTicket: null,
      hasManualTicket: false,
      manualRows: [],
      manualTypeLabel: "",
      statusText: "已清空当前选号"
    });
  },

  async saveManualTicket() {
    if (!this.data.manualTicket) return;
    try {
      await saveRecords([
        toRecord({
          ...this.data.manualTicket,
          baseIssue: this.data.latestDraw?.issue || "",
          baseDate: this.data.latestDraw?.date || ""
        })
      ]);
      wx.showToast({ title: "已保存", icon: "success" });
      await this.refreshPicks(false);
    } catch (error) {
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },

  async togglePinRecord(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    try {
      await setRecordPinned(id, !record.isPinned);
      wx.showToast({ title: record.isPinned ? "已取消置顶" : "已置顶", icon: "none" });
      await this.refreshPicks(false);
    } catch (error) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  deleteRecord(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: "删除号码",
      content: "删除后不会再参与开奖核对。",
      confirmText: "删除",
      confirmColor: "#d84a4a",
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await deleteRecord(id);
          wx.showToast({ title: "已删除", icon: "none" });
          await this.refreshPicks(false);
        } catch (error) {
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  }
});
