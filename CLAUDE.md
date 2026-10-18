# CLAUDE.md

AutoShift is a shift-scheduling SaaS (autoshift.co.il). This repo is a monorepo with:
- a FastAPI backend in `app/`, entry point `main.py`
- a React web client in `frontend/`
- an Expo mobile client in `mobile/`

The backend uses a CP-SAT solver to generate weekly schedules from employee constraints, per-location demand, and optimization weights.

> Before working in `mobile/`, read [mobile/CLAUDE.md](mobile/CLAUDE.md). Expo v57 APIs differ from older versions, so use the versioned docs.

## Tech Stack

**Backend**
- Python 3.10, FastAPI, and Uvicorn
- SQLAlchemy 2.x in typed style (`Mapped[...]`, `mapped_column`, `select()`)
- Pydantic v2 (`ConfigDict(from_attributes=True)`)
- Alembic migrations, PostgreSQL 15 through `psycopg2-binary`
- Google OR-Tools CP-SAT for the scheduling engine
- Auth: PyJWT, and passlib + bcrypt (`bcrypt==4.0.1` is pinned deliberately for passlib compatibility)
- BeautifulSoup parses constraint exports from the external systems Yalam and Mishmarot
- Password-reset OTP emails go out over SMTP

**Web (`frontend/`)**
- React 19, TypeScript 5.9, Vite 7
- Tailwind CSS 3 and shadcn/radix-ui
- axios, react-router-dom 7, sonner (toasts), lucide-react, jwt-decode

**Mobile (`mobile/`)**
- Expo 57 / React Native, expo-router (file-based routes in `src/app/`)
- NativeWind
- EAS builds (`eas.json`)

**Infra**
- `Dockerfile` has two stages: Node 20 builds `frontend/`, then the Python 3.10 image copies `dist/` into `/app/static` and runs `python main.py`. FastAPI serves the SPA.
- `docker-compose.yml` runs the `auto-shift` app (`${HOST_PORT}:8000`) and `db` (postgres:15 on a `postgres_data` named volume). Settings come from `.env`.
- `docker-compose.override.yml` bind-mounts the source for local development.
- `docker-compose.test.yml` runs an isolated `db_test` with a healthcheck, plus a `sut` service that runs `pytest`.
- The root `package.json` is a leftover. The real web dependencies are in `frontend/package.json`.

## Commands

```bash
# Full stack
docker-compose up --build

# Backend, local (needs DATABASE_URL in .env)
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload           # Swagger at http://localhost:8000/docs

# Migrations
alembic revision --autogenerate -m "describe change"

# Tests (isolated Postgres)
docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit
pytest                              # locally, if DATABASE_URL points to a disposable test DB

# Web client
cd frontend && npm install && npm run dev   # also: npm run build / npm run lint
```

## Architecture

### Backend layers
| Path | Responsibility |
|---|---|
| `main.py` | App setup, lifespan, CORS, router registration under `/api/<resource>`, SPA catch-all (must stay the **last** route) |
| `app/api/endpoints_<resource>.py` | One `APIRouter` per resource. Handlers stay thin: validation, RBAC, DB access |
| `app/api/dependencies.py` | JWT decoding and role guards: `get_current_user`, `get_current_scheduler_user`, `get_current_manager_user`, `get_current_admin_user` |
| `app/core/models.py` | SQLAlchemy ORM models |
| `app/core/schemas.py` | Pydantic schemas named `XBase` / `XCreate` / `XUpdate` / `XResponse` |
| `app/core/enums.py` | `str` enums (`RoleEnum`, `ConstraintType`, `ConstraintSource`, `ErrorCode`) with lowercase values |
| `app/core/errors.py` | `AppError` and its handler: failures a user can act on become `{"detail", "code", "params"}` responses |
| `app/core/database.py` | Engine, `SessionLocal`, the `get_db` dependency |
| `app/core/security.py`, `config.py` | Password hashing, JWT creation, env-based settings |
| `app/services/` | Multi-step business logic: `weekly_schedule_service` (DB → solver → DB), `constraints_import_service`, `auth_service` (OTP and email) |
| `app/engine/` | `ShiftOptimizer` (CP-SAT model), `ConstraintManager` (hard and soft constraints, penalty objective), `EmployeeHistoricalState` (carryover from the previous week) |
| `app/parsers/` | HTML parsers for Yalam and Mishmarot constraint exports |

### Domain model
`Organization → Client → Location → { Employee (+ EmployeeSettings), ShiftDefinition → ShiftDemand, Assignment, WeeklyConstraint, WeeklyNote, LocationWeights }`

- `User` has one role: admin, manager, scheduler, or employee. It can be linked to an `Employee`, and to `Client`s and `Location`s through the `user_clients` and `user_locations` M2M tables. These links define the user's data scope.
- Role hierarchy: admin ⊃ manager ⊃ scheduler ⊃ employee.
- `ShiftDemand.day_of_week` uses 0 = Sunday … 6 = Saturday (Israeli week). The engine relies on the Hebrew shift names (`לילה`, `ערב`, `צהריים`) for weekend and night logic, so do not rename them casually.

### Key patterns
- **Smart Sync for assignments**: the client sends the *desired final state* for a date range. The server diffs it against the DB and applies the inserts and deletes in a single transaction. See the module docstring in `app/api/endpoints_assignments.py`. Use the same pattern for other bulk-edit screens.
- **Engine isolation**: `app/engine` knows nothing about FastAPI or HTTP. Services load ORM data, build dicts and states, call the solver, and persist the results.
- **Web client**: every HTTP call goes through `frontend/src/api/client.ts` (`apiClient`). It attaches the Bearer token from `localStorage` and redirects to `/login` on a 401. Per-resource wrappers live in `src/api/<resource>.ts`. The UI is organized in `src/features/<domain>/` (pages, components, hooks). Global state lives in `src/context/` (`AuthContext`, `LocationContext`). Shared types are in `src/types/index.ts`.
- **Mobile client** follows the same structure: `mobile/api/*.ts`, `mobile/src/hooks/`, `mobile/src/types/`.

## Coding Rules

### Backend
1. **Every non-public route takes a role guard** from `app/api/dependencies.py`. Pick the lowest role that is allowed.
2. **Scope data for non-admins.** Filter by `current_user.locations` and `current_user.clients`, plus the employee's own location. Follow `endpoints_employees.py`. When the user is out of scope, return `404 "... not found or access denied"` so the response does not reveal that the resource exists (IDOR prevention).
3. **Use SQLAlchemy 2.0 style**: `select(...)` with `db.execute(...).scalars()` / `scalar_one_or_none()`, and `joinedload` to avoid N+1 queries. Do not extend the legacy `db.query` helpers in `app/crud.py`.
4. **Every endpoint declares `response_model`** and takes a Pydantic input schema. Partial updates use `model_dump(exclude_unset=True)`. Validate numeric bounds with `Field(ge=...)`.
5. **Schema changes go through Alembic**: edit `models.py`, then run `alembic revision --autogenerate`, then review the migration. `Base.metadata.create_all` at startup does not migrate existing tables. Enum values stay lowercase.
6. **Keep bulk writes in one transaction.** Commit once at the end. Raise `HTTPException` with `status.HTTP_*` constants.
7. **Read config from env vars only.** See `.env.example`. Never hardcode secrets or commit `.env`.
8. **Log through `logging.getLogger(__name__)`**, not `print`. Never log passwords, OTPs, or tokens.
9. Add type hints on function signatures and docstrings on public functions and endpoints. Comments are in English.
10. **Failures a user can act on raise `AppError(ErrorCode.X, message, status_code=...)`** from `app/core/errors.py`, in services and endpoints alike (e.g. "this location has no shift definitions"). Add a new code in three places: `ErrorCode` in `app/core/enums.py`, the `ErrorCode` union in `frontend/src/types/index.ts`, and the message catalog in `frontend/src/api/errors.ts`. The type check fails if the catalog is missing a code. `detail` stays a plain English string, because installed mobile builds read it as one. Never put exception text (`str(e)`) in a response; log it with `logger.exception`.

### Frontend / Mobile
1. Make HTTP calls only through the `src/api` wrappers on top of `apiClient`. Do not call `axios` directly from components. Paths start with `/api/`.
2. Put shared types in `src/types/index.ts` and keep them in sync with the backend `XResponse` schemas.
3. Put domain logic in `features/<domain>/hooks/`. Components focus on rendering.
4. Style with Tailwind utilities and shadcn/radix components on web, and NativeWind on mobile.
5. Run `npm run lint` in `frontend/` before finishing a web change.
6. Show user feedback as described in "User feedback (web)" and "User feedback (mobile)" below.

### User feedback (web)
Pick the channel by how much the message should interrupt, not by success vs. error:

| Situation | Channel |
|---|---|
| Action succeeded | `notify.success(title, description?)` (toast, auto-dismiss) |
| Consequential or irreversible action | `await useConfirm()({ title, description, confirmText, tone })`. Use a verb for `confirmText`, and `tone: 'danger'` for deletes |
| Action failed inside a form or dialog that stays open | `<InlineAlert variant="error">` in that form, or a field error when it maps to one field |
| Action failed from a toolbar button or a background save | `notify.error(err, '<what failed>')`. The reason comes from the error |
| Data a screen needs failed to load | An error state in place of the content (`InlineAlert` with a "נסה שוב" action). Hide or disable actions that would save over the missing data |
| Partial success the user must read | A warning `InlineAlert` in the dialog that started it |
| Background work (token refresh, prefetch) | Nothing; `logError` only |

- `src/api/errors.ts`: `toAppError(err, { byStatus?, byCode? })` turns anything thrown into `{ kind, status, code, message }`, where `message` is Hebrew. It keeps a catalog with one message per kind and per backend `ErrorCode`. Never show the backend's raw `detail`. Log errors with `logError`, which leaves out the Bearer header.
- `src/lib/notify.ts` is the only module that may import `toast` from sonner. Lint enforces this, together with `no-alert`.
- `src/components/ui/InlineAlert.tsx`; `src/context/confirmContext.ts` (`useConfirm`) with `ConfirmProvider.tsx`; `src/components/ErrorBoundary.tsx`, which wraps the app and each routed page.
- UI text is Hebrew.

### User feedback (mobile)
The same rule, with native channels. `Alert.alert` is the platform's confirm dialog, so mobile has no `useConfirm`.

| Situation | Channel |
|---|---|
| Action succeeded | `notify.success(title)` (a toast from the root `<Toaster>`), or nothing when the change is already on screen (schedule edits) |
| Consequential or irreversible action | `Alert.alert` with verb buttons, and `style: 'destructive'` for removals |
| Refusal or error while a `Sheet` is open | `Alert.alert`. The Sheet is a `Modal`, which is drawn above the toast |
| Action failed from a button (save, start editing) | `notify.error(err, '<what failed>')` |
| Error in a form | `<InlineAlert variant="error">` in the form, or the react-hook-form field text |
| Data a screen needs failed to load | `<InlineAlert>` with a "נסה שוב" action in place of the content. Keep Save disabled |
| Render crash | The route's `ErrorBoundary` export (`ErrorFallback`), set on the root layout and each tab screen |

- `mobile/api/errors.ts` mirrors `frontend/src/api/errors.ts`: the same kinds and Hebrew copy, `toAppError(err, { byStatus?, byCode? })`, and `logError`. It has no code catalog until a mobile endpoint sends an `ErrorCode`. Never read `response.data.detail`, and log with `logError` rather than `console.error(err)`, which would print the Bearer header.
- `mobile/src/lib/notify.ts` shows one toast at a time. The UI lives in `src/components/ui/toaster.tsx`, `src/components/ui/inline-alert.tsx`, and `src/components/error-fallback.tsx`.
- A failed React Query query keeps its last data. Use `isLoadingError` for "nothing to show" and `isRefetchError` for "an older copy is on screen".

### Tests
- Use pytest with the `client` and `db_session` fixtures from `tests/conftest.py`. Tables are created and dropped per test, and a real Postgres is required.
- Bypass auth with `app.dependency_overrides[<guard>] = lambda: User(...)`, and clear the overrides afterwards.
- API tests go in `tests/api/test_endpoints_<resource>.py`. Solver and constraint tests go in `tests/engine/`.

### Git
- **Never commit.** Leave every change uncommitted in the working tree so the user can review the full diff, even when a plan lists a commit step. Commit only when the user explicitly asks in that message.
- Use Conventional Commits with a scope, for example `feat(auth): ...`, `fix(docker): ...`, `refactor(auth_service): ...`. Mention Alembic migrations in the commit message.

## Known Gotchas (do not copy these patterns)
- `app/ai/*`, `app/api/endpoint_ai.py`, and `app/tasks/celery_worker.py` are **empty placeholders**. They are not wired up, and there is no Celery or Redis service.
- Some tests still call pre-`/api` paths (e.g. `/employees/`) and use stale model fields. When a test fails, check the path before changing app code.
- `security.py` falls back to a dev `SECRET_KEY` and hardcodes `ALGORITHM`, ignoring the `.env` value. Token lifetime comes from `ACCESS_TOKEN_EXPIRE_DAYS` (default 90); clients renew it through `POST /api/auth/refresh` (sliding session), and bumping `User.token_version` revokes all of a user's tokens.
- `eas update --environment <env>` **ignores `mobile/.env*`**: EAS CLI sets `EXPO_NO_DOTENV=1` and inlines only the variables stored on EAS. Set every `EXPO_PUBLIC_*` value an OTA update needs with `eas env:set`, or the bundle gets `undefined`.
