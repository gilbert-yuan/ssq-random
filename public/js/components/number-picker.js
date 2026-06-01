import { escapeHtml } from "./html.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

export function renderNumberGrid(container, max, selected, type) {
  container.innerHTML = Array.from({ length: max }, (_, index) => {
    const number = pad(index + 1);
    const active = selected.has(number);
    return `
      <button class="number-pick ${type} ${active ? "selected" : ""}" data-number="${escapeHtml(number)}" type="button">
        ${escapeHtml(number)}
      </button>
    `;
  }).join("");
}
