<template>
  <PanelCard title="命中闭环" :badge="summary.checked ? `${summary.checked} 条已核对` : '待核对'">
    <MetricGrid v-if="records.length" :items="summaryItems" />
    <div v-else class="backtest-grid muted">暂无记录</div>
    <div class="record-list" :class="{ muted: !records.length }">
      <div v-for="item in records.slice(0, 10)" :key="item.id || `${item.reds.join('-')}-${item.blue}-${item.baseIssue}`" class="record-row">
        <div>
          <strong>{{ recordTypeLabel(item.type) }} · {{ strategyLabels[item.strategy] || item.sourceName || item.strategy || '未标注' }}</strong>
          <span>生成基准 {{ item.baseIssue || '--' }}，核对 {{ item.hit?.issue || '--' }}</span>
        </div>
        <BallList :reds="item.reds" :blue="item.blue" small />
        <div class="record-actions">
          <span class="hit-badge" :class="{ strong: isStrongHit(item.hit) }">{{ hitText(item.hit) }}</span>
          <button class="small-button copy-button" type="button" @click="$emit('copy', item)">复制</button>
        </div>
      </div>
      <template v-if="!records.length">暂无历史推荐</template>
    </div>
  </PanelCard>
</template>

<script setup>
import { hitText, isStrongHit, recordTypeLabel, strategyLabels } from "~/utils/format.js";

const props = defineProps({
  data: { type: Object, default: null }
});

defineEmits(["copy"]);

const records = computed(() => props.data?.records || []);
const summary = computed(() => props.data?.summary || {});
const summaryItems = computed(() => [
  { label: "记录总数", value: summary.value.total || 0, detail: `开奖源 ${props.data?.drawSource || "--"}` },
  { label: "平均红球", value: summary.value.avgRed ?? "0.00", detail: `${summary.value.checked || 0} 条已核对` },
  { label: "蓝球命中率", value: `${summary.value.blueRate || 0}%`, detail: `${summary.value.blueHits || 0}/${summary.value.checked || 0}` },
  { label: "较好命中", value: summary.value.strongHits || 0, detail: summary.value.best ? `最佳 ${summary.value.best.hitText}` : "暂无" }
]);
</script>
