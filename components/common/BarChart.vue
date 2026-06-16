<template>
  <div class="bar-chart" :class="chartClass">
    <div v-for="item in visibleStats" :key="item.number" class="bar-item" :class="{ current: markerSet.has(item.number) }" :title="`${item.number}: ${item.freq} 次，遗漏 ${item.miss} 期`">
      <div class="bar-track"><div class="bar-fill" :style="{ height: `${heightFor(item)}%` }"></div></div>
      <div class="bar-label">{{ item.number }}</div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  stats: { type: Array, default: () => [] },
  totalSlots: { type: Number, default: 0 },
  markers: { type: Array, default: () => [] },
  chartClass: { type: String, default: "" }
});

const visibleStats = computed(() => props.stats.slice(0, props.totalSlots || props.stats.length));
const markerSet = computed(() => new Set(props.markers));
const maxFreq = computed(() => Math.max(1, ...visibleStats.value.map((item) => item.freq || 0)));

function heightFor(item) {
  return Math.max(3, Math.round(((item.freq || 0) / maxFreq.value) * 100));
}
</script>
