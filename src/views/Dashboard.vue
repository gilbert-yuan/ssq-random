<template>
  <div class="app-shell">
    <HeaderNav />
    <HeroControls
      v-model:limit="dashboard.limit.value"
      :busy="dashboard.busy.value"
      @fetch="dashboard.fetchDraws(true)"
      @generate="dashboard.generateTickets"
      @community="dashboard.fetchCommunity"
      @export="dashboard.exportCsv"
    />
    <StatusBand :message="dashboard.status.message" :detail="dashboard.status.detail" :type="dashboard.status.type" />

    <main class="workspace-grid">
      <aside class="left-rail">
        <LatestDrawCard :draw="dashboard.latestDraw.value" :shape="dashboard.latestShape.value" @copy="dashboard.copyTicket" />
        <AdvicePanel :analysis="dashboard.analysis.value" :items="dashboard.adviceItems.value" />
      </aside>

      <section class="main-stage">
        <SummaryBoard :items="dashboard.summaryItems.value" />
        <TicketPanel
          v-model:strategy="dashboard.strategy.value"
          :tickets="dashboard.tickets.value"
          :copied-text="dashboard.copiedText.value"
          @copy="dashboard.copyTicket"
          @copy-top="dashboard.copyTopTickets"
          @favorite="dashboard.addFavorite"
        />

        <section class="analysis-grid">
          <BacktestPanel :backtest="dashboard.backtest.value" :strategy="dashboard.strategy.value" />
          <FavoritesPanel :favorites="dashboard.favorites.value" :copied-text="dashboard.copiedText.value" @copy="dashboard.copyTicket" />
        </section>

        <MetricCharts :metrics="dashboard.metrics.value" :markers="{}" />

        <DistributionCharts
          :analysis="dashboard.analysis.value"
          :red-markers="dashboard.redMarkers.value"
          :blue-markers="dashboard.blueMarkers.value"
        />

        <ShapeOverview :analysis="dashboard.analysis.value" :items="dashboard.shapeItems.value" />
      </section>
    </main>

    <footer>数据和建议仅供统计观察，不构成投注建议。</footer>
  </div>
</template>

<script setup>
import { useDashboard } from '@/composables/useDashboard'
import HeaderNav from '@/components/layout/HeaderNav.vue'
import HeroControls from '@/components/dashboard/HeroControls.vue'
import StatusBand from '@/components/dashboard/StatusBand.vue'
import LatestDrawCard from '@/components/dashboard/LatestDrawCard.vue'
import AdvicePanel from '@/components/dashboard/AdvicePanel.vue'
import SummaryBoard from '@/components/dashboard/SummaryBoard.vue'
import TicketPanel from '@/components/dashboard/TicketPanel.vue'
import BacktestPanel from '@/components/dashboard/BacktestPanel.vue'
import FavoritesPanel from '@/components/dashboard/FavoritesPanel.vue'
import MetricCharts from '@/components/dashboard/MetricCharts.vue'
import DistributionCharts from '@/components/dashboard/DistributionCharts.vue'
import ShapeOverview from '@/components/dashboard/ShapeOverview.vue'

const dashboard = useDashboard()
</script>
