<template>
  <PanelCard title="策略回测" :badge="backtest ? `${strategyLabels[strategy] || strategy} · ${backtest.results.length} 期` : '待生成'">
    <MetricGrid v-if="backtest" :items="items" />
    <div v-else class="backtest-grid muted">暂无回测</div>
    <div v-if="backtest" class="prediction-note backtest-note">
      <strong>基线对比</strong>
      <span>
        随机基线：平均红球 {{ backtest.baselines?.random?.avgRed || '0.00' }}，蓝球 {{ backtest.baselines?.random?.blueRate || 0 }}%；
        频次基线：平均红球 {{ backtest.baselines?.frequency?.avgRed || '0.00' }}，蓝球 {{ backtest.baselines?.frequency?.blueRate || 0 }}%。
      </span>
      <span>
        相对随机：红球 {{ signed(backtest.lift?.avgRedVsRandom) }}，蓝球 {{ signed(backtest.lift?.blueRateVsRandom) }}%；
        相对频次：红球 {{ signed(backtest.lift?.avgRedVsFrequency) }}，蓝球 {{ signed(backtest.lift?.blueRateVsFrequency) }}%。
      </span>
      <em>{{ backtest.riskNote }}</em>
    </div>
  </PanelCard>
</template>

<script setup>
import { computed } from 'vue';
import { strategyLabels } from "@/utils/format.js";
import PanelCard from "@/components/common/PanelCard.vue";
import MetricGrid from "@/components/common/MetricGrid.vue";

const props = defineProps({
  backtest: { type: Object, default: null },
  strategy: { type: String, default: "cold" }
});

function signed(value = 0) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number}`;
}

const items = computed(() => {
  const result = props.backtest;
  if (!result) return [];
  return [
    { label: "平均红球", value: result.avgRed, detail: `滚动验证 ${result.range?.checked || result.results.length} 期` },
    { label: "蓝球命中率", value: `${result.blueRate}%`, detail: `${result.blueHits}/${result.results.length}` },
    { label: "较好命中", value: result.strongHits, detail: `随机基线 ${result.baselines?.random?.strongHits || 0}` },
    { label: "验证区间", value: result.range?.toIssue || "--", detail: result.range?.fromIssue ? `从 ${result.range.fromIssue} 到 ${result.range.toIssue}` : "暂无" }
  ];
});
</script>
