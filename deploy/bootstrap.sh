#!/bin/sh
set -eu

GIT_URL="${GIT_URL:-https://github.com/gilbert-yuan/ssq-random.git}"
APP_DIR="${APP_DIR:-/opt/ssq-random}"
APP_PORT="${APP_PORT:-5173}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"
# BRANCH: if not set, clone the default branch (no forced branch)

# China mirror support: set NODE_IMAGE / POSTGRES_IMAGE in .env
# e.g. NODE_IMAGE=docker.1ms.run/node:20-bullseye-slim
#      POSTGRES_IMAGE=docker.1ms.run/postgres:16-alpine
#
# Ubuntu 16 / old kernel hosts (kernel < 4.18):
#   Use Node 20 + bullseye-slim (default) for maximum compatibility.
#   Node 22+ requires kernel >= 4.18, will crash on Ubuntu 16 (kernel 4.4).

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] $1 is required but not found." >&2
    return 1
  fi
  return 0
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

detect_compose_cmd() {
  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  else
    echo ""
  fi
}

check_runtime() {
  if [ "$INSTALL_DEPS" = "1" ]; then
    install_deps
  fi

  if ! need_cmd git; then
    echo "  Install: INSTALL_DEPS=1 sh $0" >&2
    exit 1
  fi

  if ! need_cmd docker; then
    echo "  Install Docker first, or: INSTALL_DEPS=1 sh $0" >&2
    exit 1
  fi

  if ! compose_available; then
    echo "[ERROR] docker-compose or docker compose plugin is required." >&2
    echo "  Install: INSTALL_DEPS=1 sh $0" >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker daemon is not running, or current user cannot access Docker." >&2
    echo "  Try: sudo usermod -aG docker $USER && newgrp docker" >&2
    exit 1
  fi

  echo "[OK] Runtime check passed."
  echo "  Compose command: $(detect_compose_cmd)"
}

install_deps() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "[ERROR] INSTALL_DEPS=1 requires root privileges." >&2
    echo "  Run: sudo INSTALL_DEPS=1 sh $0" >&2
    exit 1
  fi

  if command -v apt-get >/dev/null 2>&1; then
    install_deps_apt
  elif command -v yum >/dev/null 2>&1; then
    install_deps_yum
  else
    echo "[ERROR] Unsupported package manager. Install git, docker, docker-compose manually." >&2
    exit 1
  fi
}

install_deps_apt() {
  echo "==> Installing dependencies via apt-get..."

  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git curl ca-certificates gnupg lsb-release openssl

  # Install Docker from official repo if not present or too old
  if ! command -v docker >/dev/null 2>&1; then
    echo "==> Adding Docker official repository..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/"$(lsb_release -is | tr '[:upper:]' '[:lower:]')"/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    chmod a+r /etc/apt/keyrings/docker.gpg 2>/dev/null || true

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(lsb_release -is | tr '[:upper:]' '[:lower:]') $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin || \
      DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose
  fi

  # Ensure docker-compose is available (v1 fallback)
  if ! command -v docker-compose >/dev/null 2>&1; then
    if ! docker compose version >/dev/null 2>&1; then
      echo "==> Installing docker-compose..."
      DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose || true
    fi
  fi

  # Start Docker
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable docker >/dev/null 2>&1 || true
    systemctl start docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    service docker start >/dev/null 2>&1 || true
  fi

  echo "[OK] Dependencies installed."
}

install_deps_yum() {
  echo "==> Installing dependencies via yum..."

  yum install -y git curl ca-certificates openssl

  if ! command -v docker >/dev/null 2>&1; then
    echo "==> Adding Docker official repository..."
    yum install -y yum-utils || true
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo || true
    yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin || \
      yum install -y docker docker-compose || true
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable docker >/dev/null 2>&1 || true
    systemctl start docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    service docker start >/dev/null 2>&1 || true
  fi

  echo "[OK] Dependencies installed."
}

prepare_code() {
  parent_dir="$(dirname "$APP_DIR")"
  if [ ! -d "$parent_dir" ]; then
    mkdir -p "$parent_dir"
  fi

  if [ -d "$APP_DIR/.git" ]; then
    echo "[OK] Repository already exists: $APP_DIR"
    return
  fi

  if [ -e "$APP_DIR" ] && [ "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    echo "[ERROR] APP_DIR exists and is not empty: $APP_DIR" >&2
    echo "  Set APP_DIR to an empty directory, or remove it first." >&2
    exit 1
  fi

  if [ -n "${BRANCH:-}" ]; then
    echo "==> Cloning $GIT_URL (branch: $BRANCH) to $APP_DIR"
    git clone --branch "$BRANCH" "$GIT_URL" "$APP_DIR"
  else
    echo "==> Cloning $GIT_URL (default branch) to $APP_DIR"
    git clone "$GIT_URL" "$APP_DIR"
  fi
}

check_runtime
prepare_code

cd "$APP_DIR"

if [ ! -f deploy/upgrade.sh ]; then
  echo "[ERROR] deploy/upgrade.sh not found after clone." >&2
  exit 1
fi

chmod +x deploy/upgrade.sh
if [ -n "${BRANCH:-}" ]; then
  BRANCH="$BRANCH" APP_PORT="$APP_PORT" ./deploy/upgrade.sh
else
  APP_PORT="$APP_PORT" ./deploy/upgrade.sh
fi
