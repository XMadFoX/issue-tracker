FROM node:24-alpine AS install
RUN npm install -g pnpm@10.17.1
RUN pnpm -v
WORKDIR /app
COPY package.json .
COPY pnpm-workspace.yaml .
COPY pnpm-lock.yaml .
COPY apps/tss-web/package.json ./apps/tss-web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/blocks/package.json ./packages/blocks/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY --from=install /app/apps/tss-web /app/apps/tss-web
COPY --from=install /app/packages /app/packages
COPY --from=install /app/node_modules /app/node_modules
# copy actual source files
COPY apps/tss-web /app/apps/tss-web
COPY packages/ui /app/packages/ui
COPY packages/blocks /app/packages/blocks
COPY packages/db /app/packages/db
COPY packages/api /app/packages/api
ENV NODE_ENV=production
WORKDIR /app/apps/tss-web
RUN bun run build

# TODO: runtime
