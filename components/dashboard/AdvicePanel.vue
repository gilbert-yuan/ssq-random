<template>
  <PanelCard title="趋势建议" :badge="analysis ? `近 ${analysis.recentWindow} 期` : '--'">
    <div class="prediction-note">
      <strong>预测口径</strong>
      <span>默认偏冷号补位：结合多窗口热度、遗漏分位、形态约束和历史共现做启发式推荐。</span>
      <em>{{ analysis?.features?.riskNote || '彩票开奖结果具有强随机性，以下分析只反映历史样本结构，不代表未来必然命中。' }}</em>
    </div>
    <ul class="advice-list">
      <li v-for="item in items" :key="item">{{ item }}</li>
    </ul>
  </PanelCard>
</template>

<script setup>
defineProps({
  analysis: { type: Object, default: null },
  items: { type: Array, default: () => [] }
});
</script>
