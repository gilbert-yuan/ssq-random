const { HOST, PORT } = require("./src/server/config");
const { closeDb, ensureDatabaseReady } = require("./src/server/database");
const { formatStartupError, validateStartupPrerequisites } = require("./src/server/startup-check");

let shuttingDown = false;
let server = null;
let stopScheduler = () => {};

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`收到 ${signal}，正在关闭服务器...`);
  const forceTimer = setTimeout(() => {
    console.warn("强制退出（5 秒未完成关闭）");
    process.exit(1);
  }, 5000);
  forceTimer.unref();
  stopScheduler();
  if (!server) {
    clearTimeout(forceTimer);
    process.exit(0);
    return;
  }
  server.close(async () => {
    try {
      await closeDb();
    } finally {
      clearTimeout(forceTimer);
      process.exit(0);
    }
  });
}

async function main() {
  const { createApp } = require("./src/server/app");
  const scheduler = require("./src/server/scheduler");
  validateStartupPrerequisites();
  await ensureDatabaseReady();
  server = createApp();
  stopScheduler = scheduler.stopScheduler;

  server.listen(PORT, HOST, () => {
    console.log(`双色球分析工具已启动：http://${HOST}:${PORT}`);
    scheduler.startScheduler();
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch(async (error) => {
  console.error(formatStartupError(error));
  try {
    await closeDb();
  } finally {
    process.exit(1);
  }
});
