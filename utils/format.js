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

export function percentWidth(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export function formatTicketText(ticket) {
  const reds = Array.isArray(ticket?.reds) ? ticket.reds : Array.isArray(ticket?.red) ? ticket.red : [];
  return `${reds.join(" ")} + ${ticket?.blue || ""}`.trim();
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), globalThis.location?.origin || "http://localhost");
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

export function recordTypeLabel(type) {
  return type === "community" ? "社区" : type === "favorite" ? "收藏" : "建议";
}

export function hitText(hit) {
  return hit?.hitText || "待核对";
}

export function isStrongHit(hit) {
  return Boolean(hit && (hit.redHits >= 4 || (hit.redHits >= 3 && hit.blueHit)));
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
