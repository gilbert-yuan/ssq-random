export async function bootstrapDashboardData({ refreshAuth, restoreSavedCommunitySnapshot, fetchDraws }) {
  await refreshAuth();
  await Promise.all([restoreSavedCommunitySnapshot(), fetchDraws(false)]);
}
