const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { loadDotEnv } = require("../src/server/env-file");

const CHECK_FILES = [
  "ecosystem.config.cjs",
  "server.js",
  "nuxt.config.ts",
  "app.vue",
  "pages/index.vue",
  "package.json",
  "data/records.json",
  "data/community-sources.json",
  "data/ssq-sample.json",
  "miniprogram/app.js",
  "miniprogram/app.json",
  "miniprogram/project.config.json",
  "miniprogram/sitemap.json",
  "miniprogram/pages/index/index.js",
  "miniprogram/pages/index/index.json",
  "miniprogram/pages/picks/index.js",
  "miniprogram/pages/picks/index.json",
  "start.sh",
  "start.bat"
];

function walkFiles(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walkFiles(fullPath, filter);
    return filter(fullPath) ? [fullPath] : [];
  });
}

function checkSyntax(file) {
  return new Promise((resolve, reject) => {
    const source = fs.readFileSync(file, "utf8");
    const isModule = /(^|\n)\s*(import\s|export\s)/.test(source);
    const args = isModule ? ["--check", "--input-type=module"] : ["--check", file];
    const child = spawn(process.execPath, args, { stdio: "pipe" });
    let output = "";
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    if (isModule) child.stdin.end(source);
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
  if (!shellScript.includes("command -v pm2")) {
    throw new Error("start.sh must check that pm2 is installed");
  }
  if (!shellScript.includes("pm2 startOrRestart ecosystem.config.cjs --update-env")) {
    throw new Error("start.sh must start the app with pm2");
  }

  const batchScript = await fs.promises.readFile("start.bat", "utf8");
  if (!/where\s+pm2/i.test(batchScript)) {
    throw new Error("start.bat must check that pm2 is installed");
  }
  if (!/pm2\s+startOrRestart\s+ecosystem\.config\.cjs\s+--update-env/i.test(batchScript)) {
    throw new Error("start.bat must start the app with pm2");
  }
}

async function waitForServer(port, timeoutMs = 15000) {
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

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for smoke tests`);
  }
}

async function fetchEndpoint(port, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response;
}

async function checkEndpoint(port, path, validate) {
  const response = await fetchEndpoint(port, path);
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
  } catch (error) {
    const serverOutput = output.trim();
    if (serverOutput) {
      error.message = `${error.message}\nserver output:\n${serverOutput}`;
    }
    throw error;
  } finally {
    child.kill();
  }

  if (child.exitCode && child.exitCode !== 0) {
    throw new Error(`server exited unexpectedly\n${output}`);
  }
}

async function main() {
  loadDotEnv(path.join(__dirname, "..", ".env"));
  requireEnv("DATABASE_URL");
  const jsFiles = Array.from(
    new Set([
      ...CHECK_FILES.filter((file) => file.endsWith(".js") || file.endsWith(".cjs")),
      ...walkFiles("src/server", (file) => file.endsWith(".js")),
      ...walkFiles("utils", (file) => file.endsWith(".js")),
      ...walkFiles("composables", (file) => file.endsWith(".js")),
      ...walkFiles("miniprogram", (file) => file.endsWith(".js"))
    ])
  );
  await Promise.all(jsFiles.map(checkSyntax));
  await Promise.all(CHECK_FILES.filter((file) => file.endsWith(".json")).map(checkJson));
  await checkLauncherScripts();

  await withServer(async (port) => {
    const baseUrl = `http://127.0.0.1:${port}`;
    const stamp = Date.now();
    const credentials = {
      username: `smoke-${stamp}`,
      password: `smoke-pass-${stamp}`,
      clientType: "miniprogram"
    };
    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-type": "miniprogram" },
      body: JSON.stringify(credentials)
    });
    if (!registerResponse.ok) {
      throw new Error(`register returned HTTP ${registerResponse.status}`);
    }
    const registerPayload = await registerResponse.json();
    const sessionToken = registerPayload.sessionToken;
    if (!sessionToken) throw new Error("register did not return a session token");
    const authHeaders = { "x-session-token": sessionToken };

    await checkEndpoint(port, "/", (text) => {
      if (!text.includes("<title>双色球分析台</title>")) throw new Error("home page title missing");
      if (!text.includes("/_nuxt/")) throw new Error("home page must reference Nuxt assets");
    });
    const nuxtFiles = Array.from((await fs.promises.readdir(path.join(__dirname, "..", ".output", "public", "_nuxt"))).values());
    const nuxtAsset = nuxtFiles.find((file) => file.endsWith(".js"));
    if (!nuxtAsset) throw new Error("Nuxt JavaScript asset missing; run npm run generate first");
    const assetResponse = await fetchEndpoint(port, `/_nuxt/${nuxtAsset}`);
    if (!String(assetResponse.headers.get("cache-control") || "").includes("immutable")) {
      throw new Error("Nuxt hashed assets must use immutable cache headers");
    }
    const nuxtBundleText = (
      await Promise.all(
        nuxtFiles
          .filter((file) => file.endsWith(".js"))
          .map((file) => fs.promises.readFile(path.join(__dirname, "..", ".output", "public", "_nuxt", file), "utf8"))
      )
    ).join("\n");
    if (!nuxtBundleText.includes("冷号补位")) throw new Error("Nuxt bundle must expose the default cold-fill prediction mode");
    if (!nuxtBundleText.includes("彩票开奖结果具有强随机性")) throw new Error("Nuxt bundle must show a randomness risk note");
    await checkEndpoint(port, "/api/draws?limit=30", (text) => {
      const payload = JSON.parse(text);
      if (!Array.isArray(payload.draws) || payload.draws.length === 0) {
        throw new Error("draw endpoint returned no draws");
      }
    });
    {
      const response = await fetch(`${baseUrl}/api/records?limit=30`, { headers: authHeaders });
      if (!response.ok) throw new Error(`/api/records returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload.ok || !payload.authenticated || !Array.isArray(payload.records)) {
        throw new Error("records endpoint returned an invalid payload");
      }
    }
    await checkEndpoint(port, "/api/metrics?limit=30", (text) => {
      const payload = JSON.parse(text);
      if (!payload.ok || !Array.isArray(payload.series)) {
        throw new Error("metrics endpoint returned an invalid payload");
      }
    });
    await checkEndpoint(port, "/api/mobile/home?limit=30", (text) => {
      const payload = JSON.parse(text);
      if (!payload.ok || !payload.latestDraw || !payload.overview) {
        throw new Error("mobile home endpoint returned an invalid payload");
      }
    });
    await checkEndpoint(port, "/api/mobile/picks?limit=30", (text) => {
      const payload = JSON.parse(text);
      if (!payload.ok || !payload.summary || !Array.isArray(payload.records)) {
        throw new Error("mobile picks endpoint returned an invalid payload");
      }
    });
    const completion = await fetch(`http://127.0.0.1:${port}/api/complete-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reds: ["01", "02"], blue: "03", strategy: "balanced" })
    });
    if (!completion.ok) throw new Error(`complete-ticket returned HTTP ${completion.status}`);
    const completionPayload = await completion.json();
    if (!completionPayload.ok || completionPayload.ticket?.reds?.length !== 6 || !completionPayload.ticket?.blue) {
      throw new Error("complete-ticket endpoint returned an invalid ticket");
    }
    const testRecordStamp = Date.now();
    const testRecordId = `smoke-${testRecordStamp}`;
    const saveRecord = await fetch(`${baseUrl}/api/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        record: {
          id: testRecordId,
          type: "favorite",
          reds: ["01", "02", "03", "04", "05", "06"],
          blue: "07",
          strategy: "balanced",
          baseIssue: `9${testRecordStamp}`
        }
      })
    });
    if (!saveRecord.ok) throw new Error(`record save returned HTTP ${saveRecord.status}`);
    const pinRecord = await fetch(`${baseUrl}/api/records`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ id: testRecordId, pinned: true })
    });
    const pinPayload = await pinRecord.json();
    if (!pinRecord.ok || !pinPayload.ok || !pinPayload.pinnedAt) {
      throw new Error("record pin endpoint returned an invalid payload");
    }
    const deleteSavedRecord = await fetch(`${baseUrl}/api/records?id=${encodeURIComponent(testRecordId)}`, {
      method: "DELETE",
      headers: authHeaders
    });
    const deletePayload = await deleteSavedRecord.json();
    if (!deleteSavedRecord.ok || !deletePayload.ok || deletePayload.deleted !== 1) {
      throw new Error("record delete endpoint returned an invalid payload");
    }
    const unauthSave = await fetch(`${baseUrl}/api/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record: { type: "favorite", reds: ["01", "02", "03", "04", "05", "06"], blue: "08" } })
    });
    if (unauthSave.status !== 401) {
      throw new Error(`unauthenticated record save expected 401, got ${unauthSave.status}`);
    }
    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders
    });
    if (!logoutResponse.ok) throw new Error(`logout returned HTTP ${logoutResponse.status}`);
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
