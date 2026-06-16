<template>
  <section class="panel indicator-panel">
    <div class="panel-title">
      <h2>指标回测走势</h2>
      <span>{{ summary.count || 0 }} 期 · PostgreSQL</span>
    </div>
    <MetricGrid :items="items" />
    <div class="line-chart-grid">
      <div class="line-chart-card">
        <div class="mini-title">和值与回归线</div>
        <div class="line-chart">
          <LineChart :series="enrichedSum" :lines="sumLines" :markers="markers" :bands="sumBands" />
        </div>
      </div>
      <div class="line-chart-card">
        <div class="mini-title">冷热占比</div>
        <div class="line-chart">
          <LineChart :series="metrics?.series || []" :lines="ratioLines" :markers="markers" />
        </div>
      </div>
      <div class="line-chart-card">
        <div class="mini-title">奇偶走势</div>
        <div class="line-chart">
          <LineChart :series="metrics?.series || []" :lines="oddLines" :markers="markers" />
        </div>
      </div>
    </div>
    <div class="classification-list">
      <div v-for="item in (metrics?.series || []).slice(0, 10)" :key="item.issue" class="classification-row">
        <strong>{{ item.issue }}</strong>
        <span>{{ item.typeLabel }}</span>
        <em>和值 {{ item.sum }} · 热/冷 {{ Math.round(item.hotRatio * 100) }}%/{{ Math.round(item.coldRatio * 100) }}%</em>
      </div>
    </div>
  </section>
</template>

<script setup>
import { enrichSumSeries } from "~/utils/metrics.js";

const props = defineProps({
  metrics: { type: Object, default: null },
  markers: { type: Object, default: () => ({}) }
});

const summary = computed(() => props.metrics?.summary || {});
const backtest = computed(() => summary.value.backtest || {});
const regression = computed(() => summary.value.regression || {});
const enrichedSum = computed(() => enrichSumSeries(props.metrics?.series || [], 20, 0.2));
const items = computed(() => [
  { label: "和值分类回测", value: `${backtest.value.sumType?.hitRate || 0}%`, detail: `${backtest.value.sumType?.hits || 0}/${backtest.value.sumType?.checked || 0}` },
  { label: "奇偶分类回测", value: `${backtest.value.parityType?.hitRate || 0}%`, detail: `${backtest.value.parityType?.hits || 0}/${backtest.value.parityType?.checked || 0}` },
  { label: "冷热分类回测", value: `${backtest.value.hotColdType?.hitRate || 0}%`, detail: `${backtest.value.hotColdType?.hits || 0}/${backtest.value.hotColdType?.checked || 0}` },
  { label: "和值回归误差", value: regression.value.avgAbsResidual ?? "--", detail: `10点内 ${regression.value.within10Rate || 0}%` }
]);
const sumLines = [
  { key: "sum", label: "和值", color: "#d83b45" },
  { key: "regressionSum", label: "线性回归", color: "#13845f" },
  { key: "sumMean", label: "20 期均值", color: "#666", dash: "4 3" },
  { key: "sumEma", label: "EMA(0.2)", color: "#b56a12", dash: "2 3" }
];
const ratioLines = [
  { key: "hotRatio", label: "热号占比", color: "#b56a12" },
  { key: "coldRatio", label: "冷号占比", color: "#2167d5" }
];
const oddLines = [
  { key: "odd", label: "奇数个数", color: "#7b4ab8" },
  { key: "even", label: "偶数个数", color: "#13845f" }
];
const sumBands = [{ upperKey: "sumUpper", lowerKey: "sumLower", color: "#d83b45", opacity: 0.12 }];
</script>
