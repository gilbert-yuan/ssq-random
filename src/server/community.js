const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");
const { COMMUNITY_SOURCES_FILE } = require("./config");
const { fetchWithTimeout } = require("./draw-sources");
const { readJson } = require("./json-store");
const { normalizeDigits, padBall, parseBallList, uniqueSortedReds } = require("./utils");

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
    .split(/\n+/)
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

const MAX_HTML_BYTES = 4 * 1024 * 1024;

async function readBodyWithLimit(response, limit) {
  // fetch API ReadableStream path (Node 18+)
  if (typeof response.body !== "undefined" && response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error(`response exceeded ${limit} bytes`);
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }
  // node http fallback (arrayBuffer returns ArrayBuffer)
  const ab = await response.arrayBuffer();
  if (ab.byteLength > limit) throw new Error(`response exceeded ${limit} bytes`);
  return new Uint8Array(ab);
}

async function fetchHtml(source) {
  const target = await validateSource(source);
  const response = await fetchWithTimeout(target, {
    headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.8" }
  });
  const bytes = await readBodyWithLimit(response, MAX_HTML_BYTES);
  const contentType = response.headers.get("content-type") || "";
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.toLowerCase();
  const decoder = new TextDecoder(charset && charset.includes("gb") ? "gb18030" : "utf-8");
  return decoder.decode(bytes);
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

async function readSources(searchParams) {
  const configured = await readJson(COMMUNITY_SOURCES_FILE, []);
  return (parseSourceParam(searchParams) || configured).slice(0, 8);
}

module.exports = {
  aggregateRecommendations,
  extractRecommendations,
  fetchHtml,
  readSources,
  scoreSources
};
