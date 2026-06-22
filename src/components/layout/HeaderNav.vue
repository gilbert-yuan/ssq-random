<template>
  <header class="hero-panel">
    <div>
      <div class="eyebrow">SSQ ANALYZER</div>
      <h1>双色球分析台</h1>
      <p class="hero-description">
        一键选号、历史分布分析、趋势建议和社区推荐号抓取工具
      </p>
      <div class="hero-tags">
        <span class="hero-tag yellow">智能选号</span>
        <span class="hero-tag blue">趋势分析</span>
        <span class="hero-tag pink">社区聚合</span>
        <span class="hero-tag green">数据可视化</span>
      </div>
    </div>

    <nav class="nav-tabs">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="['nav-tab', { active: $route.path === item.path }]"
      >
        {{ item.label }}
      </router-link>
    </nav>
  </header>
</template>

<script setup>
const navItems = [
  { path: '/', label: '首页' },
  { path: '/manual', label: '自选号码' },
  { path: '/records', label: '命中记录' },
  { path: '/community', label: '社区推荐' }
]
</script>

<style scoped>
.nav-tabs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 20px;
  border: 2px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--ink);
  font-weight: 700;
  text-decoration: none;
  box-shadow: var(--shadow);
  transition: all 0.18s ease;
}

.nav-tab:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--border);
}

.nav-tab.active {
  background: var(--blue);
  color: #fff;
}
</style>
