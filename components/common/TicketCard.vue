<template>
  <div class="ticket">
    <div class="ticket-head">
      <span>{{ title }}</span>
      <span>{{ subtitle }}</span>
    </div>
    <BallList :reds="ticket.reds || ticket.red || []" :blue="ticket.blue || ''" small />
    <p v-if="description">{{ description }}</p>
    <div v-if="ticket.explanation?.tags?.length" class="explain-tags">
      <span v-for="tag in ticket.explanation.tags" :key="tag" class="explain-tag">{{ tag }}</span>
    </div>
    <ul v-if="ticket.explanation?.reasons?.length" class="explain-list">
      <li v-for="reason in ticket.explanation.reasons.slice(0, 4)" :key="reason">{{ reason }}</li>
    </ul>
    <div class="ticket-actions">
      <button class="small-button copy-button" type="button" @click="$emit('copy', ticket)">{{ copied ? '已复制' : '复制' }}</button>
      <button v-if="favorite" class="small-button" type="button" @click="$emit('favorite', ticket)">收藏</button>
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  ticket: { type: Object, required: true },
  title: { type: String, default: "号码" },
  subtitle: { type: String, default: "" },
  description: { type: String, default: "" },
  favorite: { type: Boolean, default: false },
  copied: { type: Boolean, default: false }
});

defineEmits(["copy", "favorite"]);
</script>
