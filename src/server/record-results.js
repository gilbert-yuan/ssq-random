const { evaluatePrize, formatMoney, loadPrizeDetailsByIssue } = require("./ssq-prize");

function scoreWeight(hit) {
  if (!hit) return -1;
  const prizeScore = hit.prize?.won ? (7 - hit.prize.tier) * 1000000 + (hit.prize.amount || 0) : 0;
  return prizeScore + hit.redHits * 100 + hit.blueHit * 20;
}

function scoreRecordAgainstDraw(record, draw, prizeMap) {
  const redSet = new Set(record.reds);
  const redHits = draw.red.filter((item) => redSet.has(item)).length;
  const blueHit = record.blue === draw.blue ? 1 : 0;
  const prize = evaluatePrize(redHits, blueHit, prizeMap[draw.issue] || null);
  return {
    issue: draw.issue,
    date: draw.date,
    redHits,
    blueHit,
    hitText: `${redHits}+${blueHit}`,
    drawRed: draw.red,
    drawBlue: draw.blue,
    prize
  };
}

function issueDistance(baseIssue, drawIssue) {
  const base = Number(baseIssue);
  const draw = Number(drawIssue);
  if (!Number.isFinite(base) || !Number.isFinite(draw)) return 0;
  return draw - base;
}

function findValidationDraw(record, ascendingDraws, ascendingIssues) {
  if (record.baseIssue) {
    const baseIssue = Number(record.baseIssue);
    if (!Number.isFinite(baseIssue)) return null;
    let left = 0;
    let right = ascendingIssues.length - 1;
    let answer = -1;
    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      if (ascendingIssues[middle] > baseIssue) {
        answer = middle;
        right = middle - 1;
      } else {
        left = middle + 1;
      }
    }
    return answer >= 0 ? ascendingDraws[answer] : null;
  }
  return ascendingDraws[ascendingDraws.length - 1] || null;
}

async function buildAnnotationContext(draws, options = {}) {
  const ascendingDraws = [...draws].sort((a, b) => Number(a.issue) - Number(b.issue));
  return {
    ascendingDraws,
    ascendingIssues: ascendingDraws.map((draw) => Number(draw.issue)),
    prizeMap: options.skipPrizeFetch
      ? {}
      : await loadPrizeDetailsByIssue(draws.map((draw) => draw.issue))
  };
}

function annotateRecordsWithContext(records, context) {
  return records.map((record) => {
    const matchedDraw = findValidationDraw(record, context.ascendingDraws, context.ascendingIssues);
    const hit = matchedDraw ? scoreRecordAgainstDraw(record, matchedDraw, context.prizeMap) : null;
    return {
      ...record,
      status: hit ? (hit.prize.won ? "won" : "lost") : "pending",
      hit
    };
  });
}

async function annotateRecords(records, draws) {
  if (!records.length) return [];
  const context = await buildAnnotationContext(draws);
  return annotateRecordsWithContext(records, context);
}

function buildRecordSummary(records) {
  const checked = records.filter((item) => item.hit);
  const wins = checked.filter((item) => item.hit.prize?.won);
  const pendingCount = records.filter((item) => !item.hit).length;
  const blueHits = checked.filter((item) => item.hit.blueHit).length;
  const strongHits = checked.filter((item) => item.hit.redHits >= 4 || (item.hit.redHits >= 3 && item.hit.blueHit)).length;
  const avgRed = checked.length
    ? checked.reduce((sum, item) => sum + item.hit.redHits, 0) / checked.length
    : 0;
  const best = [...checked].sort((a, b) => scoreWeight(b.hit) - scoreWeight(a.hit))[0];
  const totalAmount = wins.reduce((sum, item) => sum + (item.hit.prize.amount || 0), 0);
  const jackpotCount = wins.filter((item) => item.hit.prize.isJackpot).length;
  const loseCount = checked.length - wins.length;

  return {
    total: records.length,
    checked: checked.length,
    pendingCount,
    winCount: wins.length,
    loseCount,
    avgRed: Number(avgRed.toFixed(2)),
    blueHits,
    blueRate: checked.length ? Math.round((blueHits / checked.length) * 100) : 0,
    strongHits,
    totalAmount,
    totalAmountText: formatMoney(totalAmount),
    jackpotCount,
    best: best
      ? {
          id: best.id,
          key: best.key,
          type: best.type,
          strategy: best.strategy,
          sourceName: best.sourceName,
          hitText: best.hit.hitText,
          issue: best.hit.issue,
          prizeLabel: best.hit.prize.label,
          prizeAmountText: best.hit.prize.amountText
        }
      : null
  };
}

function buildSourcePerformance(records) {
  const sourceRecords = records.filter((item) => item.type === "community" && item.sourceName && item.hit);
  const map = new Map();

  for (const record of sourceRecords) {
    const row = map.get(record.sourceName) || {
      sourceName: record.sourceName,
      sourceUrl: record.sourceUrl,
      checked: 0,
      totalRed: 0,
      blueHits: 0,
      strongHits: 0,
      totalAmount: 0,
      bestHit: "0+0",
      bestScore: -1
    };
    const hitScore = scoreWeight(record.hit);
    row.checked += 1;
    row.totalRed += record.hit.redHits;
    row.blueHits += record.hit.blueHit;
    row.totalAmount += record.hit.prize.amount || 0;
    if (record.hit.redHits >= 4 || (record.hit.redHits >= 3 && record.hit.blueHit)) row.strongHits += 1;
    if (hitScore > row.bestScore) {
      row.bestScore = hitScore;
      row.bestHit = record.hit.prize.won
        ? `${record.hit.prize.label} ${record.hit.prize.amountText}`
        : record.hit.hitText;
    }
    map.set(record.sourceName, row);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      avgRed: Number((row.totalRed / Math.max(1, row.checked)).toFixed(2)),
      blueRate: Math.round((row.blueHits / Math.max(1, row.checked)) * 100),
      totalAmountText: formatMoney(row.totalAmount),
      performanceScore: Math.min(
        99,
        Math.round(row.totalRed * 4 + row.blueHits * 8 + row.strongHits * 12 + Math.min(row.checked, 20))
      )
    }))
    .sort((a, b) => b.performanceScore - a.performanceScore || b.totalAmount - a.totalAmount || b.avgRed - a.avgRed);
}

function buildJackpotAnnouncements(records, limit = 5) {
  return records
    .filter((item) => item.type === "favorite" && item.hit?.prize?.isJackpot)
    .sort((a, b) => scoreWeight(b.hit) - scoreWeight(a.hit))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      issue: item.hit.issue,
      prizeLabel: item.hit.prize.label,
      amount: item.hit.prize.amount,
      amountText: item.hit.prize.amountText,
      text: `中奖播报：我的号码命中第 ${item.hit.issue} 期${item.hit.prize.label}，单注 ${item.hit.prize.amountText}`
    }));
}

module.exports = {
  annotateRecords,
  annotateRecordsWithContext,
  buildAnnotationContext,
  buildJackpotAnnouncements,
  buildRecordSummary,
  buildSourcePerformance
};
