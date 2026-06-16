<template>
  <section class="panel summary-board">
    <div class="panel-title">
      <h2>本期速览</h2>
      <span>像便签一样看关键指标</span>
    </div>
    <div class="summary-grid">
      <div v-for="item in items" :key="item.label" class="metric">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <em>{{ item.detail }}</em>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] }
});
</script>
