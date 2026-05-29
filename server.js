const http = require("node:http");
const crypto = require("node:crypto");
const dns = require("node:dns/promises");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const SAMPLE_FILE = path.join(DATA_DIR, "ssq-sample.json");
const COMMUNITY_SOURCES_FILE = path.join(DATA_DIR, "community-sources.json");
const RECORDS_FILE = path.join(DATA_DIR, "records.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Referer: "https://www.cwl.gov.cn/"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

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

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function readRequestBody(req, limit = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function normalizeRecord(raw) {
  const reds = parseBallList(raw.reds || raw.red || raw.redBalls, 33).slice(0, 6);
  const blues = parseBallList(raw.blue || raw.blueBalls, 16);
  if (reds.length !== 6 || !blues.length) return null;

  const type = ["ticket", "favorite", "community"].includes(raw.type) ? raw.type : "ticket";
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

async function readRecords() {
  const data = await readJson(RECORDS_FILE, { version: 1, records: [] });
  return {
    version: 1,
    records: Array.isArray(data.records) ? data.records.map(normalizeRecord).filter(Boolean) : []
  };
}

async function appendRecords(items) {
  const store = await readRecords();
  const existing = new Set(
    store.records.map((item) =>
      [item.type, item.key, item.baseIssue, item.strategy, item.sourceName].join("|")
    )
  );
  const added = [];

  for (const raw of items) {
    const record = normalizeRecord(raw);
    if (!record) continue;
    const uniqueKey = [record.type, record.key, record.baseIssue, record.strategy, record.sourceName].join("|");
    if (existing.has(uniqueKey)) continue;
    existing.add(uniqueKey);
    added.push(record);
  }

  if (added.length) {
    store.records = [...added, ...store.records].slice(0, 3000);
    await writeJson(RECORDS_FILE, store);
  }

  return { added, store };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
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

async function fetchOfficialDraws(limit, refresh) {
  const cacheFile = path.join(CACHE_DIR, `official-ssq-${limit}.json`);
  if (!refresh) {
    const cached = await readJson(cacheFile, null);
    if (cached && Date.now() - cached.cachedAt < 1000 * 60 * 30) {
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
    if (cached && Date.now() - cached.cachedAt < 1000 * 60 * 30) {
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

function isBlockedIp(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((item) => Number(item));
    const [first, second] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }
  if (ipVersion === 6) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:")
    );
  }
  return false;
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    isBlockedIp(host)
  );
}

function parseSourceParam(searchParams) {
  const raw = searchParams.get("urls");
  if (!raw) return null;
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((url, index) => ({ name: `自定义来源 ${index + 1}`, url }));
}

async function validateSource(source) {
  const target = new URL(source.url);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("only HTTP/HTTPS source URLs are supported");
  }
  if (target.username || target.password) {
    throw new Error("source URLs must not include credentials");
  }
  if (isBlockedHostname(target.hostname)) {
    throw new Error("local and private network URLs are not allowed");
  }
  const addresses = net.isIP(target.hostname)
    ? [{ address: target.hostname }]
    : await dns.lookup(target.hostname, { all: true, verbatim: false });
  if (!addresses.length || addresses.some((item) => isBlockedIp(item.address))) {
    throw new Error("local and private network URLs are not allowed");
  }
  return target;
}

async function fetchHtml(source) {
  const target = await validateSource(source);
  const response = await fetchWithTimeout(target, {
    headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.8" }
  });
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.toLowerCase();
  const decoder = new TextDecoder(charset && charset.includes("gb") ? "gb18030" : "utf-8");
  return decoder.decode(arrayBuffer);
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

function htmlToCandidateLines(html) {
  const normalized = decodeEntities(normalizeDigits(html))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|p|li|tr|div|section|article|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ");

  return normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12 && line.length <= 260)
    .filter((line) => (line.match(/(?<!\d)(0?[1-9]|[12]\d|3[0-3])(?!\d)/g) || []).length >= 7);
}

function uniqueSortedReds(numbers) {
  return Array.from(new Set(numbers.filter((item) => item >= 1 && item <= 33)))
    .sort((a, b) => a - b)
    .slice(0, 6)
    .map(padBall);
}

function parseRecommendationFromLine(line) {
  const compact = normalizeDigits(line)
    .replace(/[：:]/g, " ")
    .replace(/[，、；;]/g, " ")
    .replace(/[＋]/g, "+")
    .replace(/\s+/g, " ")
    .trim();

  const explicit = compact.match(
    /((?:0?[1-9]|[12]\d|3[0-3])(?:[\s,./|+\-]+(?:0?[1-9]|[12]\d|3[0-3])){5,})\s*(?:\+|蓝球?|蓝码|blue|b|后区|\|)\s*(0?[1-9]|1[0-6])/i
  );
  if (explicit) {
    const reds = uniqueSortedReds(parseBallList(explicit[1], 33).map(Number));
    const blue = padBall(Number(explicit[2]));
    if (reds.length === 6) return { reds, blue, confidence: 0.94 };
  }

  const tokens =
    compact.match(/(?<!\d)(0?[1-9]|[12]\d|3[0-3])(?!\d)/g)?.map((item) => Number(item)) || [];
  if (tokens.length < 7) return null;

  const candidates = [];
  for (let index = 0; index <= tokens.length - 7; index += 1) {
    const slice = tokens.slice(index, index + 7);
    const reds = uniqueSortedReds(slice.slice(0, 6));
    const blue = slice[6];
    if (reds.length === 6 && blue >= 1 && blue <= 16) {
      candidates.push({ reds, blue: padBall(blue), confidence: index === 0 ? 0.72 : 0.62 });
    }
  }

  return candidates[0] || null;
}

function extractRecommendations(html, source) {
  const lines = htmlToCandidateLines(html);
  const seen = new Set();
  const recommendations = [];

  for (const line of lines) {
    const parsed = parseRecommendationFromLine(line);
    if (!parsed) continue;
    const key = `${parsed.reds.join(",")}+${parsed.blue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recommendations.push({
      ...parsed,
      key,
      sourceName: source.name,
      sourceUrl: source.url,
      context: line.slice(0, 180)
    });
    if (recommendations.length >= 50) break;
  }

  return recommendations;
}

function aggregateRecommendations(items) {
  const map = new Map();
  for (const item of items) {
    const current = map.get(item.key) || {
      key: item.key,
      reds: item.reds,
      blue: item.blue,
      count: 0,
      sources: [],
      confidence: 0
    };
    current.count += 1;
    current.confidence += item.confidence || 0.6;
    current.sources.push(item.sourceName);
    map.set(item.key, current);
  }
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      confidence: Number((item.confidence / Math.max(1, item.count)).toFixed(2)),
      sources: Array.from(new Set(item.sources))
    }))
    .sort((a, b) => b.count - a.count || b.confidence - a.confidence || a.key.localeCompare(b.key))
    .slice(0, 30);
}

function scoreSources(sources, recommendations, errors) {
  const bySource = new Map();
  for (const source of sources) {
    bySource.set(source.name, {
      sourceName: source.name,
      sourceUrl: source.url,
      parsed: 0,
      unique: new Set(),
      confidence: 0,
      error: errors.some((item) => item.sourceName === source.name),
      score: 0
    });
  }

  for (const item of recommendations) {
    const row = bySource.get(item.sourceName);
    if (!row) continue;
    row.parsed += 1;
    row.unique.add(item.key);
    row.confidence += item.confidence || 0.6;
  }

  return Array.from(bySource.values())
    .map((row) => {
      const avgConfidence = row.parsed ? row.confidence / row.parsed : 0;
      const score = row.error
        ? 15
        : Math.min(96, Math.round(35 + row.parsed * 4 + row.unique.size * 3 + avgConfidence * 25));
      return {
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl,
        parsed: row.parsed,
        unique: row.unique.size,
        avgConfidence: Number(avgConfidence.toFixed(2)),
        error: row.error,
        score
      };
    })
    .sort((a, b) => b.score - a.score);
}

function scoreRecordAgainstDraw(record, draw) {
  const redSet = new Set(record.reds);
  const redHits = draw.red.filter((item) => redSet.has(item)).length;
  const blueHit = record.blue === draw.blue ? 1 : 0;
  return {
    issue: draw.issue,
    date: draw.date,
    redHits,
    blueHit,
    hitText: `${redHits}+${blueHit}`,
    drawRed: draw.red,
    drawBlue: draw.blue
  };
}

function issueDistance(baseIssue, drawIssue) {
  const base = Number(baseIssue);
  const draw = Number(drawIssue);
  if (!Number.isFinite(base) || !Number.isFinite(draw)) return 0;
  return draw - base;
}

function annotateRecords(records, draws) {
  const sortedDraws = [...draws].sort((a, b) => Number(b.issue) - Number(a.issue));
  return records.map((record) => {
    const matchedDraw =
      sortedDraws.find((draw) => record.baseIssue && issueDistance(record.baseIssue, draw.issue) > 0) ||
      sortedDraws[0];
    const hit = matchedDraw ? scoreRecordAgainstDraw(record, matchedDraw) : null;
    return { ...record, hit };
  });
}

function buildRecordSummary(records) {
  const checked = records.filter((item) => item.hit);
  const blueHits = checked.filter((item) => item.hit.blueHit).length;
  const strongHits = checked.filter((item) => item.hit.redHits >= 4 || (item.hit.redHits >= 3 && item.hit.blueHit)).length;
  const avgRed = checked.length
    ? checked.reduce((sum, item) => sum + item.hit.redHits, 0) / checked.length
    : 0;
  const best = [...checked].sort(
    (a, b) => b.hit.redHits + b.hit.blueHit * 1.2 - (a.hit.redHits + a.hit.blueHit * 1.2)
  )[0];

  return {
    total: records.length,
    checked: checked.length,
    avgRed: Number(avgRed.toFixed(2)),
    blueHits,
    blueRate: checked.length ? Math.round((blueHits / checked.length) * 100) : 0,
    strongHits,
    best: best
      ? {
          id: best.id,
          key: best.key,
          type: best.type,
          strategy: best.strategy,
          sourceName: best.sourceName,
          hitText: best.hit.hitText,
          issue: best.hit.issue
        }
      : null
  };
}

function buildSourcePerformance(records) {
  const sourceRecords = records.filter((item) => item.type === "community" && item.sourceName && item.hit);
  const map = new Map();

  for (const record of sourceRecords) {
    const row = map.get(record.sourceName) || {
      sourceName: record.sourceName,
      sourceUrl: record.sourceUrl,
      checked: 0,
      totalRed: 0,
      blueHits: 0,
      strongHits: 0,
      bestHit: "0+0",
      bestScore: -1
    };
    const hitScore = record.hit.redHits + record.hit.blueHit * 1.2;
    row.checked += 1;
    row.totalRed += record.hit.redHits;
    row.blueHits += record.hit.blueHit;
    if (record.hit.redHits >= 4 || (record.hit.redHits >= 3 && record.hit.blueHit)) row.strongHits += 1;
    if (hitScore > row.bestScore) {
      row.bestScore = hitScore;
      row.bestHit = record.hit.hitText;
    }
    map.set(record.sourceName, row);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      avgRed: Number((row.totalRed / Math.max(1, row.checked)).toFixed(2)),
      blueRate: Math.round((row.blueHits / Math.max(1, row.checked)) * 100),
      performanceScore: Math.min(
        99,
        Math.round(row.totalRed * 4 + row.blueHits * 8 + row.strongHits * 12 + Math.min(row.checked, 20))
      )
    }))
    .sort((a, b) => b.performanceScore - a.performanceScore || b.avgRed - a.avgRed);
}

async function handleDraws(reqUrl, res) {
  const limit = clampInt(reqUrl.searchParams.get("limit"), 180, 30, 1000);
  const refresh = reqUrl.searchParams.get("refresh") === "1";
  try {
    const data = await fetchOfficialDraws(limit, refresh);
    sendJson(res, 200, data);
  } catch (error) {
    try {
      const fallback = await fetch500HistoryDraws(limit, refresh);
      sendJson(res, 200, { ...fallback, officialError: error.message });
    } catch (fallbackError) {
      const sample = await loadFallbackDraws();
      sendJson(res, 200, {
        ...sample,
        error: error.message,
        fallbackError: fallbackError.message
      });
    }
  }
}

async function handleCommunity(reqUrl, res) {
  const configured = await readJson(COMMUNITY_SOURCES_FILE, []);
  const sources = parseSourceParam(reqUrl.searchParams) || configured;
  const limitedSources = sources.slice(0, 8);
  const recommendations = [];
  const errors = [];

  for (const source of limitedSources) {
    try {
      const html = await fetchHtml(source);
      recommendations.push(...extractRecommendations(html, source));
    } catch (error) {
      errors.push({ sourceName: source.name, sourceUrl: source.url, error: error.message });
    }
  }

  sendJson(res, 200, {
    fetchedAt: new Date().toISOString(),
    sources: limitedSources,
    count: recommendations.length,
    recommendations,
    aggregate: aggregateRecommendations(recommendations),
    sourceScores: scoreSources(limitedSources, recommendations, errors),
    errors
  });
}

async function handleRecords(req, reqUrl, res) {
  if (req.method === "POST") {
    const body = await readRequestBody(req);
    const payload = body ? JSON.parse(body) : {};
    const items = Array.isArray(payload.records) ? payload.records : [payload.record || payload];
    const { added } = await appendRecords(items);
    sendJson(res, 200, { ok: true, added: added.length, records: added });
    return;
  }

  const limit = clampInt(reqUrl.searchParams.get("limit"), 240, 30, 1000);
  const store = await readRecords();
  let draws = [];
  let drawSource = "none";
  try {
    const data = await fetchOfficialDraws(limit, false);
    draws = data.draws;
    drawSource = data.source;
  } catch {
    try {
      const data = await fetch500HistoryDraws(limit, false);
      draws = data.draws;
      drawSource = data.source;
    } catch {
      const data = await loadFallbackDraws();
      draws = data.draws;
      drawSource = data.source;
    }
  }

  const annotated = annotateRecords(store.records, draws);
  sendJson(res, 200, {
    ok: true,
    drawSource,
    latestDraw: draws[0] || null,
    records: annotated.slice(0, 300),
    summary: buildRecordSummary(annotated),
    sourcePerformance: buildSourcePerformance(annotated)
  });
}

async function serveStatic(reqUrl, res) {
  const requestedPath = decodeURIComponent(reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (reqUrl.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, time: new Date().toISOString() });
      return;
    }
    if (reqUrl.pathname === "/api/draws") {
      await handleDraws(reqUrl, res);
      return;
    }
    if (reqUrl.pathname === "/api/community") {
      await handleCommunity(reqUrl, res);
      return;
    }
    if (reqUrl.pathname === "/api/records") {
      await handleRecords(req, reqUrl, res);
      return;
    }
    await serveStatic(reqUrl, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`双色球分析工具已启动：http://${HOST}:${PORT}`);
});
