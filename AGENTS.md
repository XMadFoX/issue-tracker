Repository Agents Guide

- Tooling: use bun (workspace), bun (runtime), Biome (lint/format).
- Do NOT use tsc cli, rely on LSP only
- Install deps: `bun install <name>` in package/app dir or with -w flag for workspace
- DB migrations: `bun -F db generate`
- Lint repo: `biome lint .` • Format: `biome format .` or specific dir/path. USE `biome` BINARY STRAIGHT, WITHOUT PREFIXING WITH `bun`
- Imports: prefer `@/…` alias (apps/tss-web), use `import type` for types, avoid side‑effect imports (TS `noUncheckedSideEffectImports` is enabled).
- Formatting: Biome enforces tabs and double quotes; organize/sort imports (Biome assist is on).
- Types: TS is `strict`; favor inference locally, explicitly type public exports/APIs; derive runtime+TS types from zod schemas where applicable.
- Naming: camelCase vars/functions; PascalCase React components/types; UPPER_SNAKE_CASE constants; filenames kebab-case; TanStack routes follow `$param.tsx`.
- Use feature-label barrel imports for new files
<!-- - Error handling (UI): wrap async with try/catch, surface via `sonner` toasts; never throw during render; log non-PII details only. -->
- DB sources: don’t edit generated `packages/db/drizzle/**`; use drizzle‑kit commands above.
- TS config notes: `moduleResolution` bundler; prefer aliases over deep relatives; unused code is disallowed (`noUnused*`).

## Type safety

- avoid using "as <X>", "any" types
- use `ts-pattern` instead of nested ternaries

## Styling

- For dynamic styling you can use cn util, e.g. `className={cn("text-primary", className)}` (last override wins)
- For creating vatiants like primary, secondary etc use cva (class-variance-authority) util
- Use size-X instead of w-X h-X
- Tailwind version is 4, no config file, configured over css in the ui package (package/ui/src/styles.css)

## API package

- Use oRPC routes
- If tests are needed, use bun.sh for them, api is similar to vitest

### Errors

- Error handling (API): validate inputs with zod; return typed errors; don’t throw raw DB/errors—map to domain errors.
- Type errors using .errors() on router, example:

```ts
const base = os.errors({
  // <-- common errors
  RATE_LIMITED: {
    data: z.object({
      retryAfter: z.number(),
    }),
  },
  UNAUTHORIZED: {},
});
const rateLimit = base.middleware(async ({ next, errors }) => {
  throw errors.RATE_LIMITED({
    message: "You are being rate limited",
    data: { retryAfter: 60 },
  });
  return next();
});
```

```

```

## DB package

- DO NOT WRITE .sql MIGRATION FILES. INSTEAD MODIFY THE DRIZZLE SCHEMA(S) and run `bun -F db generate`

## UI & Blocks

Note that these are dump UI primitives/grouping, the state & data should be managed on the app level (e.g. tss-web) and passed via props

## Blocks package

Conventions (for new code, don't refactor existing):

- features/<domain>/
  - index.ts (public feature exports)
  - components/, forms/, modals/, lists/, views/, types/, hooks/****

## Testing & QA Conventions

- **QA Engineer Role & Focus**:
  - The QA engineer writes and maintains **End-to-End (E2E) tests** using **TypeScript + Playwright** located in `apps/e2e`.
  - **Unit and integration tests** (located in `packages/*` and `apps/tss-web`) are handled and maintained by the developers using `bun test`.
  - Agents must not confuse the two roles: keep E2E tests inside `apps/e2e` and leave developer unit/integration tests to the dev team.

- **Test Commands**:
  - `bun test:e2e` — Run Playwright E2E tests across configured browsers
  - `bun test:e2e:ui` — Run Playwright with interactive UI
  - `bun test:e2e:headed` — Run Playwright in headed browser mode
  - `bun test:e2e:report` — Open the Playwright HTML test report
  - `bun test:unit` — Run developer unit/integration tests (`bun test`)

