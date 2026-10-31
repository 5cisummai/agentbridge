FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true \
  || pnpm install --config.dangerouslyAllowAllBuilds=true

FROM deps AS build
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm exec tsc

FROM deps AS migrate
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
CMD ["pnpm", "exec", "drizzle-kit", "push", "--force"]

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --config.dangerouslyAllowAllBuilds=true \
  || pnpm install --prod --config.dangerouslyAllowAllBuilds=true
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
EXPOSE 8787
CMD ["node", "dist/index.js"]
