FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/player/package.json packages/player/package.json
COPY packages/admin/package.json packages/admin/package.json
COPY packages/report/package.json packages/report/package.json
RUN npm ci --omit=dev
COPY netlify/functions netlify/functions
COPY netlify/database/migrations netlify/database/migrations
COPY services/live services/live
USER node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["sh", "-c", "node services/live/migrate.mjs && node services/live/server.mjs"]
