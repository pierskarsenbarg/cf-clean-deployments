# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm i                                        # install dependencies
npm test                                     # run all tests
npm test -- --reporter=verbose               # run tests with per-test output
npx vitest run __tests__/cleanup.test.ts     # run a single test file
npm run build                                # bundle src/ into dist/index.js via vite
npm run lint                                 # lint with oxlint
npm run format                               # format in place with oxfmt
npm run format:check                         # check formatting without writing
npm run typecheck                            # TypeScript type-check without emitting
```

`dist/index.js` must be committed — it is the bundled entry point used by the GitHub Actions runner. Always run `npm run build` and commit `dist/` before tagging a release.

## Architecture

The action is split into three source files:

- **`src/cloudflare.ts`** — `CloudflareClient` class. Wraps the Cloudflare Pages API: `listDeployments` (handles pagination automatically) and `deleteDeployment` (always passes `force=true` to handle aliased deployments). Uses native `fetch`.

- **`src/cleanup.ts`** — Pure filter functions with no I/O. `selectByCount(deployments, keepCount)` sorts by `created_on` descending and returns the tail to delete. `selectByDays(deployments, keepDays, now?)` returns deployments older than the cutoff. Both functions silently exclude active production deployments (environment `production` + stage status `success`) from the deletion list.

- **`src/index.ts`** — Vite entry point. Imports and calls `run()` from `main.ts`. Kept separate so tests can import `main.ts` without triggering execution.

- **`src/main.ts`** — Reads and validates inputs via `@actions/core`, constructs a `CloudflareClient`, calls the appropriate filter, and deletes. Exports `run()` only — no auto-execution.

Exactly one of `keep-deployments` or `keep-days` must be provided — the action calls `core.setFailed` and returns early if this invariant is violated.

## Testing

Tests live in `__tests__/` and use Vitest (configured in `vite.config.ts` under `test`). `globals: true` is set so `describe`, `it`, `expect`, and `vi` are available without imports. `@actions/core` and `../src/cloudflare` are fully mocked in `main.test.ts` via `vi.mock()`. `fetch` is mocked via `vi.spyOn(global, 'fetch')` in `cloudflare.test.ts`. `clearMocks: true` resets mock state between tests automatically. Type-only imports from `vitest` (e.g. `MockInstance`, `Mocked`, `MockedClass`) are used where TypeScript needs explicit types for mocked values.
