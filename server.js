const { HOST, PORT } = require("./src/server/config");
const { createApp } = require("./src/server/app");
const { closeDb } = require("./src/server/database");
const { startScheduler, stopScheduler } = require("./src/server/scheduler");

const server = createApp();

server.listen(PORT, HOST, () => {
  console.log(`双色球分析工具已启动：http://${HOST}:${PORT}`);
  startScheduler();
});

let shuttingDown = false;
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
  server.close(() => {
    try {
      closeDb();
    } finally {
      clearTimeout(forceTimer);
      process.exit(0);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
