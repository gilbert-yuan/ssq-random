const {
  aggregateRecommendations,
  extractRecommendations,
  fetchHtml,
  readSources,
  scoreSources
} = require("./community");
const { sendJson } = require("./http");

async function handleCommunity(reqUrl, res) {
  const limitedSources = await readSources(reqUrl.searchParams);
  const results = await Promise.all(
    limitedSources.map(async (source) => {
      try {
        const html = await fetchHtml(source);
        return {
          recommendations: extractRecommendations(html, source),
          error: null
        };
      } catch (error) {
        return {
          recommendations: [],
          error: { sourceName: source.name, sourceUrl: source.url, error: error.message }
        };
      }
    })
  );
  const recommendations = results.flatMap((item) => item.recommendations);
  const errors = results.map((item) => item.error).filter(Boolean);

  sendJson(res, 200, {
    fetchedAt: new Date().toISOString(),
    sources: limitedSources,
    count: recommendations.length,
    recommendations,
    aggregate: aggregateRecommendations(recommendations),
    sourceScores: scoreSources(limitedSources, recommendations, errors),
    errors
  });
}

module.exports = {
  handleCommunity
};
