const fs = require("node:fs/promises");
const path = require("node:path");
const { LEGACY_PUBLIC_DIR, MIME_TYPES, NUXT_PUBLIC_DIR } = require("./config");
const { sendText } = require("./http");

async function directoryExists(dir) {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function getStaticRoot() {
  return (await directoryExists(NUXT_PUBLIC_DIR)) ? NUXT_PUBLIC_DIR : LEGACY_PUBLIC_DIR;
}

function cacheControlForPath(reqPath, ext) {
  if (reqPath.startsWith("/_nuxt/") || reqPath.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return ext === ".html" ? "no-store" : "public, max-age=3600";
}

function safeJoin(root, requestedPath) {
  const safePath = path.normalize(requestedPath).replace(/^([/\\])+/g, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

async function sendFile(res, root, requestedPath, fallbackToIndex = false) {
  const targetPath = fallbackToIndex ? "/index.html" : requestedPath;
  const filePath = safeJoin(root, targetPath);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return true;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": cacheControlForPath(targetPath, ext)
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

async function serveStatic(reqUrl, res) {
  const root = await getStaticRoot();
  const requestedPath = decodeURIComponent(reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname);

  if (await sendFile(res, root, requestedPath)) return;
  const hasExtension = Boolean(path.extname(requestedPath));
  if (!hasExtension && (await sendFile(res, root, requestedPath, true))) return;
  sendText(res, 404, "Not found");
}

module.exports = {
  serveStatic
};
