const path = require("node:path");
const { readDotEnvWithOverrides } = require("./src/server/env-file");

const ROOT_DIR = __dirname;
const fileEnv = readDotEnvWithOverrides(path.join(ROOT_DIR, ".env"));

module.exports = {
  apps: [
    {
      name: "ssq-random",
      script: "server.js",
      cwd: ROOT_DIR,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      time: true,
      kill_timeout: 6000,
      max_memory_restart: "300M",
      env: {
        ...fileEnv,
        NODE_ENV: process.env.NODE_ENV || fileEnv.NODE_ENV || "production"
      }
    }
  ]
};
