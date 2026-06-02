const { completeTicket, fetchHome, saveRecords } = require("../../utils/api");

const STRATEGIES = [
  { value: "balanced", label: "均衡趋势" },
  { value: "hot", label: "热号跟随" },
  { value: "cold", label: "冷号补位" },
  { value: "community", label: "社区共振" },
  { value: "blue", label: "蓝球优先" }
];

function formatLatestDraw(latestDraw) {
  if (!latestDraw) return null;
  return {
    issue: latestDraw.issue,
    date: latestDraw.date || "--",
    reds: latestDraw.red || [],
    blue: latestDraw.blue || "",
    source: latestDraw.source || "--",
    sum: latestDraw.shape?.sum ?? "--",
    span: latestDraw.shape?.span ?? "--",
    ac: latestDraw.shape?.ac ?? "--"
  };
}

function formatSummary(summary) {
  const safe = summary || {};
  return {
    total: safe.total || 0,
    pendingCount: safe.pendingCount || 0,
    winCount: safe.winCount || 0,
    totalAmountText: safe.totalAmountText || "¥0",
    bestText: safe.best
      ? `最佳战绩 ${safe.best.prizeLabel} · ${safe.best.prizeAmountText}`
      : "还没有中奖记录"
  };
}

function formatTrendCards(overview) {
  if (!overview) return [];
  return [
    {
      title: "热号",
      value: (overview.hotReds || []).join(" ")
    },
    {
      title: "蓝球",
      value: (overview.hotBlues || []).join(" ")
    },
    {
      title: "均值",
      value: `和值 ${overview.avgSum} / 跨度 ${overview.avgSpan}`
    }
  ];
}

function formatAnnouncements(rows) {
  return (rows || []).map((item) => ({
    id: item.id,
    text: item.text
  }));
}

function toRecord(ticket, latestDraw) {
  return {
    type: "favorite",
    reds: ticket.reds,
    blue: ticket.blue,
    strategy: ticket.kind || "",
    reason: ticket.reason || "",
    score: ticket.score ?? null,
    baseIssue: latestDraw?.issue || "",
    baseDate: latestDraw?.date || ""
  };
}

Page({
  data: {
    loading: false,
    ticketLoading: false,
    statusText: "准备就绪",
    strategyIndex: 0,
    strategyLabels: STRATEGIES.map((item) => item.label),
    currentStrategyLabel: STRATEGIES[0].label,
    latestDraw: null,
    mySummary: formatSummary(null),
    trendCards: [],
    ticket: null,
    hasTicket: false,
    announcements: [],
    hasAnnouncements: false
  },

  onLoad() {
    this.refreshHome();
  },

  onShow() {
    if (this.data.latestDraw) {
      this.refreshHome(false);
    }
  },

  onPullDownRefresh() {
    this.refreshHome(false);
  },

  async refreshHome(showLoading = true) {
    if (showLoading) {
      this.setData({ loading: true, statusText: "正在同步最新数据" });
    }
    try {
      const home = await fetchHome();
      this.setData({
        latestDraw: formatLatestDraw(home.latestDraw),
        mySummary: formatSummary(home.mySummary),
        trendCards: formatTrendCards(home.overview),
        announcements: formatAnnouncements(home.announcements),
        hasAnnouncements: Boolean(home.announcements?.length),
        statusText: home.latestDraw ? `最新开奖已同步到第 ${home.latestDraw.issue} 期` : "数据已更新"
      });
      if (!this.data.hasTicket) {
        await this.fetchSuggestedTicket(false);
      }
    } catch (error) {
      this.setData({ statusText: `加载失败：${error.message}` });
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  async fetchSuggestedTicket(showToast = true) {
    this.setData({ ticketLoading: true, statusText: "正在生成推荐号码" });
    try {
      const strategy = STRATEGIES[this.data.strategyIndex].value;
      const result = await completeTicket({ reds: [], blue: "", strategy });
      this.setData({
        ticket: result.ticket,
        hasTicket: Boolean(result.ticket),
        statusText: "已生成一组新的推荐号码"
      });
      if (showToast) wx.showToast({ title: "已更新", icon: "none" });
    } catch (error) {
      this.setData({ statusText: `生成失败：${error.message}` });
      wx.showToast({ title: "生成失败", icon: "none" });
    } finally {
      this.setData({ ticketLoading: false });
    }
  },

  onStrategyChange(event) {
    const index = Number(event.detail.value || 0);
    this.setData({
      strategyIndex: index,
      currentStrategyLabel: STRATEGIES[index].label
    });
    this.fetchSuggestedTicket(false);
  },

  generateTicket() {
    this.fetchSuggestedTicket(true);
  },

  async saveSuggestedTicket() {
    if (!this.data.ticket) return;
    try {
      await saveRecords([toRecord(this.data.ticket, this.data.latestDraw)]);
      wx.showToast({ title: "已保存到我的选号", icon: "success" });
      await this.refreshHome(false);
    } catch (error) {
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },

  goToPicks() {
    wx.switchTab({ url: "/pages/picks/index" });
  }
});
