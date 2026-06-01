const fs = require("node:fs/promises");
const path = require("node:path");
const { MIME_TYPES, PUBLIC_DIR } = require("./config");
const { sendText } = require("./http");

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

module.exports = {
  serveStatic
};
