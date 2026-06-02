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
let stopped = false;

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
}

function stopScheduler() {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}

module.exports = {
  nextTriggerDate,
  startScheduler,
  stopScheduler
};
