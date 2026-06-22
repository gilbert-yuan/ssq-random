<template>
  <section class="analysis-grid">
    <PanelCard title="红球分布" badge="01-33">
      <BarChart :stats="analysis?.redStats || []" :total-slots="33" :markers="redMarkers" />
    </PanelCard>
    <PanelCard title="蓝球分布" badge="01-16">
      <BarChart :stats="analysis?.blueStats || []" :total-slots="16" :markers="blueMarkers" chart-class="blue" />
    </PanelCard>
  </section>
</template>

<script setup>
import PanelCard from "@/components/common/PanelCard.vue";
import BarChart from "@/components/common/BarChart.vue";

defineProps({
  analysis: { type: Object, default: null },
  redMarkers: { type: Array, default: () => [] },
  blueMarkers: { type: Array, default: () => [] }
});
</script>
