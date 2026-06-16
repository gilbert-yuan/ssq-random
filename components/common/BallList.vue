<template>
  <div class="ball-row" :class="{ muted: !balls.length }">
    <template v-if="balls.length">
      <span v-for="red in reds" :key="`red-${red}`" class="ball" :class="{ small }">{{ red }}</span>
      <span v-if="blue" class="ball blue" :class="{ small }">{{ blue }}</span>
    </template>
    <template v-else>{{ emptyText }}</template>
  </div>
</template>

<script setup>
const props = defineProps({
  reds: { type: Array, default: () => [] },
  blue: { type: String, default: "" },
  small: { type: Boolean, default: false },
  emptyText: { type: String, default: "暂无数据" }
});

const balls = computed(() => [...props.reds, props.blue].filter(Boolean));
</script>
