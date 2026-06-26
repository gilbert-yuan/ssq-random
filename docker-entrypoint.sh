#!/bin/sh
set -eu

echo "==> Waiting for PostgreSQL..."

node <<'NODE'
const net = require("node:net");

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("[ERROR] DATABASE_URL is required.");
  process.exit(1);
}

let host = "";
let port = 5432;
try {
  const url = new URL(rawUrl);
  host = url.hostname;
  port = Number(url.port || 5432);
} catch (error) {
  console.error(`[ERROR] Invalid DATABASE_URL: ${error.message}`);
  process.exit(1);
}

function waitForDatabase(attempt = 1) {
  const socket = net.createConnection({ host, port });
  const timeout = setTimeout(() => {
    socket.destroy();
    retry(attempt);
  }, 2000);

  socket.once("connect", () => {
    clearTimeout(timeout);
    socket.end();
    console.log(`[OK] PostgreSQL is reachable at ${host}:${port}`);
    process.exit(0);
  });

  socket.once("error", () => {
    clearTimeout(timeout);
    retry(attempt);
  });
}

function retry(attempt) {
  if (attempt >= 30) {
    console.error(`[ERROR] PostgreSQL not reachable at ${host}:${port} after 30 attempts.`);
    process.exit(1);
  }
  if (attempt % 10 === 0) {
    console.log(`  Still waiting... (attempt ${attempt})`);
  }
  setTimeout(() => waitForDatabase(attempt + 1), 1000);
}

waitForDatabase();
NODE

echo "==> Starting SSQ Random app..."
exec node server.js
