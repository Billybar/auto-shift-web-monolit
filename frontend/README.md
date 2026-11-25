# AutoShift web client

The React web client of AutoShift: React 19, TypeScript, Vite, Tailwind, TanStack Query, and Vitest with Testing Library. In production, FastAPI serves the built `dist/` (see the root `Dockerfile`).

Conventions (API access, server state, user feedback, imports) are in the root [CLAUDE.md](../CLAUDE.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173. `/api` is proxied to the backend on `127.0.0.1:8000` |
| `npm run build` | Type check, then production build into `dist/` |
| `npm run typecheck` | `tsc -b` only |
| `npm run lint` | ESLint. Run it before finishing a change |
| `npm test` | All tests once |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with a coverage summary; the HTML report goes to `coverage/` |

### Why the tests run through `scripts/vitest.mjs`
VS Code on Windows opens terminals in `c:\...`, but Node resolves modules as `C:\...`. Vitest then loads twice and every suite fails with "Vitest failed to find the current suite". `scripts/vitest.mjs` fixes the drive letter's case before Vitest starts. Run tests through the npm scripts, not `npx vitest`.

## Layout of `src/`

| Path | What's there |
|---|---|
| `api/` | `client.ts` (the axios instance, Bearer token, redirect on 401), one wrapper module per resource, `queries.ts` (shared TanStack Query options), `query.ts` (client defaults, `loadStatus`), `errors.ts` (`toAppError`, `logError`) |
| `features/<domain>/` | One folder per screen area (`schedule`, `constraints`, `employees`, `location-settings`, `admin`, `auth`, `demo`, `legal`, `positions`): pages and components, with logic in `hooks/` |
| `components/` | Shared UI: `ui/` primitives (Button, Dialog, Input, InlineAlert, ...), `auth/` route guards, `ErrorBoundary` |
| `context/` | Global state: auth, the selected location, the confirm dialog |
| `lib/` | Small helpers: dates, `notify` (the only way to show a toast), colors |
| `types/` | Shared types, kept in sync with the backend's response schemas |
| `test/` | Test setup and `createQueryWrapper()` for hook tests |

Import from other folders with `@/...` (→ `src/`), and use `./` only for the file's own folder and its subfolders. Lint rejects `../` imports.

Tests sit next to the code they test (`*.test.ts(x)`) and run in jsdom. Pure-logic tests that render nothing start with `// @vitest-environment node`, which makes them faster. All tests run with `TZ=Asia/Jerusalem`.
