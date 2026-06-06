#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "未找到 pm2，请先执行：npm install -g pm2" >&2
  exit 1
fi

pm2 startOrRestart ecosystem.config.cjs --update-env
