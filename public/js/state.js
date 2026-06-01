export const state = {
  draws: [],
  analysis: null,
  metrics: null,
  community: null,
  tickets: [],
  favorites: [],
  records: null,
  manual: {
    reds: new Set(),
    blue: "",
    completion: null,
    timer: null
  }
};

export const defaultSources = [
  "https://zx.500.com/ssq/n_zjtj/",
  "https://zx.500.com/ssq/zhuanjiashahao.php",
  "https://bbss.17500.cn/forum-35-1.html"
];

export const strategyLabels = {
  balanced: "均衡趋势",
  hot: "热号追踪",
  cold: "冷号补位",
  community: "社区共振",
  blue: "蓝球重点"
};
