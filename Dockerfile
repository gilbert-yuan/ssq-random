ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5173/api/health', r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>process.exit(r.statusCode===200?0:1)); }).on('error', ()=>process.exit(1))"

CMD ["./docker-entrypoint.sh"]
