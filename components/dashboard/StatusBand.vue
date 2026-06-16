<template>
  <section class="status-band" :class="{ warn: type === 'warn' }">
    <div>
      <span class="status-dot"></span>
      <span>{{ message }}</span>
    </div>
    <span>{{ detail }}</span>
  </section>
</template>

<script setup>
defineProps({
  message: { type: String, default: "准备就绪" },
  detail: { type: String, default: "等待获取开奖数据" },
  type: { type: String, default: "ok" }
});
</script>
