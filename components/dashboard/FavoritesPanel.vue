<template>
  <PanelCard title="收藏号码" :badge="`${favorites.length} 注`">
    <div class="tickets compact-list" :class="{ muted: !favorites.length }">
      <TicketCard
        v-for="ticket in favorites"
        :key="`${ticket.reds.join('-')}-${ticket.blue}`"
        :ticket="ticket"
        :title="strategyLabels[ticket.kind] || ticket.kind"
        :subtitle="ticket.savedAt"
        :copied="copiedText === formatTicketText(ticket)"
        @copy="$emit('copy', $event)"
      />
      <template v-if="!favorites.length">暂无收藏</template>
    </div>
  </PanelCard>
</template>

<script setup>
import { formatTicketText, strategyLabels } from "~/utils/format.js";

defineProps({
  favorites: { type: Array, default: () => [] },
  copiedText: { type: String, default: "" }
});

defineEmits(["copy"]);
</script>
