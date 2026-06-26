const { query } = require("./pool");

async function cleanupExpiredSessions() {
  const result = await query("DELETE FROM sessions WHERE expires_at < NOW()");
  return result.rowCount || 0;
}

module.exports = {
  cleanupExpiredSessions
};
