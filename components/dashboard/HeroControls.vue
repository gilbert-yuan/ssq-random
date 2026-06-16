<template>
  <header class="topbar panel hero-panel">
    <div class="hero-copy">
      <p class="eyebrow">MYERP LOTTO LAB</p>
      <h1>双色球分析台</h1>
      <p class="hero-description">把历史走势、社区共振和自选补全整理成一张更轻松、更像手账白板的选号工作台。</p>
      <div class="hero-tags">
        <span class="hero-tag yellow">历史走势</span>
        <span class="hero-tag blue">社区共振</span>
        <span class="hero-tag pink">自选补全</span>
        <span class="hero-tag green">命中闭环</span>
      </div>
    </div>
    <div class="control-card">
      <div class="control-note">本地分析工作区</div>
      <label class="field compact">
        <span>分析期数</span>
        <input :value="limit" type="number" min="30" max="1000" @input="$emit('update:limit', Number($event.target.value || 240))" />
      </label>
      <div class="actions">
        <button class="primary" type="button" :disabled="busy" @click="$emit('fetch')">一键获取</button>
        <button type="button" :disabled="busy" @click="$emit('generate')">生成建议号</button>
        <button type="button" :disabled="busy" @click="$emit('community')">抓取大神推荐</button>
        <button type="button" @click="$emit('export')">导出 CSV</button>
      </div>
    </div>
  </header>
</template>

<script setup>
defineProps({
  limit: { type: Number, required: true },
  busy: { type: Boolean, default: false }
});

defineEmits(["update:limit", "fetch", "generate", "community", "export"]);
</script>
