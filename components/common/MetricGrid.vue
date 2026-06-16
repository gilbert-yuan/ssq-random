<template>
  <div class="backtest-grid">
    <div v-for="item in items" :key="item.label" class="metric">
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
      <em>{{ item.detail }}</em>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] }
});
</script>
