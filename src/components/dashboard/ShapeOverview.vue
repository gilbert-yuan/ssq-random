<template>
  <PanelCard title="形态概览" :badge="analysis ? `近 ${analysis.recentWindow} 期` : '近 30 期'">
    <div class="shape-grid">
      <div v-for="item in items" :key="item.label" class="shape-item">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>
  </PanelCard>
</template>

<script setup>
import PanelCard from "@/components/common/PanelCard.vue";

defineProps({
  analysis: { type: Object, default: null },
  items: { type: Array, default: () => [] }
});
</script>
