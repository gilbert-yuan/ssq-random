<template>
  <PanelCard title="一键建议号">
    <template #default>
      <div class="panel-title inline-title">
        <div></div>
        <div class="toolbar">
          <select :value="strategy" aria-label="选号策略" @change="$emit('update:strategy', $event.target.value)">
            <option v-for="(label, key) in strategyLabels" :key="key" :value="key">{{ label }}</option>
          </select>
          <span>{{ strategyLabels[strategy] }}</span>
          <button class="small-button" type="button" :disabled="tickets.length < 2" @click="$emit('copy-top', 2)">
            {{ copiedText === 'top-2' ? '已复制2注' : '复制2注' }}
          </button>
          <button class="small-button" type="button" :disabled="tickets.length < 5" @click="$emit('copy-top', 5)">
            {{ copiedText === 'top-5' ? '已复制5注' : '复制5注' }}
          </button>
        </div>
      </div>
      <div v-if="tickets.length" class="tickets">
        <TicketCard
          v-for="(ticket, index) in tickets"
          :key="`${ticket.reds.join('-')}-${ticket.blue}-${index}`"
          :ticket="ticket"
          :title="`建议 ${index + 1}`"
          :subtitle="`${strategyLabels[ticket.kind] || ticket.kind} · ${ticket.score} 分`"
          :description="ticket.reason"
          :favorite="true"
          :copied="copiedText === formatTicketText(ticket)"
          @copy="$emit('copy', $event)"
          @favorite="$emit('favorite', $event)"
        />
      </div>
      <div v-else class="tickets empty-state">点击“生成建议号”</div>
    </template>
  </PanelCard>
</template>

<script setup>
import { formatTicketText, strategyLabels } from "@/utils/format.js";
import PanelCard from "@/components/common/PanelCard.vue";
import TicketCard from "@/components/common/TicketCard.vue";

defineProps({
  tickets: { type: Array, default: () => [] },
  strategy: { type: String, required: true },
  copiedText: { type: String, default: "" }
});

defineEmits(["update:strategy", "copy", "copy-top", "favorite"]);
</script>
