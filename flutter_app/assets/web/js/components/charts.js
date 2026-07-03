import { escapeHtml } from "./html.js";

export function renderBarChart(container, stats, totalSlots, currentNumbers = new Set()) {
  const max = Math.max(1, ...stats.map((item) => item.freq));
  container.innerHTML = stats
    .slice(0, totalSlots)
    .map((item) => {
      const height = Math.max(3, Math.round((item.freq / max) * 100));
      const current = currentNumbers.has(item.number);
      return `
        <div class="bar-item ${current ? "current" : ""}" title="${escapeHtml(`${item.number}: ${item.freq} 次，遗漏 ${item.miss} 期`)}">
          <div class="bar-track"><div class="bar-fill" style="height:${height}%"></div></div>
          <div class="bar-label">${escapeHtml(item.number)}</div>
        </div>
      `;
    })
    .join("");
}

function pathFor(points) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

export function renderLineChart(container, series, lines, markerValues = {}, options = {}) {
  const bands = options.bands || [];
  const data = [...(series || [])].reverse().slice(-90);
  if (!data.length) {
    container.innerHTML = `<div class="muted">暂无走势数据</div>`;
    return;
  }

  const width = 680;
  const height = 220;
  const pad = { left: 42, right: 82, top: 22, bottom: 34 };
  const values = [];
  lines.forEach((line) => {
    data.forEach((row) => {
      const value = Number(row[line.key]);
      if (Number.isFinite(value)) values.push(value);
    });
    const marker = Number(markerValues[line.markerKey || line.key]);
    if (Number.isFinite(marker)) values.push(marker);
  });
  bands.forEach((band) => {
    data.forEach((row) => {
      const lo = Number(row[band.lowerKey]);
      const hi = Number(row[band.upperKey]);
      if (Number.isFinite(lo)) values.push(lo);
      if (Number.isFinite(hi)) values.push(hi);
    });
  });

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const padding = (max - min) * 0.08;
  min -= padding;
  max += padding;

  const x = (index) => pad.left + (index / Math.max(1, data.length - 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const yy = pad.top + ratio * (height - pad.top - pad.bottom);
      const label = (max - ratio * (max - min)).toFixed(max <= 10 ? 2 : 0);
      return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}" class="chart-grid" />
        <text x="6" y="${yy + 4}" class="chart-axis">${label}</text>`;
    })
    .join("");

  const bandShapes = bands
    .map((band) => {
      const upper = [];
      const lower = [];
      data.forEach((row, index) => {
        const hi = Number(row[band.upperKey]);
        const lo = Number(row[band.lowerKey]);
        if (Number.isFinite(hi) && Number.isFinite(lo)) {
          upper.push({ x: x(index), y: y(hi) });
          lower.push({ x: x(index), y: y(lo) });
        }
      });
      if (upper.length < 2) return "";
      const points = [...upper, ...lower.reverse()]
        .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(" ");
      const color = band.color || "#888";
      const opacity = band.opacity ?? 0.12;
      return `<polygon points="${points}" style="fill:${color};fill-opacity:${opacity};stroke:none" />`;
    })
    .join("");

  const paths = lines
    .map((line) => {
      const points = data
        .map((row, index) => ({ x: x(index), y: y(Number(row[line.key])) }))
        .filter((point) => Number.isFinite(point.y));
      const dash = line.dash ? `stroke-dasharray:${line.dash};` : "";
      return `<path d="${pathFor(points)}" class="chart-line" style="stroke:${line.color};${dash}" />`;
    })
    .join("");

  const markers = lines
    .map((line) => {
      const marker = Number(markerValues[line.markerKey || line.key]);
      if (!Number.isFinite(marker)) return "";
      const yy = y(marker);
      const xx = width - pad.right + 24;
      return `
        <line x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}" class="chart-marker-line" />
        <circle cx="${xx}" cy="${yy}" r="5" style="fill:${line.color}" />
        <text x="${xx + 10}" y="${yy + 4}" class="chart-marker-text">${escapeHtml(`当前 ${marker}`)}</text>
      `;
    })
    .join("");

  const legend = lines
    .map(
      (line, index) =>
        `<span style="--legend-color:${line.color}">${escapeHtml(line.label)}</span>${index === lines.length - 1 ? "" : ""}`
    )
    .join("");
  const firstIssue = data[0]?.issue || "";
  const lastIssue = data[data.length - 1]?.issue || "";

  container.innerHTML = `
    <div class="line-legend">${legend}</div>
    <svg class="line-chart-svg" viewBox="0 0 ${width} ${height}" role="img">
      ${grid}
      ${bandShapes}
      ${paths}
      ${markers}
      <text x="${pad.left}" y="${height - 8}" class="chart-axis">${escapeHtml(firstIssue)}</text>
      <text x="${width - pad.right - 48}" y="${height - 8}" class="chart-axis">${escapeHtml(lastIssue)}</text>
    </svg>
  `;
}

export function renderPositionRows(rows = []) {
  if (!rows.length) return `<div class="muted">暂无定位</div>`;
  return rows
    .map(
      (row) => `
        <div class="position-row">
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
          <em>历史分位 ${escapeHtml(row.percentile)}%</em>
        </div>
      `
    )
    .join("");
}
