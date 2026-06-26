# Docker 启动说明

适合 Ubuntu 16 服务器使用 `docker-compose` 启动应用和 PostgreSQL。

## 1. 配置可选环境变量

在项目目录创建 `.env`，用于给 `docker-compose.yml` 做变量替换：

```bash
cd /opt/ssq-random
cat > .env <<'EOF'
POSTGRES_PASSWORD=change_this_password
APP_PORT=5173
EOF
```

说明：

- `APP_PORT=5173` 会把容器里的应用端口映射到服务器 `5173`。
- 如果你的 Nginx 已经反向代理到 `127.0.0.1:5173`，这里保持默认即可。
- `.env` 不会被打进镜像，仓库也已忽略该文件。

## 2. 启动

老版 Docker Compose：

```bash
docker-compose up -d --build
```

新版 Docker Compose：

```bash
docker compose up -d --build
```

## 3. 查看状态和日志

```bash
docker-compose ps
docker-compose logs -f app
docker-compose logs -f postgres
```

## 4. 本机验证

```bash
curl http://127.0.0.1:5173
```

如果 Nginx 已配置 HTTPS 反代，再验证：

```bash
curl -v https://ssq.gilbert.ink
```

## 5. 更新代码后重启

```bash
git pull
docker-compose up -d --build
```

## 6. 停止

```bash
docker-compose down
```

PostgreSQL 数据保存在 Docker volume `ssq-random_postgres-data` 中，执行普通 `docker-compose down` 不会删除数据库。

如需彻底删除数据库数据，才使用：

```bash
docker-compose down -v
```
