const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { globalCache } = require("./cache");
const { MIME_TYPES, PUBLIC_DIR } = require("./config");
const { sendText } = require("./http");

const STATIC_CACHE_TTL = 10 * 60 * 1000;
const ASSET_VERSION = Date.now().toString(36);

function injectAssetVersion(html) {
  const version = encodeURIComponent(ASSET_VERSION);
  return html
    .replace('href="/styles.css"', `href="/styles.css?v=${version}"`)
    .replace(
      '<script src="/app.js"></script>',
      `<script>window.__assetVersion = ${JSON.stringify(ASSET_VERSION)};</script>\n    <script src="/app.js?v=${version}"></script>`
    );
}

function cacheControlForExtension(ext) {
  return ext === ".html" || ext === ".css" || ext === ".js" ? "no-store" : "public, max-age=3600";
}

function computeEtag(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex").slice(0, 16);
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
    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === ".html";

    let entry = globalCache.get(`static:${filePath}`);
    if (!entry) {
      const raw = isHtml ? await fs.readFile(filePath, "utf8") : await fs.readFile(filePath);
      const buffer = isHtml ? Buffer.from(injectAssetVersion(raw), "utf8") : raw;
      entry = {
        buffer,
        etag: computeEtag(buffer),
        contentType: MIME_TYPES[ext] || "application/octet-stream",
        cacheControl: cacheControlForExtension(ext)
      };
      if (!isHtml) {
        globalCache.set(`static:${filePath}`, entry, STATIC_CACHE_TTL);
      }
    }

    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === entry.etag) {
      res.writeHead(304, {
        "ETag": entry.etag,
        "Cache-Control": entry.cacheControl
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": entry.contentType,
      "Cache-Control": entry.cacheControl,
      "Content-Length": entry.buffer.length,
      "ETag": entry.etag
    });
    res.end(entry.buffer);
  } catch (error) {
    console.error(`[static] 读取失败: ${filePath}`, error.code || error.message);
    sendText(res, 404, "Not found");
  }
}

module.exports = {
  serveStatic
};
