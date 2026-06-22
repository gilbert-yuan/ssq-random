<template>
  <PanelCard title="大神推荐战绩" :badge="rows.length ? `${rows.length} 个来源` : '待积累'">
    <div class="score-list" :class="{ muted: !rows.length }">
      <div v-for="item in rows.slice(0, 8)" :key="item.sourceName" class="score-row">
        <div>
          <strong>{{ item.sourceName }}</strong>
          <span>{{ `${item.checked} 条核对，均红 ${item.avgRed}，蓝球 ${item.blueRate}%，最佳 ${item.bestHit}` }}</span>
        </div>
        <div class="score-bar"><i :style="{ width: `${percentWidth(item.performanceScore)}%` }"></i></div>
        <b>{{ item.performanceScore }}</b>
      </div>
      <template v-if="!rows.length">暂无战绩</template>
    </div>
  </PanelCard>
</template>

<script setup>
import { computed } from 'vue';
import { percentWidth } from "@/utils/format.js";
import PanelCard from "@/components/common/PanelCard.vue";

const props = defineProps({
  data: { type: Object, default: null }
});
const rows = computed(() => props.data?.sourcePerformance || []);
</script>
