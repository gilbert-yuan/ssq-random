const { DATABASE_URL, DB_SSL } = require("./config");

function maskDatabaseUrl(value) {
  if (!value) return "";
  return value.replace(/:\/\/([^:@]+):([^@]+)@/, "://$1:***@");
}

function validateStartupPrerequisites() {
  const issues = [];

  try {
    require.resolve("pg");
  } catch {
    issues.push('缺少依赖 "pg"，请先运行 `npm install`。');
  }

  if (!DATABASE_URL) {
    issues.push("缺少环境变量 `DATABASE_URL`，例如 `postgresql://postgres:password@127.0.0.1:5432/ssq_random`。");
  }

  if (issues.length) {
    const error = new Error(issues.join("\n"));
    error.code = "STARTUP_PRECHECK_FAILED";
    error.details = issues;
    throw error;
  }
}

function formatStartupError(error) {
  if (!error) return "服务启动失败。";

  if (error.code === "STARTUP_PRECHECK_FAILED") {
    const lines = ["服务启动前检查失败：", ...error.details.map((item) => `- ${item}`)];
    if (!DB_SSL) {
      lines.push("- 如果你的 PostgreSQL 连接要求 SSL，请再设置 `DB_SSL=1`。");
    }
    return lines.join("\n");
  }

  const lines = ["服务启动失败："];

  if (error.code === "ECONNREFUSED") {
    lines.push("- 无法连接到 PostgreSQL，请确认数据库服务已经启动。");
  } else if (error.code === "ENOTFOUND") {
    lines.push("- 无法解析 DATABASE_URL 中的数据库主机名。");
  } else if (error.code === "28P01") {
    lines.push("- PostgreSQL 用户名或密码不正确。");
  } else if (error.code === "3D000") {
    lines.push("- DATABASE_URL 指向的数据库不存在。");
  } else if (error.code === "MODULE_NOT_FOUND" && /'pg'/.test(error.message || "")) {
    lines.push('- 缺少依赖 "pg"，请先运行 `npm install`。');
  } else {
    lines.push(`- ${error.message || "未知错误"}`);
  }

  if (DATABASE_URL) {
    lines.push(`- DATABASE_URL: ${maskDatabaseUrl(DATABASE_URL)}`);
  }
  if (DB_SSL) {
    lines.push("- DB_SSL: 1");
  }

  return lines.join("\n");
}

module.exports = {
  formatStartupError,
  maskDatabaseUrl,
  validateStartupPrerequisites
};
