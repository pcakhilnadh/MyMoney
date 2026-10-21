# Expense Tracker

A simple, installable (PWA) expense tracker for **personal, family and group** spending, with a dark
CRED-inspired UI. Data is stored locally first (works offline) and syncs to the server when online.

- **Front-end:** React + TypeScript + Vite, Tailwind CSS 4, shadcn/ui, TanStack Query, Dexie (IndexedDB), vite-plugin-pwa
- **Back-end:** FastAPI, SQLAlchemy 2, Alembic, Supabase PostgreSQL (used as a managed database only)
- **Auth:** Google Sign-In only 

## Architecture

```
┌────────────────────────── Browser (PWA) ──────────────────────────┐
│ React UI ──> Repositories ──> IndexedDB (Dexie, one DB per user)  │
│     │                              ▲                              │
│     │ groups / settlements         │ push & pull                  │
│     ▼ (online only)                │                              │
│   API client ──────── Sync engine ─┘                              │
└─────────────┬─────────────────────────────────────────────────────┘
              │ HTTPS + Bearer <Google ID token>
┌─────────────▼───────────── FastAPI (monolith) ────────────────────┐
│ verify Google token → find/create profile (by google_sub)         │
│ routes: accounts, categories, transactions, groups, settlements,  │
│         budgets, insights, /sync/push, /sync/pull                 │
│ authorization + split/balance rules live here (app/splits.py)     │
└─────────────┬─────────────────────────────────────────────────────┘
              │ SQLAlchemy (server-side connection string)
        Supabase PostgreSQL
```

Key ideas
- **Local-first for personal data.** Accounts, categories, budgets and personal transactions are written to
  IndexedDB immediately and marked `pending`. The sync engine pushes them (`POST /sync/push`) and pulls
  changes (`GET /sync/pull`). Records have a client-generated UUID and a `version`; the higher version wins.
- **Groups need the internet.** Group/family expenses, splits, balances and settlements go straight to the API.
- **No Supabase Auth / RLS.** FastAPI verifies the Google ID token and enforces all access rules.
- **Minimal personal data stored.** The server keeps only `google_sub` and `email` per user. A member's Google
  name is saved on `group_members.display_name` only when they join a group.
- Money is stored as integer **minor units** (paise) everywhere.

## Data model (summary)

| Table | Purpose |
|---|---|
| `profiles` | Identity only: `id`, `google_sub`, `email` |
| `accounts` | Cash/bank/UPI/credit card etc. with `opening_balance` and (cards) `credit_limit` |
| `categories` | Expense/income categories (user-owned) |
| `transactions` | Expenses, income, refunds; `context` = personal / family / group; `client_id`, `version` |
| `split_allocations` | Each participant's share and amount paid for a shared transaction |
| `expense_groups`, `group_members` | Groups/family spaces; members are added by email (`invited` → `active`) |
| `settlements` | Payments between members of a group |
| `budgets` | Spending limits (personal or group) |
| `audit_logs` | History of sensitive changes |

Split methods: equal, exact amount, percentage, shares. Balances = (paid − share) per member, adjusted by
settlements. 

## Repository layout

```
front-end/   React app (src/db = local DB + repositories, src/sync = sync engine, src/pages = screens)
back-end/    FastAPI app (app/), Alembic migrations (migrations/), tests (tests/)

```

## Prerequisites

- **Node.js 20.19+** (22 LTS recommended) and npm
- **Python 3.12+** and **[uv](https://docs.astral.sh/uv/)** (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- A **Supabase** project (or any PostgreSQL) and a **Google OAuth Web client ID**

## First-time setup on a new machine

### 1. Google OAuth client
Google Cloud Console → APIs & Services → Credentials → *Create credentials* → *OAuth client ID* → **Web application**.
Add `http://localhost:5173` (and your production URL later) under **Authorized JavaScript origins**.
Copy the client ID (`…apps.googleusercontent.com`).

### 2. Back-end
```bash
cd back-end
cp .env.example .env        # then edit .env (see "Configuration")
uv python install 3.13 # install py version if not
uv python pin 3.13  # pin version
uv sync                     # creates .venv and installs dependencies
uv run alembic upgrade head # creates/updates tables in the database
uv run uvicorn app.main:app --reload --port 8000
```
API: http://localhost:8000 · interactive docs: http://localhost:8000/docs · health: `/health`

### 3. Front-end
```bash
cd front-end
cp .env.example .env        # set VITE_GOOGLE_CLIENT_ID
npm install
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 and sign in with Google.

## Configuration and sensitive credentials

| File | Variable | Secret? | Notes |
|---|---|---|---|
| `back-end/.env` | `DATABASE_URL` | **Yes** | `postgresql+psycopg://USER:PASSWORD@HOST:5432/postgres`. URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`) |
| `back-end/.env` | `GOOGLE_CLIENT_ID` | No | Must match the front-end value |
| `back-end/.env` | `CORS_ORIGINS` | No | JSON list, e.g. `["http://localhost:5173"]`. Set to your real front-end URL in production |
| `back-end/.env` | `APP_URL` | No | Used in invite emails |
| `back-end/.env` | `SMTP_HOST/PORT/USER/PASSWORD/FROM` | **Yes** (password) | Optional. Without them, invite emails are skipped (a "mailto" link is offered in the UI) |
| `front-end/.env` | `VITE_GOOGLE_CLIENT_ID` | No (public) | Same client ID |
| `front-end/.env` | `VITE_API_URL` | No | Defaults to `http://localhost:8000` |

- **Real secrets live only in `back-end/.env`** (database password, SMTP password). It is git-ignored; never commit it
  or paste it in chat/tickets. Rotate the database password in Supabase (Project Settings → Database) if it is ever exposed.
- Everything in `front-end/.env` ends up in the browser bundle, so it must **never** hold a secret.
- The server never trusts the browser for identity: every request is verified against Google's signature.

## Deploy to Vercel with Services

The repository-root `vercel.json` configures `front-end/` and `back-end/` as
Services in one Vercel project. Import the repository root, select **Services**
as the project framework, and set these variables under **Project Settings →
Environment Variables**:

| Variable | Value | Environment / sensitivity |
|---|---|---|
| `DATABASE_URL` | Your PostgreSQL URI | Development, Preview, Production; mark sensitive |
| `GOOGLE_CLIENT_ID` | Your Google OAuth Web client ID | Development, Preview, Production |
| `APP_URL` | `https://YOUR-PRODUCTION-DOMAIN` | Optional for initial deployment; set in Production after the first deployment |
| `CORS_ORIGINS` | `[]` | Development, Preview, Production; same-origin `/api` calls do not need CORS |
| `VITE_GOOGLE_CLIENT_ID` | Same Google OAuth Web client ID | Development, Preview, Production; public build-time variable |
| `VITE_API_URL` | `/api` | Development, Preview, Production; public build-time variable |

Use the same `DATABASE_URL` for all three environments for now, as requested.
This means Preview and Production will share data; switch to separate databases
before using Preview for tests that modify data. Enter the real database URI
and client ID directly in Vercel; do not commit them or paste them into source
files. SMTP variables are optional and can be omitted.

The frontend URL is not needed to configure API routing: requests use the
same-origin `/api` path. You can leave `APP_URL` unset for the initial deploy
when email is not configured. After Vercel assigns a URL, set `APP_URL` to that
site's origin (for example, `https://your-project.vercel.app`) and redeploy.
Add that exact origin in Google Cloud Console under the OAuth client's
**Authorized JavaScript origins**. For Preview Google sign-in, also authorize
the Preview origin or configure a stable preview domain.

The backend retains its existing unprefixed routes for local development and
also serves `/api`-prefixed routes for Vercel's shared-domain routing.

## Tests

```bash
# back-end (from back-end/)
uv run pytest

# front-end (from front-end/)
npm test                 # unit tests (Vitest)
npx playwright install chromium   # one-time browser download
npm run e2e              # personal flows, offline use
npm run e2e:sync         # full stack: sync + two-user group flow (starts a test API with fake Google tokens on SQLite)
npm run e2e:pwa          # production build: installable + reloads offline
```

The e2e suites use fake tokens against a **test-only** server (`back-end/tests/e2e_server.py`); they never touch
your real database or Google.

## Build and install as an app (PWA)

```bash
cd front-end && npm run build && npm run preview   # serves the production build with the service worker
```
- Chrome/Edge: use the install icon in the address bar, or **Personal → Install app**.
- iPhone/iPad: Safari → Share → **Add to Home Screen**.
- Installing requires **HTTPS** (except on `localhost`). For other people, deploy the front-end (e.g. Vercel) and the
  API to a public HTTPS host, then add that front-end URL to the Google client's authorized origins and to `CORS_ORIGINS`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `uv: command not found` | Install uv (see Prerequisites) and reopen the terminal |
| Back-end can't connect to Supabase / hangs | The direct host (`db.<ref>.supabase.co`) may be IPv6-only. Use the **Session pooler** connection string from Supabase → Connect, keeping the `postgresql+psycopg://` prefix |
| `password authentication failed` | Wrong password, or special characters not URL-encoded (`@` → `%40`) |
| `invalid interpolation syntax` from Alembic | Already handled in `migrations/env.py` (escapes `%`). Make sure you did not edit it out |
| `relation "…" does not exist` / missing column | Run `uv run alembic upgrade head` |
| Google button shows *origin_mismatch* / doesn't render | Add `http://localhost:5173` to Authorized JavaScript origins; changes can take a few minutes. Check `VITE_GOOGLE_CLIENT_ID` is set and restart `npm run dev` |
| Login page says "Set VITE_GOOGLE_CLIENT_ID…" | `front-end/.env` missing or the dev server wasn't restarted after editing it |
| Browser shows CORS errors / sync status "Error: Failed to fetch" | Back-end not running, wrong `VITE_API_URL`, or your front-end URL missing from `CORS_ORIGINS` |
| `Invalid Google token` (401) | `GOOGLE_CLIENT_ID` on the back-end differs from the front-end one, or the machine clock is wrong |
| Signed out after about an hour | Google ID tokens expire after 1 hour and sessions currently use them directly. Sign in again; local data is kept |
| Port 5173/8000 already in use | Stop the other process, or run on another port (`npm run dev -- --port 5180`, `uvicorn … --port 8010`) and update `VITE_API_URL` / `CORS_ORIGINS` |
| `npm install` fails on old Node | Upgrade to Node 20.19+ (check with `node -v`) |
| Playwright: *Executable doesn't exist* | Run `npx playwright install chromium` (Linux may also need `npx playwright install-deps`) |
| Changes not showing after a production build | The service worker caches the app. Reload twice, or DevTools → Application → Service Workers → Unregister |
| Data from another Google account missing | Each account has its own local database in the browser; sign in with the original account |
| Invite email not received | SMTP isn't configured or was rejected (check the API log). Use the **Invited · email** link on the member row instead |
