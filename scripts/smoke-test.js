const { spawn } = require("node:child_process");
const fs = require("node:fs");

const CHECK_FILES = [
  "server.js",
  "public/app.js",
  "package.json",
  "data/records.json",
  "data/community-sources.json",
  "data/ssq-sample.json",
  "start.sh",
  "start.bat"
];

function checkSyntax(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "pipe" });
    let output = "";
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${file} syntax check failed\n${output}`));
    });
  });
}

async function checkJson(file) {
  JSON.parse(await fs.promises.readFile(file, "utf8"));
}

async function checkLauncherScripts() {
  const shellScript = await fs.promises.readFile("start.sh", "utf8");
  if (!shellScript.startsWith("#!/usr/bin/env sh\n")) {
    throw new Error("start.sh must use an sh shebang with LF line endings");
  }
  if (shellScript.includes("\r\n")) {
    throw new Error("start.sh must use LF line endings for Ubuntu compatibility");
  }
  if (!shellScript.includes("npm start")) {
    throw new Error("start.sh must run npm start");
  }

  const batchScript = await fs.promises.readFile("start.bat", "utf8");
  if (!/npm start/i.test(batchScript)) {
    throw new Error("start.bat must run npm start");
  }
}

async function waitForServer(port, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error("server did not become healthy in time");
}

async function checkEndpoint(port, path, validate) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const text = await response.text();
  validate(text);
}

async function withServer(run) {
  const port = 5199;
  const child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "pipe"
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  try {
    await waitForServer(port);
    await run(port);
  } finally {
    child.kill();
  }

  if (child.exitCode && child.exitCode !== 0) {
    throw new Error(`server exited unexpectedly\n${output}`);
  }
}

async function main() {
  await Promise.all(CHECK_FILES.filter((file) => file.endsWith(".js")).map(checkSyntax));
  await Promise.all(CHECK_FILES.filter((file) => file.endsWith(".json")).map(checkJson));
  await checkLauncherScripts();

  await withServer(async (port) => {
    await checkEndpoint(port, "/", (text) => {
      if (!text.includes("<title>双色球分析台</title>")) throw new Error("home page title missing");
    });
    await checkEndpoint(port, "/api/draws?limit=30", (text) => {
      const payload = JSON.parse(text);
      if (!Array.isArray(payload.draws) || payload.draws.length === 0) {
        throw new Error("draw endpoint returned no draws");
      }
    });
    await checkEndpoint(port, "/api/records?limit=30", (text) => {
      const payload = JSON.parse(text);
      if (!payload.ok || !Array.isArray(payload.records)) {
        throw new Error("records endpoint returned an invalid payload");
      }
    });
    await checkEndpoint(port, "/api/community?urls=http%3A%2F%2F127.0.0.1%3A5199%2F", (text) => {
      const payload = JSON.parse(text);
      if (!payload.errors?.some((item) => /local and private network/i.test(item.error))) {
        throw new Error("community endpoint did not block local source URLs");
      }
    });
  });

  console.log("smoke tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
