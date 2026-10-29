FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm exec tsc

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
EXPOSE 8787
CMD ["node", "dist/index.js"]
