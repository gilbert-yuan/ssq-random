<template>
  <PanelCard title="来源评分" :badge="scores.length ? `${scores.length} 个来源` : '待拉取'">
    <div class="score-list" :class="{ muted: !scores.length }">
      <div v-for="item in scores" :key="item.sourceName" class="score-row">
        <div>
          <strong>{{ item.sourceName }}</strong>
          <span>{{ item.parsed }} 条 / {{ item.unique }} 组唯一号码{{ item.error ? ' / 访问异常' : '' }}</span>
        </div>
        <div class="score-bar"><i :style="{ width: `${percentWidth(item.score)}%` }"></i></div>
        <b>{{ item.score }}</b>
      </div>
      <template v-if="!scores.length">暂无数据</template>
    </div>
  </PanelCard>
</template>

<script setup>
import { percentWidth } from "~/utils/format.js";

const props = defineProps({
  community: { type: Object, default: null }
});
const scores = computed(() => props.community?.sourceScores || []);
</script>
