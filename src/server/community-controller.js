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
  const recommendations = [];
  const errors = [];

  for (const source of limitedSources) {
    try {
      const html = await fetchHtml(source);
      recommendations.push(...extractRecommendations(html, source));
    } catch (error) {
      errors.push({ sourceName: source.name, sourceUrl: source.url, error: error.message });
    }
  }

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
