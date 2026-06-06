const fs = require("node:fs/promises");
const path = require("node:path");
const { MIME_TYPES, PUBLIC_DIR } = require("./config");
const { sendText } = require("./http");

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
    const data = isHtml ? injectAssetVersion(await fs.readFile(filePath, "utf8")) : await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": cacheControlForExtension(ext)
    });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

module.exports = {
  serveStatic
};
