#!/bin/sh
set -eu

# ── 裸机一键部署（无 Docker）──────────────────────────
# 适用于 Ubuntu 16+ / CentOS 7+ 等旧内核服务器
# 直接安装 Node.js 14+ + PostgreSQL + PM2
#
# 用法:
#   INSTALL_DEPS=1 sh deploy/bare-metal.sh
#
# 可选环境变量:
#   GIT_URL    - 仓库地址 (默认 GitHub)
#   BRANCH     - 分支名 (默认: 仓库默认分支)
#   APP_DIR    - 安装目录 (默认: /opt/ssq-random)
#   APP_PORT   - 应用端口 (默认: 5173)

GIT_URL="${GIT_URL:-https://github.com/gilbert-yuan/ssq-random.git}"
APP_DIR="${APP_DIR:-/opt/ssq-random}"
APP_PORT="${APP_PORT:-5173}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"
NODE_MAJOR=14

log() { echo "==> $*"; }
err() { echo "[ERROR] $*" >&2; }

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    err "此步骤需要 root 权限。"
    err "运行: sudo INSTALL_DEPS=1 sh $0"
    exit 1
  fi
}

# ── 安装 Node.js 20 ──────────────────────────────────

install_node_apt() {
  log "通过 apt 安装 Node.js $NODE_MAJOR..."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates gnupg

  # NodeSource setup script (supports Ubuntu 16.04+)
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs

  log "Node.js $(node -v) 已安装。"
}

install_node_yum() {
  log "通过 yum 安装 Node.js $NODE_MAJOR..."
  yum install -y curl ca-certificates
  curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | bash -
  yum install -y nodejs

  log "Node.js $(node -v) 已安装。"
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    current_major="$(node -v | sed 's/v//' | cut -d. -f1)"
    if [ "$current_major" -ge "$NODE_MAJOR" ]; then
      log "Node.js $(node -v) 已安装，版本满足要求。"
      return
    fi
    log "当前 Node.js $(node -v) 版本过低，需要升级到 v${NODE_MAJOR}+..."
  fi

  if command -v apt-get >/dev/null 2>&1; then
    install_node_apt
  elif command -v yum >/dev/null 2>&1; then
    install_node_yum
  else
    err "不支持的包管理器。请手动安装 Node.js $NODE_MAJOR+。"
    err "  推荐: curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
    exit 1
  fi
}

# ── 安装 PostgreSQL ──────────────────────────────────

install_pg_apt() {
  log "通过 apt 安装 PostgreSQL..."

  # 尝试用 PostgreSQL 官方源（支持旧版 Ubuntu）
  if command -v lsb_release >/dev/null 2>&1; then
    codename="$(lsb_release -cs)"
  else
    codename="focal"
  fi

  # 安装 PostgreSQL（优先用系统自带版本，Ubuntu 16 自带 9.5）
  DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib || {
    # 如果系统源没有，尝试 PostgreSQL 官方源
    log "系统源不可用，添加 PostgreSQL 官方源..."
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
    echo "deb http://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql
  }

  # 启动
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable postgresql >/dev/null 2>&1 || true
    systemctl start postgresql >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    service postgresql start >/dev/null 2>&1 || true
  fi

  log "PostgreSQL 已安装。"
}

install_pg_yum() {
  log "通过 yum 安装 PostgreSQL..."
  yum install -y postgresql-server postgresql-contrib || {
    yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-$(uname -m).pgdg-repo-latest.noarch.rpm || true
    yum install -y postgresql$(pg_version)s-server postgresql$(pg_version)s-contrib || true
  }

  # 初始化（CentOS 需要）
  if command -v postgresql-setup >/dev/null 2>&1; then
    postgresql-setup initdb || true
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable postgresql >/dev/null 2>&1 || true
    systemctl start postgresql >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    service postgresql start >/dev/null 2>&1 || true
  fi

  log "PostgreSQL 已安装。"
}

install_postgres() {
  if command -v psql >/dev/null 2>&1; then
    log "PostgreSQL 已安装。"
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    install_pg_apt
  elif command -v yum >/dev/null 2>&1; then
    install_pg_yum
  else
    err "请手动安装 PostgreSQL。"
    exit 1
  fi
}

# ── 配置数据库 ────────────────────────────────────────

setup_database() {
  log "配置数据库用户和数据库..."

  if command -v openssl >/dev/null 2>&1; then
    pg_password="$(openssl rand -hex 16)"
  else
    pg_password="ssq_$(date +%s)_$$_bare"
  fi

  # 创建用户和数据库
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='ssq'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER ssq WITH PASSWORD '$pg_password';"

  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='ssq_random'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ssq_random OWNER ssq;"

  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ssq_random TO ssq;"

  log "数据库已配置。"
  echo "  POSTGRES_PASSWORD=$pg_password"
}

# ── 配置应用 ──────────────────────────────────────────

setup_app() {
  cd "$APP_DIR"

  # 创建 .env（如果不存在）
  if [ ! -f .env ]; then
    # 获取刚才设置的密码
    pg_password="${POSTGRES_PASSWORD:-ssq_random_password}"

    umask 077
    cat > .env <<EOF
DATABASE_URL=postgresql://ssq:${pg_password}@127.0.0.1:5432/ssq_random
APP_PORT=$APP_PORT
EOF
    log ".env 已创建。"
  else
    log ".env 已存在，保留当前配置。"
  fi

  # 安装依赖
  log "安装 npm 依赖..."
  npm install --omit=dev

  # 全局安装 PM2
  if ! command -v pm2 >/dev/null 2>&1; then
    log "安装 PM2..."
    npm install -g pm2
  fi

  # 启动应用
  log "通过 PM2 启动应用..."
  pm2 startOrRestart ecosystem.config.cjs --update-env

  # 设置 PM2 开机自启
  log "配置 PM2 开机自启..."
  pm2 startup 2>/dev/null || true
  pm2 save

  log "应用已启动！"
}

# ── 主流程 ────────────────────────────────────────────

if [ "$INSTALL_DEPS" = "1" ]; then
  need_root
  install_node
  install_postgres
  setup_database
fi

# 检查 Node
if ! command -v node >/dev/null 2>&1; then
  err "Node.js 未安装。运行: INSTALL_DEPS=1 sh $0"
  exit 1
fi

node_major="$(node -v | sed 's/v//' | cut -d. -f1)"
if [ "$node_major" -lt "$NODE_MAJOR" ]; then
  err "Node.js 版本过低: $(node -v)，需要 v${NODE_MAJOR}+"
  err "运行: INSTALL_DEPS=1 sh $0"
  exit 1
fi

# 克隆代码
parent_dir="$(dirname "$APP_DIR")"
mkdir -p "$parent_dir"

if [ -d "$APP_DIR/.git" ]; then
  log "仓库已存在: $APP_DIR"
elif [ -e "$APP_DIR" ] && [ "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
  err "目录不为空: $APP_DIR"
  exit 1
else
  if [ -n "${BRANCH:-}" ]; then
    log "克隆 $GIT_URL (分支: $BRANCH)..."
    git clone --branch "$BRANCH" "$GIT_URL" "$APP_DIR"
  else
    log "克隆 $GIT_URL (默认分支)..."
    git clone "$GIT_URL" "$APP_DIR"
  fi
fi

cd "$APP_DIR"
setup_app

echo ""
echo "=========================================="
echo "  部署完成！"
echo "  应用地址: http://127.0.0.1:$APP_PORT"
echo "  手机地址: http://127.0.0.1:$APP_PORT/mobile"
echo "  PM2 状态: pm2 status"
echo "  查看日志: pm2 logs ssq-random"
echo "=========================================="
