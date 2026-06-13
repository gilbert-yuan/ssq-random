const {
  aggregateRecommendations,
  extractRecommendations,
  fetchHtml,
  readSources,
  scoreSources
} = require("./community");
const { resolveRequestUser } = require("./auth");
const { readCommunitySnapshot, upsertCommunitySnapshot } = require("./database");
const { sendJson } = require("./http");

async function handleCommunity(req, reqUrl, res) {
  const authState = await resolveRequestUser(req);
  const userId = authState.user?.id || "";

  if (req.method === "GET" && reqUrl.searchParams.get("saved") === "1") {
    const snapshot = userId ? await readCommunitySnapshot(userId) : null;
    sendJson(res, 200, {
      ok: true,
      authenticated: Boolean(userId),
      user: authState.user || null,
      snapshot: snapshot || null
    });
    return;
  }

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

  const payload = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    sources: limitedSources,
    count: recommendations.length,
    recommendations,
    aggregate: aggregateRecommendations(recommendations),
    sourceScores: scoreSources(limitedSources, recommendations, errors),
    errors
  };

  if (userId) {
    await upsertCommunitySnapshot(payload, userId);
  }

  sendJson(res, 200, payload);
}

module.exports = {
  handleCommunity
};
