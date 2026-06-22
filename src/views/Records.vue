<template>
  <div class="app-shell">
    <HeaderNav />
    <StatusBand :message="dashboard.status.message" :detail="dashboard.status.detail" :type="dashboard.status.type" />

    <section class="panel">
      <div class="panel-title">
        <h2>命中记录</h2>
        <span>{{ dashboard.records.value?.length || 0 }} 条记录</span>
      </div>
      <RecordsPanel :data="dashboard.records.value" @copy="dashboard.copyTicket" />
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>历史表现</h2>
      </div>
      <PerformancePanel :data="dashboard.records.value" />
    </section>

    <footer>数据和建议仅供统计观察，不构成投注建议。</footer>
  </div>
</template>

<script setup>
import { useDashboard } from '@/composables/useDashboard'
import HeaderNav from '@/components/layout/HeaderNav.vue'
import StatusBand from '@/components/dashboard/StatusBand.vue'
import RecordsPanel from '@/components/dashboard/RecordsPanel.vue'
import PerformancePanel from '@/components/dashboard/PerformancePanel.vue'

const dashboard = useDashboard()
</script>
