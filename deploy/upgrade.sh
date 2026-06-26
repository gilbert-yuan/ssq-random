#!/bin/sh
set -eu

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-5173}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"
DISABLE_BUILDKIT="${DISABLE_BUILDKIT:-1}"
HEALTH_CHECK="${HEALTH_CHECK:-1}"

cd "$APP_DIR"

if [ "$DISABLE_BUILDKIT" = "1" ]; then
  export DOCKER_BUILDKIT=0
  export COMPOSE_DOCKER_CLI_BUILD=0
fi

# ── helpers ──────────────────────────────────────────────

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] $1 is required." >&2
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
  echo "[ERROR] docker-compose or docker compose plugin is required." >&2
  exit 1
}

log() {
  echo "==> $*"
}

# ── pre-flight ───────────────────────────────────────────

check_project() {
  if [ ! -f Dockerfile ] || [ ! -f docker-compose.yml ]; then
    echo "[ERROR] Dockerfile and docker-compose.yml are required in $APP_DIR." >&2
    echo "  For first install, run: sh deploy/bootstrap.sh" >&2
    exit 1
  fi
}

check_runtime() {
  need_cmd docker
  if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker daemon is not running, or current user cannot access Docker." >&2
    exit 1
  fi
}

ensure_env() {
  if [ -f .env ]; then
    log ".env already exists, keeping current settings."
    return
  fi

  if command -v openssl >/dev/null 2>&1; then
    password="$(openssl rand -hex 16)"
  else
    password="ssq_$(date +%s)_$$_random"
  fi

  umask 077
  cat > .env <<EOF
POSTGRES_PASSWORD=$password
APP_PORT=$APP_PORT
# Uncomment to use China mirror for Docker images:
# NODE_IMAGE=docker.1ms.run/node:24-bookworm-slim
# POSTGRES_IMAGE=docker.1ms.run/postgres:16-alpine
EOF

  log "Created .env with random POSTGRES_PASSWORD."
  echo "  Keep POSTGRES_PASSWORD safe. Edit .env to customize."
}

update_code() {
  if [ "$SKIP_GIT_PULL" = "1" ]; then
    log "SKIP_GIT_PULL=1, skipping code update."
    return
  fi

  if [ ! -d .git ]; then
    log "No .git directory found. Skipping code update."
    return
  fi

  log "Updating code from origin/$BRANCH..."
  git fetch origin "$BRANCH"

  current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  if [ "$current_branch" != "$BRANCH" ]; then
    git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
  fi

  git pull --ff-only origin "$BRANCH" || {
    log "Fast-forward failed. Attempting merge..."
    git merge "origin/$BRANCH" --no-edit
  }

  log "Code updated to: $(git log --oneline -1)"
}

wait_for_healthy() {
  if [ "$HEALTH_CHECK" != "1" ]; then
    return 0
  fi

  log "Waiting for app to become healthy..."
  attempt=0
  max_attempts=30

  while [ "$attempt" -lt "$max_attempts" ]; do
    attempt=$((attempt + 1))

    # Check via docker health status
    status="$(docker inspect --format='{{.State.Health.Status}}' ssq-random-app 2>/dev/null || echo 'unknown')"
    if [ "$status" = "healthy" ]; then
      log "App is healthy!"
      return 0
    fi

    # Fallback: try HTTP
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
        log "App responded OK on http://127.0.0.1:$APP_PORT"
        return 0
      fi
    fi

    sleep 2
  done

  echo "[WARN] App did not become healthy within $((max_attempts * 2))s." >&2
  echo "  Check logs: compose logs app" >&2
  return 1
}

# ── main ─────────────────────────────────────────────────

log "Start deploy: $APP_DIR"
check_project
check_runtime
ensure_env
update_code

log "Pulling service images..."
compose pull postgres || log "Postgres image pull failed (may be cached)."

log "Building and restarting services..."
if [ "$DISABLE_BUILDKIT" = "1" ]; then
  log "BuildKit disabled (DOCKER_BUILDKIT=0)."
fi
compose up -d --build

log "Container status:"
compose ps

wait_for_healthy || true

log "Deploy complete."
echo "  App URL:    http://127.0.0.1:$APP_PORT"
echo "  Mobile URL: http://127.0.0.1:$APP_PORT/mobile"
echo "  Logs:       compose logs -f app"
