# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

FROM base AS deps
COPY bun.lock package.json ./
COPY apps/tss-web/package.json ./apps/tss-web/package.json
COPY packages/api/package.json ./packages/api/package.json
COPY packages/blocks/package.json ./packages/blocks/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN bun install --frozen-lockfile --filter "./apps/tss-web"

FROM base AS build
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/bun.lock ./bun.lock
COPY --from=deps /app/package.json ./package.json
COPY apps ./apps
COPY packages ./packages

WORKDIR /app/apps/tss-web
ENV BUILD_NITRO_PRESET=bun
RUN --mount=type=secret,id=env,required=false \
	if [ -f /run/secrets/env ]; then \
		set -a && . /run/secrets/env && set +a; \
	fi; \
	bun run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/tss-web/.output ./
EXPOSE 3000
CMD ["bun", "./server/index.mjs"]
