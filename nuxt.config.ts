export default defineNuxtConfig({
  ssr: false,
  css: ["~/assets/css/main.css"],
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN" },
      title: "双色球分析台",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content: "双色球一键选号、历史分布分析、趋势建议和社区推荐号抓取工具"
        }
      ]
    }
  },
  components: [
    {
      path: "~/components",
      pathPrefix: false
    }
  ],
  nitro: {
    preset: "static"
  },
  compatibilityDate: "2026-06-15"
});
