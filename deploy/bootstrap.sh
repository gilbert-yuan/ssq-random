#!/bin/sh
set -eu

GIT_URL="${GIT_URL:-https://github.com/gilbert-yuan/ssq-random.git}"
BRANCH="${BRANCH:-feat/dashboard-picks-records}"
APP_DIR="${APP_DIR:-/opt/ssq-random}"
APP_PORT="${APP_PORT:-5173}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required." >&2
    exit 1
  fi
}

compose_available() {
  if command -v docker-compose >/dev/null 2>&1; then
    return 0
  fi

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

check_runtime() {
  if [ "$INSTALL_DEPS" = "1" ]; then
    install_deps
  fi

  need_cmd git
  need_cmd docker

  if ! compose_available; then
    echo "docker-compose or docker compose is required." >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not running, or current user cannot access Docker." >&2
    exit 1
  fi
}

install_deps() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "apt-get not found. Please install git, docker, and docker-compose manually." >&2
    exit 1
  fi

  if [ "$(id -u)" -ne 0 ]; then
    echo "INSTALL_DEPS=1 requires root. Run as root or install dependencies manually." >&2
    exit 1
  fi

  echo "Installing dependencies with apt-get..."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y git curl openssl docker.io docker-compose

  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable docker >/dev/null 2>&1 || true
    systemctl start docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    service docker start >/dev/null 2>&1 || true
  fi
}

prepare_code() {
  parent_dir="$(dirname "$APP_DIR")"
  if [ ! -d "$parent_dir" ]; then
    mkdir -p "$parent_dir"
  fi

  if [ -d "$APP_DIR/.git" ]; then
    echo "Repository exists: $APP_DIR"
    return
  fi

  if [ -e "$APP_DIR" ] && [ "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    echo "APP_DIR exists and is not empty: $APP_DIR" >&2
    echo "Set APP_DIR to an empty directory, or run deploy/upgrade.sh inside the existing repo." >&2
    exit 1
  fi

  echo "Cloning $GIT_URL branch $BRANCH to $APP_DIR"
  git clone --branch "$BRANCH" "$GIT_URL" "$APP_DIR"
}

check_runtime
prepare_code

cd "$APP_DIR"

if [ ! -f deploy/upgrade.sh ]; then
  echo "deploy/upgrade.sh not found after clone." >&2
  exit 1
fi

chmod +x deploy/upgrade.sh
BRANCH="$BRANCH" APP_PORT="$APP_PORT" ./deploy/upgrade.sh
