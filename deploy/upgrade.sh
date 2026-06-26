#!/bin/sh
set -eu

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BRANCH="${BRANCH:-feat/dashboard-picks-records}"
APP_PORT="${APP_PORT:-5173}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"
DISABLE_BUILDKIT="${DISABLE_BUILDKIT:-1}"

cd "$APP_DIR"

if [ "$DISABLE_BUILDKIT" = "1" ]; then
  export DOCKER_BUILDKIT=0
  export COMPOSE_DOCKER_CLI_BUILD=0
fi

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required." >&2
    exit 1
  fi
}

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return
  fi

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi

  echo "docker-compose or docker compose is required." >&2
  exit 1
}

check_project() {
  if [ ! -f Dockerfile ] || [ ! -f docker-compose.yml ]; then
    echo "Dockerfile and docker-compose.yml are required in $APP_DIR." >&2
    echo "For first install, run: sh deploy/bootstrap.sh" >&2
    exit 1
  fi
}

check_runtime() {
  need_cmd docker
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not running, or current user cannot access Docker." >&2
    exit 1
  fi
  compose version >/dev/null 2>&1 || true
}

ensure_env() {
  if [ -f .env ]; then
    return
  fi

  if command -v openssl >/dev/null 2>&1; then
    password="$(openssl rand -hex 16)"
  else
    password="ssq_$(date +%s)"
  fi

  umask 077
  {
    echo "POSTGRES_PASSWORD=$password"
    echo "APP_PORT=$APP_PORT"
  } > .env

  echo "Created .env. Keep POSTGRES_PASSWORD safe."
}

update_code() {
  if [ "$SKIP_GIT_PULL" = "1" ]; then
    echo "Skip git pull."
    return
  fi

  if [ ! -d .git ]; then
    echo "No .git directory found. Skip code update."
    return
  fi

  echo "Updating branch: $BRANCH"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
}

echo "Start one-click upgrade and build: $APP_DIR"
check_project
check_runtime
ensure_env
update_code

echo "Pulling service images..."
compose pull postgres

echo "Building and restarting services..."
if [ "$DISABLE_BUILDKIT" = "1" ]; then
  echo "BuildKit disabled: DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0"
fi
compose up -d --build

echo "Container status:"
compose ps

if command -v curl >/dev/null 2>&1; then
  echo "Checking local app: http://127.0.0.1:$APP_PORT"
  curl -fsS "http://127.0.0.1:$APP_PORT" >/dev/null && echo "App is running."
else
  echo "curl is not installed. Skip local check."
fi

echo "Upgrade complete."
