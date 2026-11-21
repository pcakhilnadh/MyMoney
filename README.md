# MyTracker

A personal tracker you install on your phone, with three apps in one:

- **My Money**: expenses, income, transfers, accounts, budgets and shared group expenses.
- **My Food**: a food diary with a daily calorie goal and insights.
- **MyPlate**: meal planning with the people you cook for.

Version **1.1.0** · API **v1**

## Core features

**My Money**
- Add expenses, income, refunds and transfers; search or create categories as you go.
- Payment accounts (cash, bank, cards, loans) with balances, due dates and a default account.
- Monthly budgets by category, spending insights and a ledger.
- Groups: split expenses with others, see who owes whom, and settle up. Invite people by email, or share
  a 6-character join code.
- Snap a bill and let AI fill in the transaction for you to review.

**My Food**
- Log meals from a shared food catalogue, or snap a photo and let AI find the foods.
- A daily calorie goal, a diary by date, and insights such as averages and streaks.

**MyPlate**
- **Kitchens**: My Kitchen is just for you; shared kitchens are for a partner, family or flatmates. Invite
  people by email, or share a 6-character join code.
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


## Repository layout

```
front-end/            React + TypeScript + Vite PWA
  src/db, src/food/db.ts, src/plate/store.ts   local databases
  src/sync            sync engine and the per-app sync runners
  src/plate           MyPlate (local-first API, sync, sheets)
  src/pages           screens
back-end/             FastAPI
  app/versions.py     API versions
  app/memberships.py  joining a group or kitchen: email invites and join codes
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
cp .env.example .env              # set your Google client ID
npm install
npm run dev                       # http://localhost:5173
```

API docs: http://localhost:8000/docs · health check: http://localhost:8000/health

## Configuration

Secrets go only in `back-end/.env` (git-ignored) or your host's environment settings. Never commit them, and never
put them in `front-end/.env`: everything there ends up in the browser. The values below are placeholders.

| Key | Where | Secret | Example (placeholder) | What it is |
|---|---|---|---|---|
| `DATABASE_URL` | back-end | **yes** | `postgresql+psycopg://<user>:<password>@<host>:5432/<db>` | PostgreSQL connection |
| `GOOGLE_CLIENT_ID` | back-end | no | `<google-client-id>` | Google OAuth client ID |
| `CORS_ORIGINS` | back-end | no | `["<front-end-origin>"]` | Front-end origins allowed to call the API |
| `APP_URL` | back-end | no | `<front-end-origin>` | The front-end's address |
| `EXPENSE_AI_PROVIDER` | back-end | no | `<provider>` | AI provider for bill and food photos |
| `EXPENSE_AI_MODEL` | back-end | no | `<model-name>` | AI model (must accept images) |
| `DEEPSEEK_API_KEY` | back-end | **yes** | `<deepseek-key>` | Key for the DeepSeek provider |
| `NVIDIA_API_KEY` | back-end | **yes** | `<nvidia-key>` | Key for the NVIDIA provider |
| `NVIDIA_BASE_URL` | back-end | no | `<nvidia-endpoint>` | NVIDIA endpoint |
| `VITE_GOOGLE_CLIENT_ID` | front-end | no (public) | `<google-client-id>` | Same Google client ID |
| `VITE_API_URL` | front-end | no | `<api-origin>/api` | API root, without the version |

AI requests and responses, including photos, are kept on the server for auditing, so restrict database access and
set a retention policy.

## Deploy (Vercel)

`vercel.json` deploys `front-end/` and `back-end/` as two services in one project, with `/api/*` going to the
API. Set the keys from **Configuration** in **Project Settings → Environment Variables** and mark the secret ones
sensitive. Front-end and API share one origin there, so the API root is just `/api` and no extra CORS origin is
needed. Add the site's address to the Google client's authorized origins. Run `uv run alembic upgrade head`
against the database before deploying a new version.

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


## Changelog

### 1.1.0 (2026-11-21)

- **One back button across the apps:** every screen's back button now goes to the screen you
  actually came from and names it ("Transactions", "Account", "Kitchens"…). Coming back lands on
  the row, card or link you opened, in the same place on screen, with a brief highlight. The
  ledger keeps its month and filter. A screen opened directly (a shared link, a new tab) goes back
  to its usual parent.
- New screens open at the top instead of keeping the previous screen's scroll.

### 1.0.2 (2026-11-22)

- **Budgets card (My Money home):** shows the month's top five categories by spend, most first,
  whether or not they have a budget. Categories without one get their own "Set budget"; before,
  only the first of them was shown.

### 1.0.1 (2026-11-22)

- **Ledger:** going back from a transaction returns to the month you were viewing and scrolls that
  transaction back into view, instead of jumping to the top of the current month. Works with the
  back link and the device back button; the month and filter are kept in the page address.
- **Spending overview:** "Set budget" opens the budget view when no monthly budget is set; with a
  budget set, the overview opens the allocation view.

### 1.0.0 (2026-11-21)

- **My Money, My Food and MyPlate** in one installable app, signed in with Google. First initial product version is released.
