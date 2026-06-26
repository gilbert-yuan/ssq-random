#!/bin/sh
set -eu

# ── 裸机一键更新（无 Docker）──────────────────────────
# 拉取最新代码 + 安装依赖 + PM2 重启
#
# 用法:
#   sh deploy/bare-metal-upgrade.sh
#
# 可选环境变量:
#   BRANCH       - 指定分支 (默认: 当前分支)
#   SKIP_PULL    - 设为 1 跳过 git pull
#   APP_DIR      - 安装目录 (默认: 自动检测)

APP_DIR="${APP_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
SKIP_PULL="${SKIP_PULL:-0}"

cd "$APP_DIR"

log() { echo "==> $*"; }

# 检查 Node
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js 未安装。" >&2
  exit 1
fi

node_major="$(node -v | sed 's/v//' | cut -d. -f1)"
if [ "$node_major" -lt 14 ]; then
  echo "[ERROR] Node.js $(node -v) 版本过低，需要 v14+。" >&2
  exit 1
fi

# 拉取代码
if [ "$SKIP_PULL" != "1" ] && [ -d .git ]; then
  current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  target_branch="${BRANCH:-$current_branch}"

  if [ -n "$target_branch" ]; then
    log "更新代码 (分支: $target_branch)..."
    git fetch origin "$target_branch"

    if [ "$current_branch" != "$target_branch" ]; then
      git checkout "$target_branch" 2>/dev/null || git checkout -b "$target_branch" "origin/$target_branch"
    fi

    git pull --ff-only origin "$target_branch" || git merge "origin/$target_branch" --no-edit
    log "代码已更新: $(git log --oneline -1)"
  fi
else
  log "跳过代码更新。"
fi

# 安装依赖
log "安装依赖..."
npm install --omit=dev

# 重启
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[ERROR] PM2 未安装。运行: npm install -g pm2" >&2
  exit 1
fi

log "重启应用..."
pm2 restart ssq-random --update-env

log "更新完成！"
pm2 status
