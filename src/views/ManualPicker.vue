<template>
  <div class="app-shell">
    <HeaderNav />
    <StatusBand :message="dashboard.status.message" :detail="dashboard.status.detail" :type="dashboard.status.type" />

    <section class="panel">
      <div class="panel-title">
        <h2>自选号码</h2>
        <span>{{ dashboard.manualReds.value.length }}/6 红球 + {{ dashboard.manualBlue.value ? '1' : '0' }} 蓝球</span>
      </div>

      <ManualPickerPanel
        v-model:strategy="dashboard.manualStrategy.value"
        :reds="dashboard.manualReds.value"
        :blue="dashboard.manualBlue.value"
        :completion="dashboard.manualCompletion.value"
        :copied-text="dashboard.copiedText.value"
        @toggle-red="dashboard.toggleManualRed"
        @toggle-blue="dashboard.toggleManualBlue"
        @complete="dashboard.completeManualTicket"
        @clear="dashboard.clearManualSelection"
        @copy="dashboard.copyTicket"
        @favorite="dashboard.addFavorite"
      />
    </section>

    <section class="analysis-grid">
      <div class="panel">
        <div class="panel-title">
          <h2>红球分布</h2>
        </div>
        <BarChart :data="dashboard.analysis.value?.redCounts || {}" :markers="dashboard.redMarkers.value" />
      </div>
      <div class="panel">
        <div class="panel-title">
          <h2>蓝球分布</h2>
        </div>
        <BarChart :data="dashboard.analysis.value?.blueCounts || {}" :markers="dashboard.blueMarkers.value" is-blue />
      </div>
    </section>

    <footer>数据和建议仅供统计观察，不构成投注建议。</footer>
  </div>
</template>

<script setup>
import { useDashboard } from '@/composables/useDashboard'
import HeaderNav from '@/components/layout/HeaderNav.vue'
import StatusBand from '@/components/dashboard/StatusBand.vue'
import ManualPickerPanel from '@/components/dashboard/ManualPicker.vue'
import BarChart from '@/components/common/BarChart.vue'

const dashboard = useDashboard()
</script>
