<template>
  <PanelCard title="社区来源" :badge="`${community?.count || 0} 条`">
    <textarea :value="sourceUrls" spellcheck="false" @input="$emit('update:sourceUrls', $event.target.value)"></textarea>
    <div class="community-list" :class="{ muted: !community?.recommendations?.length }">
      <template v-if="community?.recommendations?.length">
        <div v-for="item in community.recommendations.slice(0, 6)" :key="`${item.sourceName}-${item.reds.join('-')}-${item.blue}`" class="community-item">
          <BallList :reds="item.reds" :blue="item.blue" small />
          <p><a :href="safeExternalUrl(item.sourceUrl)" target="_blank" rel="noreferrer">{{ item.sourceName }}</a></p>
          <div class="ticket-actions"><button class="small-button copy-button" type="button" @click="$emit('copy', item)">复制</button></div>
        </div>
      </template>
      <template v-else>{{ community?.errors?.length ? '未识别到号码，可能页面需要登录、强反爬或结构已变。' : '尚未抓取' }}</template>
    </div>
  </PanelCard>
</template>

<script setup>
import { safeExternalUrl } from "~/utils/format.js";

defineProps({
  sourceUrls: { type: String, default: "" },
  community: { type: Object, default: null }
});

defineEmits(["update:sourceUrls", "copy"]);
</script>
