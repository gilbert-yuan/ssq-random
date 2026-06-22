import { csvEscape, recordTypeLabel, strategyLabels } from "./format.js";

export function buildDashboardCsv({ tickets, favorites, community, records }) {
  const rows = [
    ["类型", "红球", "蓝球", "策略/来源", "说明"],
    ...tickets.map((ticket, index) => [
      `建议${index + 1}`,
      ticket.reds.join(" "),
      ticket.blue,
      strategyLabels[ticket.kind] || ticket.kind,
      ticket.reason
    ]),
    ...favorites.map((ticket, index) => [
      `收藏${index + 1}`,
      ticket.reds.join(" "),
      ticket.blue,
      strategyLabels[ticket.kind] || ticket.kind,
      ticket.savedAt
    ]),
    ...(community?.aggregate || []).slice(0, 20).map((item, index) => [
      `社区共振${index + 1}`,
      item.reds.join(" "),
      item.blue,
      item.sources.join(" / "),
      `共振 ${item.count}，可信 ${item.confidence}`
    ]),
    ...(records?.records || []).slice(0, 100).map((item, index) => [
      `命中记录${index + 1}`,
      item.reds.join(" "),
      item.blue,
      item.sourceName || strategyLabels[item.strategy] || item.strategy || recordTypeLabel(item.type),
      item.hit ? `基准 ${item.baseIssue}，核对 ${item.hit.issue}，命中 ${item.hit.hitText}` : "待核对"
    ])
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadCsvFile(csv) {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ssq-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
