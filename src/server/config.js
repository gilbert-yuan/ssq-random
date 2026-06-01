const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..", "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const SAMPLE_FILE = path.join(DATA_DIR, "ssq-sample.json");
const COMMUNITY_SOURCES_FILE = path.join(DATA_DIR, "community-sources.json");
const LEGACY_RECORDS_FILE = path.join(DATA_DIR, "records.json");
const SQLITE_FILE = path.join(DATA_DIR, "ssq.sqlite");

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";

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

module.exports = {
  CACHE_DIR,
  COMMUNITY_SOURCES_FILE,
  DATA_DIR,
  HOST,
  LEGACY_RECORDS_FILE,
  MIME_TYPES,
  PORT,
  PUBLIC_DIR,
  REQUEST_HEADERS,
  ROOT_DIR,
  SAMPLE_FILE,
  SQLITE_FILE
};
