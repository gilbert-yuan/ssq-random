<template>
  <section class="panel">
    <div v-if="title || badge" class="panel-title">
      <h2>{{ title }}</h2>
      <span v-if="badge">{{ badge }}</span>
    </div>
    <slot />
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, default: "" },
  badge: { type: String, default: "" }
});
</script>
