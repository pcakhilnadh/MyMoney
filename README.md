# MyTracker

A personal tracker you install on your phone, with three apps in one:

- **My Money**: expenses, income, transfers, accounts, budgets and shared group expenses.
- **My Food**: a food diary with a daily calorie goal and insights.
- **MyPlate**: meal planning with the people you cook for.

Version **1.0.0** · API **v1**

## Core features

**My Money**
- Add expenses, income, refunds and transfers; search or create categories as you go.
- Payment accounts (cash, bank, cards, loans) with balances, due dates and a default account.
- Monthly budgets by category, spending insights and a ledger.
- Groups: split expenses with others, see who owes whom, and settle up.
- Snap a bill and let AI fill in the transaction for you to review.

**My Food**
- Log meals from a shared food catalogue, or snap a photo and let AI find the foods.
- A daily calorie goal, a diary by date, and insights such as averages and streaks.

**MyPlate**
- **Kitchens**: My Kitchen is just for you; shared kitchens are for a partner, family or flatmates.
- **Plan**: a week of meals per kitchen, with who's cooking, who's eating, sides, leftovers, and copying last week.
- **Today**: what's on your plate and tonight's prep for tomorrow (soak the rajma), ticked off together.
- **Cart**: a shared grocery list sorted by aisle, with "go live" so others see you're shopping.
- **Ideas**: a wishlist, plus voting in shared kitchens; import a recipe from a link.

**Everywhere**
- Works offline and opens instantly. Changes save on the phone first and sync in the background.
- Sign in with Google. One sync status for all three apps on the profile page.

## How it works

```
┌──────────────────────────── Phone / browser (PWA) ────────────────────────────┐
│  Screens ──read/write──> local database (IndexedDB), one per app and account   │
│                               │                                                │
│                     sync in the background, per app                            │
└───────────────────────────────┼────────────────────────────────────────────────┘
                                │ HTTPS  /api/v1/...
┌───────────────────────────────▼────────────── FastAPI ─────────────────────────┐
│  /auth   /money   /food   /plate   /sync/money   /sync/food   /sync/plate      │
│  Sign-in, access rules and business rules (splits, kitchens) live here.        │
└───────────────────────────────┼────────────────────────────────────────────────┘
                                │ SQLAlchemy
                          PostgreSQL (Supabase)
```

- **Local first.** Each app keeps its own local database per Google account (`exptracker-…` for My Money,
  `myfood-…`, `myplate-…`). Screens read only from it, so nothing waits for the network.
- **Each app syncs on its own.** A slow or failed sync in one app never holds up the others.
  - My Money and My Food push changed records and pull what changed since the last sync. Every record has an
    id made on the phone and a version number; the higher version wins.
  - MyPlate queues each change and sends them in order to the `/plate` routes, so the server's rules always
    apply. It then pulls what changed in your kitchens since the last sync. If the server refuses a change,
    the phone undoes it and the profile says so.
- **Some things need a connection:** group money, AI analysis, and MyPlate's kitchens, invites,
  going live and recipe import.
- **Live updates.** In shared kitchens, other people's ticks, cart changes and "shopping now" arrive within about
  15 seconds; otherwise MyPlate refreshes every minute, on open, and when you come back to the app. The live layer
  is kept separate so it can become part of a paid plan later.
- **Access.** Roles (member, admin, owner) decide which apps someone can open; the server enforces it.
- **Privacy.** The server stores your Google id and email, never your name or photo. Other members of a group or
  kitchen only see your first name.
- Money is stored as whole minor units (paise).

### API versions

All routes live under `/api/v1`. To make a breaking change, add `v2` in `back-end/app/versions.py`. Build it from
v1's routers, replacing only what changes, and serve both versions until installed apps have updated. Then point the
front-end at it (`API_VERSION` in `front-end/src/auth/api.ts`). New routes and new optional fields stay in the
current version.

## Repository layout

```
front-end/            React + TypeScript + Vite PWA
  src/db, src/food/db.ts, src/plate/store.ts   local databases
  src/sync            sync engine and the per-app sync runners
  src/plate           MyPlate (local-first API, sync, sheets)
  src/pages           screens
back-end/             FastAPI
  app/versions.py     API versions
  app/routers_*.py    routes per app; app/sync.py for money/food sync
  migrations/         Alembic database migrations
  tests/              pytest
```

**Tech:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, Dexie (IndexedDB), vite-plugin-pwa ·
FastAPI, SQLAlchemy 2, Alembic, PostgreSQL · Playwright and Vitest for front-end tests, pytest for the back-end.

## Run it locally

You need **Node.js 20.19+**, **Python 3.12+** with [uv](https://docs.astral.sh/uv/), a PostgreSQL database
(Supabase works) and a **Google OAuth Web client ID** (Google Cloud Console → Credentials → OAuth client ID →
Web application; add `http://localhost:5173` under Authorized JavaScript origins).

```bash
# back-end
cd back-end
cp .env.example .env              # fill in your own values
uv sync
uv run alembic upgrade head       # create or update the tables
uv run uvicorn app.main:app --reload --port 8000

# front-end (second terminal)
cd front-end
cp .env.example .env              # set VITE_GOOGLE_CLIENT_ID
npm install
npm run dev                       # http://localhost:5173
```

API docs: http://localhost:8000/docs · health check: http://localhost:8000/health

## Configuration

Secrets go only in `back-end/.env` (git-ignored) or your host's environment settings. Never commit them, and never
put them in `front-end/.env`: everything there ends up in the browser.

| Variable | Where | Secret | What it is |
|---|---|---|---|
| `DATABASE_URL` | back-end | **yes** | `postgresql+psycopg://USER:PASSWORD@HOST:5432/postgres` |
| `GOOGLE_CLIENT_ID` | back-end | no | Your Google OAuth client ID |
| `CORS_ORIGINS` | back-end | no | JSON list of front-end origins, e.g. `["http://localhost:5173"]` |
| `APP_URL` | back-end | no | The front-end's address, used in invite emails |
| `EXPENSE_AI_PROVIDER`, `EXPENSE_AI_MODEL` | back-end | no | AI used for bill and food photos (default `deepseek`) |
| `DEEPSEEK_API_KEY` / `NVIDIA_API_KEY` | back-end | **yes** | Key for the chosen AI provider |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | back-end | password | Optional invite emails |
| `MAX_IMAGE_UPLOAD_MB` | back-end | no | Largest photo upload accepted (default 5) |
| `VITE_GOOGLE_CLIENT_ID` | front-end | no (public) | Same Google client ID |
| `VITE_API_URL` | front-end | no | API root without the version, e.g. `http://localhost:8000/api` or `/api` |

AI requests and responses, including photos, are stored in `ai_call_logs` for auditing, so restrict database access
and set a retention policy.

## Deploy (Vercel)

`vercel.json` deploys `front-end/` and `back-end/` as two services in one project, with `/api/*` going to the
API. Set the variables above in **Project Settings → Environment Variables**: mark the secret ones sensitive, use
`VITE_API_URL=/api` and `CORS_ORIGINS=[]` (same origin). Add the site's address to the Google client's authorized
origins. Run `uv run alembic upgrade head` against the database before deploying a new version.

## Tests

```bash
cd back-end && uv run pytest          # API and migrations

cd front-end
npm test                              # unit tests
npx playwright install chromium       # once
npm run e2e                           # app flows and offline use
npm run e2e:sync                      # full stack against a throwaway test API and SQLite database
npm run e2e:pwa                       # installable and reloads offline
```

The browser tests use fake sign-ins against a test-only server; they never touch your real database or Google.

## Troubleshooting

| Problem | Fix |
|---|---|
| Missing table or column | `uv run alembic upgrade head` |
| Can't reach Supabase | Use the **Session pooler** connection string, keeping the `postgresql+psycopg://` prefix |
| `password authentication failed` | URL-encode special characters in the password (`@` → `%40`) |
| Google button doesn't show / *origin_mismatch* | Add your front-end address to Authorized JavaScript origins and restart `npm run dev` |
| CORS errors or "Failed to fetch" | The API isn't running, `VITE_API_URL` is wrong, or your address is missing from `CORS_ORIGINS` |
| Changes don't show after a production build | The service worker caches the app; reload twice |
| Another account's data is missing | Each Google account has its own local data; sign in with that account |

## Later

- `TODO(after-v1)`: phones installed before 1.0 kept My Food inside My Money's local database. It moves out on
  first open; drop the old tables (`front-end/src/db/db.ts`) once no pre-1.0 installs remain.
- `TODO(plan-tier)`: gate MyPlate's live layer (`hasLiveLayer` in `front-end/src/plate/hooks.ts`) by plan.
- MyPlate's prep reminder time is saved, but no notification is sent yet.
