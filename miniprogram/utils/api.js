function getBaseUrl() {
  const app = getApp();
  return app?.globalData?.apiBase || "http://127.0.0.1:5173";
}

function request(options) {
  const { url, method = "GET", data } = options;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${url}`,
      method,
      data,
      timeout: 15000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        reject(new Error(res.data?.error || `HTTP ${res.statusCode}`));
      },
      fail: (error) => {
        reject(new Error(error.errMsg || "request failed"));
      }
    });
  });
}

function fetchHome(limit = 120) {
  return request({ url: `/api/mobile/home?limit=${limit}` });
}

function fetchPicks(limit = 240) {
  return request({ url: `/api/mobile/picks?limit=${limit}` });
}

function completeTicket(payload) {
  return request({
    url: "/api/complete-ticket",
    method: "POST",
    data: payload
  });
}

function saveRecords(records) {
  return request({
    url: "/api/records",
    method: "POST",
    data: { records }
  });
}

function deleteRecord(id) {
  return request({
    url: `/api/records?id=${encodeURIComponent(id)}`,
    method: "DELETE"
  });
}

function setRecordPinned(id, pinned) {
  return request({
    url: "/api/records",
    method: "PATCH",
    data: { id, pinned }
  });
}

module.exports = {
  completeTicket,
  deleteRecord,
  fetchHome,
  fetchPicks,
  saveRecords,
  setRecordPinned
};
