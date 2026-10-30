FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS web
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true \
  || pnpm install --config.dangerouslyAllowAllBuilds=true
COPY web/ ./
RUN pnpm build

FROM base AS deps
WORKDIR /server
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true \
  || pnpm install --config.dangerouslyAllowAllBuilds=true

FROM deps AS build
COPY server/tsconfig.json server/drizzle.config.ts ./
COPY server/src ./src
RUN pnpm exec tsc

FROM base AS runner
ENV NODE_ENV=production
ENV WEB_DIST=/app/public
WORKDIR /app
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --config.dangerouslyAllowAllBuilds=true \
  || pnpm install --prod --config.dangerouslyAllowAllBuilds=true
COPY --from=build /server/dist ./dist
COPY server/drizzle ./drizzle
COPY --from=web /web/dist ./public
EXPOSE 8787
CMD ["node", "dist/index.js"]
