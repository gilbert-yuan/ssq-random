<template>
  <PanelCard title="最新开奖" :badge="draw?.issue ? `第 ${draw.issue} 期` : '--'">
    <BallList :reds="draw?.red || []" :blue="draw?.blue || ''" />
    <dl v-if="draw && shape" class="meta-list">
      <dt>开奖日期</dt><dd>{{ draw.date || '--' }}</dd>
      <dt>数据源</dt><dd>{{ draw.source || 'cwl.gov.cn' }}</dd>
      <dt>红球和值</dt><dd>{{ shape.sum }}</dd>
      <dt>跨度 / AC</dt><dd>{{ shape.span }} / {{ shape.ac }}</dd>
    </dl>
    <div class="ticket-actions latest-actions" :class="{ muted: !draw }">
      <button v-if="draw" class="small-button copy-button" type="button" @click="$emit('copy', draw)">复制</button>
      <template v-else>开奖数据加载后可复制本期号码</template>
    </div>
  </PanelCard>
</template>

<script setup>
defineProps({
  draw: { type: Object, default: null },
  shape: { type: Object, default: null }
});

defineEmits(["copy"]);
</script>
