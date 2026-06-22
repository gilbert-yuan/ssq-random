<template>
  <div class="app-shell">
    <HeaderNav />
    <StatusBand :message="dashboard.status.message" :detail="dashboard.status.detail" :type="dashboard.status.type" />

    <section class="panel">
      <div class="panel-title">
        <h2>社区推荐</h2>
        <span>{{ dashboard.community.value?.count || 0 }} 条推荐</span>
      </div>
      <CommunityPanel v-model:source-urls="dashboard.sourceUrls.value" :community="dashboard.community.value" @copy="dashboard.copyTicket" />
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>社区聚合</h2>
      </div>
      <CommunityAggregatePanel :community="dashboard.community.value" @copy="dashboard.copyTicket" />
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>来源评分</h2>
      </div>
      <SourceScoresPanel :community="dashboard.community.value" />
    </section>

    <footer>数据和建议仅供统计观察，不构成投注建议。</footer>
  </div>
</template>

<script setup>
import { useDashboard } from '@/composables/useDashboard'
import HeaderNav from '@/components/layout/HeaderNav.vue'
import StatusBand from '@/components/dashboard/StatusBand.vue'
import CommunityPanel from '@/components/dashboard/CommunityPanel.vue'
import CommunityAggregatePanel from '@/components/dashboard/CommunityAggregatePanel.vue'
import SourceScoresPanel from '@/components/dashboard/SourceScoresPanel.vue'

const dashboard = useDashboard()
</script>
