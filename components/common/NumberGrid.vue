<template>
  <div class="number-grid" :class="type">
    <button
      v-for="number in numbers"
      :key="number"
      class="number-pick"
      :class="[type, { selected: selectedSet.has(number) }]"
      type="button"
      @click="$emit('toggle', number)"
    >
      {{ number }}
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  max: { type: Number, required: true },
  selected: { type: Array, default: () => [] },
  type: { type: String, default: "red" }
});

defineEmits(["toggle"]);

const numbers = computed(() => Array.from({ length: props.max }, (_, index) => String(index + 1).padStart(2, "0")));
const selectedSet = computed(() => new Set(props.selected));
</script>
