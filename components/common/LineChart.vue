<template>
  <div>
    <div v-if="!data.length" class="muted">暂无走势数据</div>
    <template v-else>
      <div class="line-legend">
        <span v-for="line in lines" :key="line.key" :style="{ '--legend-color': line.color }">{{ line.label }}</span>
      </div>
      <svg class="line-chart-svg" :viewBox="`0 0 ${width} ${height}`" role="img">
        <template v-for="grid in grids" :key="grid.y">
          <line :x1="pad.left" :x2="width - pad.right" :y1="grid.y" :y2="grid.y" class="chart-grid" />
          <text x="6" :y="grid.y + 4" class="chart-axis">{{ grid.label }}</text>
        </template>
        <polygon v-for="band in bandShapes" :key="band.points" :points="band.points" :style="`fill:${band.color};fill-opacity:${band.opacity};stroke:none`" />
        <path v-for="line in linePaths" :key="line.key" :d="line.d" class="chart-line" :style="`stroke:${line.color};${line.dash ? `stroke-dasharray:${line.dash};` : ''}`" />
        <template v-for="marker in markerShapes" :key="marker.key">
          <line :x1="pad.left" :x2="width - pad.right" :y1="marker.y" :y2="marker.y" class="chart-marker-line" />
          <circle :cx="marker.x" :cy="marker.y" r="5" :style="`fill:${marker.color}`" />
          <text :x="marker.x + 10" :y="marker.y + 4" class="chart-marker-text">当前 {{ marker.value }}</text>
        </template>
        <text :x="pad.left" :y="height - 8" class="chart-axis">{{ firstIssue }}</text>
        <text :x="width - pad.right - 48" :y="height - 8" class="chart-axis">{{ lastIssue }}</text>
      </svg>
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  series: { type: Array, default: () => [] },
  lines: { type: Array, default: () => [] },
  markers: { type: Object, default: () => ({}) },
  bands: { type: Array, default: () => [] }
});

const width = 680;
const height = 220;
const pad = { left: 42, right: 82, top: 22, bottom: 34 };
const data = computed(() => [...(props.series || [])].reverse().slice(-90));
const values = computed(() => {
  const result = [];
  props.lines.forEach((line) => {
    data.value.forEach((row) => {
      const value = Number(row[line.key]);
      if (Number.isFinite(value)) result.push(value);
    });
    const marker = Number(props.markers[line.markerKey || line.key]);
    if (Number.isFinite(marker)) result.push(marker);
  });
  props.bands.forEach((band) => {
    data.value.forEach((row) => {
      const low = Number(row[band.lowerKey]);
      const high = Number(row[band.upperKey]);
      if (Number.isFinite(low)) result.push(low);
      if (Number.isFinite(high)) result.push(high);
    });
  });
  return result.length ? result : [0, 1];
});
const bounds = computed(() => {
  let min = Math.min(...values.value);
  let max = Math.max(...values.value);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const padding = (max - min) * 0.08;
  return { min: min - padding, max: max + padding };
});

function xFor(index) {
  return pad.left + (index / Math.max(1, data.value.length - 1)) * (width - pad.left - pad.right);
}

function yFor(value) {
  return pad.top + (1 - (value - bounds.value.min) / (bounds.value.max - bounds.value.min)) * (height - pad.top - pad.bottom);
}

function pathFor(points) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

const grids = computed(() => [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
  const y = pad.top + ratio * (height - pad.top - pad.bottom);
  const label = (bounds.value.max - ratio * (bounds.value.max - bounds.value.min)).toFixed(bounds.value.max <= 10 ? 2 : 0);
  return { y, label };
}));
const linePaths = computed(() => props.lines.map((line) => {
  const points = data.value
    .map((row, index) => ({ x: xFor(index), y: yFor(Number(row[line.key])) }))
    .filter((point) => Number.isFinite(point.y));
  return { ...line, d: pathFor(points) };
}));
const bandShapes = computed(() => props.bands.map((band) => {
  const upper = [];
  const lower = [];
  data.value.forEach((row, index) => {
    const high = Number(row[band.upperKey]);
    const low = Number(row[band.lowerKey]);
    if (Number.isFinite(high) && Number.isFinite(low)) {
      upper.push({ x: xFor(index), y: yFor(high) });
      lower.push({ x: xFor(index), y: yFor(low) });
    }
  });
  if (upper.length < 2) return { points: "", color: band.color || "#888", opacity: band.opacity ?? 0.12 };
  return {
    points: [...upper, ...lower.reverse()].map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
    color: band.color || "#888",
    opacity: band.opacity ?? 0.12
  };
}).filter((band) => band.points));
const markerShapes = computed(() => props.lines.map((line) => {
  const value = Number(props.markers[line.markerKey || line.key]);
  if (!Number.isFinite(value)) return null;
  return { key: line.key, value, y: yFor(value), x: width - pad.right + 24, color: line.color };
}).filter(Boolean));
const firstIssue = computed(() => data.value[0]?.issue || "");
const lastIssue = computed(() => data.value[data.value.length - 1]?.issue || "");
</script>
