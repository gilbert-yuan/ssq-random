const { cleanupExpiredSessions } = require("./database");
const { loadDraws } = require("./draw-controller");

// 双色球开奖：每周日 / 周二 / 周四 21:15 摇奖，21:30 前后结束。
// 21:35 / 22:00 / 22:30 各拉一次，给官方接口数据传播留余量。
const DEFAULT_DRAW_DAYS = new Set([0, 2, 4]); // 0=Sun, 2=Tue, 4=Thu
const DEFAULT_TRIGGER_TIMES = [
  [21, 35],
  [22, 0],
  [22, 30]
];
const LOOKAHEAD_DAYS = 8;
const MAX_TIMEOUT_MS = 2_147_483_000; // setTimeout 32 位上限保险值
const CLEANUP_HOUR = 3;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function nextTriggerDate(from = new Date(), days = DEFAULT_DRAW_DAYS, times = DEFAULT_TRIGGER_TIMES) {
  let best = null;
  for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset += 1) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + dayOffset);
    if (!days.has(candidate.getDay())) continue;
    for (const [h, m] of times) {
      const c = new Date(candidate);
      c.setHours(h, m, 0, 0);
      if (c.getTime() <= from.getTime()) continue;
      if (!best || c.getTime() < best.getTime()) best = c;
    }
  }
  return best;
}

let timer = null;
let cleanupTimer = null;
let stopped = false;

async function runSessionCleanup(logger = console) {
  try {
    const deleted = await cleanupExpiredSessions();
    if (deleted > 0) {
      logger.log?.(`[scheduler] 已清理 ${deleted} 个过期会话 ${new Date().toISOString()}`);
    }
  } catch (error) {
    logger.warn?.(`[scheduler] 会话清理失败：${error.message}`);
  }
}

function scheduleCleanup(logger = console) {
  if (stopped) return;
  if (cleanupTimer) clearTimeout(cleanupTimer);

  const now = new Date();
  const nextCleanup = new Date(now);
  nextCleanup.setHours(CLEANUP_HOUR, 0, 0, 0);
  if (nextCleanup.getTime() <= now.getTime()) {
    nextCleanup.setDate(nextCleanup.getDate() + 1);
  }

  const delay = nextCleanup.getTime() - now.getTime();
  cleanupTimer = setTimeout(async () => {
    await runSessionCleanup(logger);
    cleanupTimer = setInterval(() => runSessionCleanup(logger), CLEANUP_INTERVAL_MS);
    cleanupTimer.unref?.();
  }, delay);
  cleanupTimer.unref?.();
}

function scheduleNext(logger = console) {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  const next = nextTriggerDate();
  if (!next) return;
  const delay = Math.min(MAX_TIMEOUT_MS, Math.max(1000, next.getTime() - Date.now()));
  timer = setTimeout(async () => {
    try {
      await loadDraws(240, true);
      logger.log?.(`[scheduler] 自动刷新开奖完成 ${new Date().toISOString()}`);
    } catch (error) {
      logger.warn?.(`[scheduler] 自动刷新失败：${error.message}`);
    } finally {
      scheduleNext(logger);
    }
  }, delay);
  timer.unref?.();
  logger.log?.(`[scheduler] 下次自动刷新：${next.toLocaleString()}`);
}

function startScheduler(logger = console) {
  if (process.env.SSQ_AUTO_REFRESH === "0") {
    logger.log?.("[scheduler] 已通过 SSQ_AUTO_REFRESH=0 禁用");
    return;
  }
  stopped = false;
  scheduleNext(logger);
  scheduleCleanup(logger);
}

function stopScheduler() {
  stopped = true;
  if (timer) clearTimeout(timer);
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    clearInterval(cleanupTimer);
  }
  timer = null;
  cleanupTimer = null;
}

module.exports = {
  nextTriggerDate,
  startScheduler,
  stopScheduler
};
