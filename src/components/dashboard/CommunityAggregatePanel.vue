<template>
  <PanelCard title="社区共振" :badge="`${community?.sources?.length || 0} 个来源`">
    <div class="tickets compact-list" :class="{ muted: !community?.aggregate?.length }">
      <TicketCard
        v-for="item in (community?.aggregate || []).slice(0, 6)"
        :key="`${item.reds.join('-')}-${item.blue}`"
        :ticket="item"
        :title="`共振 ${item.count}`"
        :subtitle="`可信 ${Math.round((item.confidence || 0) * 100)}%`"
        :description="item.sources.slice(0, 2).join(' / ')"
        @copy="$emit('copy', $event)"
      />
      <template v-if="!community?.aggregate?.length">暂无共振号码</template>
    </div>
  </PanelCard>
</template>

<script setup>
import PanelCard from "@/components/common/PanelCard.vue";
import TicketCard from "@/components/common/TicketCard.vue";

defineProps({
  community: { type: Object, default: null }
});

defineEmits(["copy"]);
</script>
