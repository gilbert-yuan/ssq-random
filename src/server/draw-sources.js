const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { CACHE_DIR, REQUEST_HEADERS, SAMPLE_FILE } = require("./config");
const { readJson, writeJson } = require("./json-store");
const { normalizeDigits, normalizeDraw, padBall } = require("./utils");

function officialDrawUrl(limit) {
  const url = new URL("https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice");
  url.searchParams.set("name", "ssq");
  url.searchParams.set("issueCount", "");
  url.searchParams.set("issueStart", "");
  url.searchParams.set("issueEnd", "");
  url.searchParams.set("dayStart", "");
  url.searchParams.set("dayEnd", "");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("week", "");
  url.searchParams.set("systemType", "PC");
  return url;
}

function fallbackHistoryUrl(limit) {
  const year = new Date().getFullYear();
  const end = Number(`${String(year).slice(2)}999`);
  const startYear = year - Math.max(1, Math.ceil(limit / 150));
  const start = Number(`${String(startYear).slice(2)}001`);
  const url = new URL("https://datachart.500.com/ssq/history/newinc/history.php");
  url.searchParams.set("start", String(start));
  url.searchParams.set("end", String(end));
  return url;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  if (typeof fetch !== "function") {
    return fetchWithNodeHttp(url, options, timeoutMs);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...REQUEST_HEADERS,
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function fetchWithNodeHttp(url, options = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const target = new URL(String(url));
    const transport = target.protocol === "https:" ? https : http;
    const requestHeaders = {
      ...REQUEST_HEADERS,
      ...(options.headers || {})
    };
    const request = transport.request(
      target,
      {
        method: options.method || "GET",
        headers: requestHeaders,
        timeout: timeoutMs
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          const rawHeaders = response.headers;
          const text = () => Promise.resolve(body.toString("utf8"));
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            statusText: response.statusMessage || "",
            headers: {
              get: (name) => rawHeaders[name.toLowerCase()] || null
            },
            text,
            json: async () => JSON.parse(await text()),
            arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength))
          });
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error(`request timeout after ${timeoutMs}ms`)));
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function isFreshCache(cached, ttlMs) {
  if (!cached || typeof cached.cachedAt !== "number" || !Number.isFinite(cached.cachedAt)) return false;
  return Date.now() - cached.cachedAt < ttlMs;
}

async function fetchOfficialDraws(limit, refresh) {
  const cacheFile = path.join(CACHE_DIR, `official-ssq-${limit}.json`);
  if (!refresh) {
    const cached = await readJson(cacheFile, null);
    if (isFreshCache(cached, 1000 * 60 * 30)) {
      return { ...cached, fromCache: true };
    }
  }

  const url = officialDrawUrl(limit);
  const response = await fetchWithTimeout(url);
  const payload = await response.json();
  const rows = Array.isArray(payload.result) ? payload.result : [];
  const draws = rows.map(normalizeDraw).filter(Boolean);
  if (!draws.length) throw new Error("official API returned no draw rows");

  const result = {
    source: "official",
    sourceUrl: url.toString(),
    fetchedAt: new Date().toISOString(),
    cachedAt: Date.now(),
    draws
  };
  await writeJson(cacheFile, result);
  return result;
}

function stripHtml(text) {
  return normalizeDigits(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parse500History(html, limit) {
  const rows = normalizeDigits(html).match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const draws = [];

  for (const row of rows) {
    const cleanRow = row.replace(/<!--[\s\S]*?-->/g, "");
    const cells = [...cleanRow.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      stripHtml(match[1])
    );
    if (cells.length < 16) continue;

    const issue = cells[0];
    const reds = cells
      .slice(1, 7)
      .filter((item) => /^\d{1,2}$/.test(item))
      .map((item) => padBall(Number(item)));
    const blue = cells[7] && /^\d{1,2}$/.test(cells[7]) ? padBall(Number(cells[7])) : "";
    const date = cells[cells.length - 1];
    if (!/^\d{5}$/.test(issue) || reds.length !== 6 || !blue) continue;

    draws.push({
      issue: `20${issue}`,
      date,
      red: reds,
      blue,
      sales: cells[9] || "",
      poolMoney: cells[14] || "",
      source: "datachart.500.com"
    });
    if (draws.length >= limit) break;
  }

  return draws;
}

async function fetch500HistoryDraws(limit, refresh) {
  const cacheFile = path.join(CACHE_DIR, `500-ssq-${limit}.json`);
  if (!refresh) {
    const cached = await readJson(cacheFile, null);
    if (isFreshCache(cached, 1000 * 60 * 30)) {
      return { ...cached, fromCache: true };
    }
  }

  const url = fallbackHistoryUrl(limit);
  const response = await fetchWithTimeout(url, {
    headers: { Referer: "https://datachart.500.com/ssq/history/history.shtml" }
  });
  const html = await response.text();
  const draws = parse500History(html, limit);
  if (!draws.length) throw new Error("500 history page did not contain parseable draw rows");

  const result = {
    source: "500-history",
    sourceUrl: url.toString(),
    fetchedAt: new Date().toISOString(),
    cachedAt: Date.now(),
    warning: "官方接口不可用，已切换到 500 彩票网公开历史页。",
    draws
  };
  await writeJson(cacheFile, result);
  return result;
}

async function loadFallbackDraws() {
  const fallback = await readJson(SAMPLE_FILE, { draws: [] });
  return {
    source: "sample",
    sourceUrl: "data/ssq-sample.json",
    fetchedAt: new Date().toISOString(),
    cachedAt: Date.now(),
    warning: "网络或数据源不可用，当前展示内置样例数据。",
    draws: (fallback.draws || []).map(normalizeDraw).filter(Boolean)
  };
}

module.exports = {
  fetch500HistoryDraws,
  fetchOfficialDraws,
  fetchWithTimeout,
  loadFallbackDraws
};
