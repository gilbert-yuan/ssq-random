const assetVersion =
  typeof window !== "undefined" && window.__assetVersion ? `?v=${encodeURIComponent(window.__assetVersion)}` : "";

import(`./js/pages/dashboard.js${assetVersion}`).then(({ initDashboard }) => {
  initDashboard();
});
