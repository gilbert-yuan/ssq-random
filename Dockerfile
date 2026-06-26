FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 5173

CMD ["./docker-entrypoint.sh"]
