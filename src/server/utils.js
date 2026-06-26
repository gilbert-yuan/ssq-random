const crypto = require("crypto");

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function padBall(value) {
  return String(value).padStart(2, "0");
}

function normalizeDigits(text) {
  return String(text || "").replace(/[\uFF10-\uFF19]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xff10 + 48)
  );
}

function parseBallList(value, max) {
  return (
    normalizeDigits(value)
      .match(/\d{1,2}/g)
      ?.map((item) => Number(item))
      .filter((item) => item >= 1 && item <= max)
      .map(padBall) || []
  );
}

function normalizeDraw(raw) {
  const reds = parseBallList(raw.red || raw.redballs || raw.redBalls, 33).slice(0, 6);
  const blues = parseBallList(raw.blue || raw.blueballs || raw.blueBalls, 16);
  if (reds.length !== 6 || !blues.length) return null;
  return {
    issue: String(raw.code || raw.issue || raw.expect || ""),
    date: String(raw.date || raw.openTime || raw.time || ""),
    red: reds,
    blue: blues[0],
    sales: raw.sales || raw.sale || "",
    poolMoney: raw.poolmoney || raw.poolMoney || "",
    source: raw.source || "cwl.gov.cn"
  };
}

function normalizeRecord(raw) {
  const reds = parseBallList(raw.reds || raw.red || raw.redBalls, 33).slice(0, 6);
  const blues = parseBallList(raw.blue || raw.blueBalls, 16);
  if (reds.length !== 6 || !blues.length) return null;

  const type = ["ticket", "favorite", "community", "manual"].includes(raw.type) ? raw.type : "ticket";
  return {
    id: raw.id || crypto.randomUUID(),
    type,
    key: `${reds.join(",")}+${blues[0]}`,
    reds,
    blue: blues[0],
    strategy: String(raw.strategy || raw.kind || ""),
    sourceName: String(raw.sourceName || ""),
    sourceUrl: String(raw.sourceUrl || ""),
    baseIssue: String(raw.baseIssue || ""),
    baseDate: String(raw.baseDate || ""),
    reason: String(raw.reason || raw.context || "").slice(0, 240),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : null,
    createdAt: raw.createdAt || new Date().toISOString()
  };
}

function uniqueSortedReds(numbers) {
  return Array.from(new Set(numbers.filter((item) => item >= 1 && item <= 33)))
    .sort((a, b) => a - b)
    .slice(0, 6)
    .map(padBall);
}

module.exports = {
  clampInt,
  normalizeDigits,
  normalizeDraw,
  normalizeRecord,
  padBall,
  parseBallList,
  uniqueSortedReds
};
