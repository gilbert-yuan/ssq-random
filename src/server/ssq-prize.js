const path = require("path");
const { CACHE_DIR } = require("./config");
const { fetchWithTimeout } = require("./draw-sources");
const { readJson, writeJson } = require("./json-store");
const { normalizeDigits } = require("./utils");

const FIXED_PRIZES = {
  3: 3000,
  4: 200,
  5: 10,
  6: 5
};

function formatMoney(amount) {
  if (!Number.isFinite(amount)) return "待同步";
  return `¥${Math.round(amount).toLocaleString("zh-CN")}`;
}

function parseMoney(text) {
  const numeric = Number(String(text || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function stripHtml(text) {
  return normalizeDigits(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortIssue(issue) {
  const text = String(issue || "").trim();
  return text.length >= 5 ? text.slice(-5) : text;
}

function buildPrizeRange(issues) {
  const years = issues
    .map((issue) => Number(String(issue || "").slice(0, 4)))
    .filter(Number.isFinite);

  if (!years.length) {
    const currentYear = new Date().getFullYear();
    return {
      start: `${String(currentYear).slice(2)}001`,
      end: `${String(currentYear).slice(2)}999`
    };
  }

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  return {
    start: `${String(minYear).slice(2)}001`,
    end: `${String(maxYear).slice(2)}999`
  };
}

function prizeHistoryUrl(start, end) {
  const url = new URL("https://datachart.500.com/ssq/history/newinc/history.php");
  url.searchParams.set("start", String(start));
  url.searchParams.set("end", String(end));
  return url;
}

function isFreshCache(cached, ttlMs) {
  if (!cached || typeof cached.cachedAt !== "number" || !Number.isFinite(cached.cachedAt)) return false;
  return Date.now() - cached.cachedAt < ttlMs;
}

function parsePrizeTable(html) {
  const rows = normalizeDigits(html).match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const byIssue = {};

  for (const row of rows) {
    const cleanRow = row.replace(/<!--[\s\S]*?-->/g, "");
    const cells = [...cleanRow.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      stripHtml(match[1])
    );
    if (cells.length < 16) continue;

    const issue = cells[0];
    if (!/^\d{5}$/.test(issue)) continue;

    byIssue[`20${issue}`] = {
      issue: `20${issue}`,
      poolMoney: parseMoney(cells[9]),
      firstPrizeCount: Number(cells[10].replace(/[^\d]/g, "")) || 0,
      firstPrizeAmount: parseMoney(cells[11]),
      secondPrizeCount: Number(cells[12].replace(/[^\d]/g, "")) || 0,
      secondPrizeAmount: parseMoney(cells[13]),
      sales: parseMoney(cells[14]),
      date: cells[15] || ""
    };
  }

  return byIssue;
}

async function loadPrizeDetailsByIssue(issues, refresh = false) {
  const validIssues = Array.from(new Set(issues.map((issue) => String(issue || "")).filter(Boolean)));
  if (!validIssues.length) return {};

  const range = buildPrizeRange(validIssues);
  const cacheFile = path.join(CACHE_DIR, `500-prizes-${range.start}-${range.end}.json`);

  if (!refresh) {
    const cached = await readJson(cacheFile, null);
    if (isFreshCache(cached, 1000 * 60 * 30) && cached.byIssue) {
      return cached.byIssue;
    }
  }

  try {
    const url = prizeHistoryUrl(range.start, range.end);
    const response = await fetchWithTimeout(
      url,
      {
        headers: { Referer: "https://datachart.500.com/ssq/history/history.shtml" }
      },
      12000
    );
    const html = await response.text();
    const byIssue = parsePrizeTable(html);
    const payload = {
      source: url.toString(),
      cachedAt: Date.now(),
      fetchedAt: new Date().toISOString(),
      byIssue
    };
    await writeJson(cacheFile, payload);
    return byIssue;
  } catch {
    const cached = await readJson(cacheFile, null);
    return cached?.byIssue || {};
  }
}

function buildPrize(tier, amount, options = {}) {
  const numericAmount = Number.isFinite(amount) ? amount : null;
  const label = `${tier}等奖`;
  const isFloating = options.isFloating || false;
  return {
    won: true,
    tier,
    label,
    amount: numericAmount,
    amountText: numericAmount == null ? (isFloating ? "浮动奖" : "待同步") : formatMoney(numericAmount),
    isFloating,
    isJackpot: tier <= 2 || numericAmount >= 100000,
    ruleKey: options.ruleKey || ""
  };
}

function evaluatePrize(redHits, blueHit, prizeDetail = null) {
  if (redHits === 6 && blueHit) {
    return buildPrize(1, prizeDetail?.firstPrizeAmount ?? null, {
      isFloating: true,
      ruleKey: "6+1"
    });
  }
  if (redHits === 6 && !blueHit) {
    return buildPrize(2, prizeDetail?.secondPrizeAmount ?? null, {
      isFloating: true,
      ruleKey: "6+0"
    });
  }
  if (redHits === 5 && blueHit) {
    return buildPrize(3, FIXED_PRIZES[3], { ruleKey: "5+1" });
  }
  if ((redHits === 5 && !blueHit) || (redHits === 4 && blueHit)) {
    return buildPrize(4, FIXED_PRIZES[4], { ruleKey: redHits === 5 ? "5+0" : "4+1" });
  }
  if ((redHits === 4 && !blueHit) || (redHits === 3 && blueHit)) {
    return buildPrize(5, FIXED_PRIZES[5], { ruleKey: redHits === 4 ? "4+0" : "3+1" });
  }
  if (blueHit && redHits <= 2) {
    return buildPrize(6, FIXED_PRIZES[6], { ruleKey: `${redHits}+1` });
  }
  return {
    won: false,
    tier: null,
    label: "未中奖",
    amount: 0,
    amountText: "¥0",
    isFloating: false,
    isJackpot: false,
    ruleKey: `${redHits}+${blueHit}`
  };
}

module.exports = {
  evaluatePrize,
  formatMoney,
  loadPrizeDetailsByIssue,
  shortIssue
};
