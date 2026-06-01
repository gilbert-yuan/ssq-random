export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : "#";
  } catch {
    return "#";
  }
}

export function percentWidth(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export function ball(number, type = "red", small = false) {
  return `<span class="ball ${type === "blue" ? "blue" : ""} ${small ? "small" : ""}">${escapeHtml(number)}</span>`;
}

export function metric(label, value, detail) {
  return `
    <div class="metric">
      <span>${escapeHtml(label ?? "")}</span>
      <strong>${escapeHtml(value ?? "")}</strong>
      <em>${escapeHtml(detail ?? "")}</em>
    </div>
  `;
}

export function shapeItem(label, value) {
  return `<div class="shape-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export function hitBadge(hit) {
  if (!hit) return `<span class="hit-badge">待核对</span>`;
  const strong = hit.redHits >= 4 || (hit.redHits >= 3 && hit.blueHit);
  return `<span class="hit-badge ${strong ? "strong" : ""}">${escapeHtml(hit.hitText)}</span>`;
}
