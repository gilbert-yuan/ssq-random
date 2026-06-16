<template>
  <PanelCard title="自选补全">
    <div class="toolbar manual-toolbar">
      <select :value="strategy" aria-label="自选补全规则" @change="$emit('update:strategy', $event.target.value)">
        <option v-for="(label, key) in strategyLabels" :key="key" :value="key">{{ label }}</option>
      </select>
      <button type="button" @click="$emit('complete')">补全</button>
      <button type="button" @click="$emit('clear')">清空</button>
    </div>
    <div class="manual-grid">
      <div>
        <div class="mini-title">红球</div>
        <NumberGrid :max="33" :selected="reds" type="red" @toggle="$emit('toggle-red', $event)" />
      </div>
      <div>
        <div class="mini-title">蓝球</div>
        <NumberGrid :max="16" :selected="blue ? [blue] : []" type="blue" @toggle="$emit('toggle-blue', $event)" />
      </div>
    </div>
    <div class="manual-result-grid">
      <div class="tickets compact-list" :class="{ muted: !completion?.ticket }">
        <TicketCard
          v-if="completion?.ticket"
          :ticket="completion.ticket"
          :title="strategyLabels[completion.ticket.kind] || completion.ticket.kind"
          :subtitle="`${completion.ticket.score} 分 · ${completion.position?.typeLabel || ''}`"
          :description="completion.ticket.reason"
          :copied="copiedText === formatTicketText(completion.ticket)"
          @copy="$emit('copy', $event)"
        >
          <button class="small-button" type="button" @click="$emit('favorite', completion.ticket)">收藏当前</button>
        </TicketCard>
        <template v-else>选择部分红球或蓝球后会自动补全。</template>
      </div>
      <div class="position-list" :class="{ muted: !completion?.position?.rows?.length }">
        <div v-if="!completion?.position?.rows?.length" class="muted">暂无指标定位</div>
        <div v-for="row in completion.position.rows" v-else :key="row.label" class="position-row">
          <span>{{ row.label }}</span>
          <strong>{{ row.value }}</strong>
          <em>历史分位 {{ row.percentile }}%</em>
        </div>
      </div>
    </div>
  </PanelCard>
</template>

<script setup>
import { formatTicketText, strategyLabels } from "~/utils/format.js";

defineProps({
  reds: { type: Array, default: () => [] },
  blue: { type: String, default: "" },
  strategy: { type: String, required: true },
  completion: { type: Object, default: null },
  copiedText: { type: String, default: "" }
});

defineEmits(["update:strategy", "toggle-red", "toggle-blue", "complete", "clear", "copy", "favorite"]);
</script>
