# Docker deployment

## Files

- `Dockerfile`: builds the Nuxt static frontend and Node.js application image
- `docker-compose.yml`: starts `app` and `db`
- `deploy/nginx/default.conf`: Nginx reverse proxy config for the system-installed Nginx

## Start

```bash
docker compose up -d --build
```

The image build runs `npm run generate`, then the Node.js server serves `.output/public` together with `/api/*`.

After startup, the application is available at:

```text
http://127.0.0.1:5173
```

If you want to use the system-installed Nginx, copy `deploy/nginx/default.conf` into your Nginx config directory and reload Nginx. After that, you can access it through port `80`.

## Stop

```bash
docker compose down
```

To also remove the database volume:

```bash
docker compose down -v
```

## Default settings

- App exposed port: `${APP_PORT:-5173}`
- PostgreSQL database: `${POSTGRES_DB:-ssq_random}`
- PostgreSQL user: `${POSTGRES_USER:-postgres}`
- PostgreSQL password: `${POSTGRES_PASSWORD:-postgres}`

## Customization

Set environment variables before running Docker Compose if you want to change defaults:

```bash
APP_PORT=8080 POSTGRES_PASSWORD=change-me docker compose up -d --build
```

You can also create a local `.env` file for Docker Compose:

```text
APP_PORT=5173
POSTGRES_DB=ssq_random
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-me
```

The local `./data` directory is mounted into `/app/data` so cache files and source configuration stay editable outside the container.

## Local validation

```bash
npm run generate
npm test
```

The smoke test expects the Nuxt static output in `.output/public` and validates the Node.js `/api/*` endpoints.
