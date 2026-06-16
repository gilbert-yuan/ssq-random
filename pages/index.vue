<template>
  <div class="app-shell">
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
        <CommunityPanel v-model:source-urls="dashboard.sourceUrls.value" :community="dashboard.community.value" @copy="dashboard.copyTicket" />
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
        <ManualPicker
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

        <section class="analysis-grid">
          <BacktestPanel :backtest="dashboard.backtest.value" :strategy="dashboard.strategy.value" />
          <FavoritesPanel :favorites="dashboard.favorites.value" :copied-text="dashboard.copiedText.value" @copy="dashboard.copyTicket" />
        </section>

        <MetricCharts :metrics="dashboard.metrics.value" :markers="dashboard.manualCompletion.value?.position?.markers || {}" />

        <section class="analysis-grid">
          <RecordsPanel :data="dashboard.records.value" @copy="dashboard.copyTicket" />
          <PerformancePanel :data="dashboard.records.value" />
        </section>

        <DistributionCharts
          :analysis="dashboard.analysis.value"
          :red-markers="dashboard.redMarkers.value"
          :blue-markers="dashboard.blueMarkers.value"
        />

        <section class="analysis-grid">
          <ShapeOverview :analysis="dashboard.analysis.value" :items="dashboard.shapeItems.value" />
          <CommunityAggregatePanel :community="dashboard.community.value" @copy="dashboard.copyTicket" />
        </section>

        <SourceScoresPanel :community="dashboard.community.value" />
      </section>
    </main>

    <footer>数据和建议仅供统计观察，不构成投注建议。</footer>
  </div>
</template>

<script setup>
const dashboard = useDashboard();
</script>
