const fs = require("fs");

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return env;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return env;

      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
      return env;
    }, {});
}

function loadDotEnv(filePath) {
  const fileEnv = parseDotEnv(filePath);
  Object.entries(fileEnv).forEach(([key, value]) => {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
  return fileEnv;
}

function readDotEnvWithOverrides(filePath) {
  const fileEnv = parseDotEnv(filePath);
  return Object.fromEntries(
    Object.entries(fileEnv).map(([key, value]) => [
      key,
      process.env[key] === undefined ? value : process.env[key]
    ])
  );
}

module.exports = {
  loadDotEnv,
  parseDotEnv,
  readDotEnvWithOverrides
};
