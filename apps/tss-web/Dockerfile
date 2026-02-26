# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

FROM base AS deps
ENV NODE_ENV=production
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
ARG VITE_MAX_OLD_SPACE_SIZE=3584
RUN apk add --no-cache nodejs
RUN --mount=type=secret,id=env,required=false \
	# Preserve container PATH so host-injected PATH cannot break tooling lookup. \
	ORIGINAL_PATH="$PATH"; \
	if [ -f /run/secrets/env ]; then \
		# /proc/self/environ is null-delimited; normalize to one KEY=VALUE per line. \
		tr '\000' '\n' < /run/secrets/env > /tmp/build-env.list; \
		while IFS= read -r line; do \
			[ -n "$line" ] || continue; \
			# Ignore comments and malformed lines so regular .env files also work. \
			case "$line" in \
				\#*) continue ;; \
				*=*) ;; \
				*) continue ;; \
			esac; \
			key=${line%%=*}; \
			case "$key" in \
				# Never import host PATH into the container build environment. \
				PATH) continue ;; \
				[A-Za-z_][A-Za-z0-9_]*) export "$line" ;; \
			esac; \
		done < /tmp/build-env.list; \
		rm -f /tmp/build-env.list; \
	fi; \
	# Restore PATH before running build tools.
	PATH="$ORIGINAL_PATH"; \
	/usr/bin/node --max-old-space-size="${VITE_MAX_OLD_SPACE_SIZE}" /app/node_modules/vite/bin/vite.js build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/tss-web/.output ./
EXPOSE 3000
CMD ["bun", "./server/index.mjs"]
