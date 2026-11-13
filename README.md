# MyTracker

An installable personal tracker for money and food, with MyHabbit screens ready to be rebuilt.
For a previously signed-in account, cached local data opens immediately, including offline. Changes are queued locally and sync to the server when the connection returns.

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
              │ HTTPS + app access token; HttpOnly refresh cookie
┌─────────────▼───────────── FastAPI (monolith) ────────────────────┐
│ verify Google sign-in → issue renewable app session               │
│ routes: /money/*, /food/*, shared /auth/* and /sync/*             │
│ authorization + split/balance rules live here (app/splits.py)     │
└─────────────┬─────────────────────────────────────────────────────┘
              │ SQLAlchemy (server-side connection string)
        Supabase PostgreSQL
```

Key ideas
- **Local-first for personal data.** Accounts, categories, budgets, personal transactions and meal logs are
  written to IndexedDB immediately and marked `pending`. The sync engine pushes them (`POST /sync/push`) and pulls
  changes (`GET /sync/pull`). Records have a client-generated UUID and a `version`; the higher version wins.
- **Groups need the internet.** Group/family expenses, splits, balances and settlements go straight to the API.
- **No Supabase Auth / RLS.** Google verifies the initial sign-in; FastAPI issues short-lived app access tokens and
  renews them using a secure, HttpOnly refresh cookie. Sessions remain active for 30 days after the last use.
- **Minimal personal data stored.** The server keeps `google_sub` and `email` per user, plus session metadata needed
  to renew sign-in. A member's Google name is saved on `group_members.display_name` only when they join a group.
- Money is stored as integer **minor units** (paise) everywhere.

## MyFood log

The Food + button opens a food search against the shared `food_catalog_master`, matching names and
aliases regardless of the catalogue row's `user_id`. The API returns up to 10 case-insensitive
substring matches. Only when none are found, it returns up to 10 spelling-similar name or alias
matches. Results are ordered by score descending, then by name case-insensitively for equal scores.
Fuzzy matching requires at least four word characters and a minimum score of 0.9.
Each result contains `id`, `name`, and a `score` from 0 to 1. Name substring matches score 1.0;
alias-only substring matches score 0.9. Fuzzy scores are text-similarity ratios, not probabilities
or calibrated confidence levels. Results also include the catalogue's optional per-100 g
`calories_100g`, `protein_100g`, `carbs_100g` and `fat_100g` values, which the client uses to
snapshot nutrition when a meal is saved.
Fuzzy matching currently scans the catalogue in the API and does not use vector embeddings.
For multiple foods, authenticated clients can send `POST /api/food/catalog/search-batch` with
`{"queries": ["putt", "egg"]}`. It accepts 1–10 queries, each 1–100 characters, and returns
`{"results": [{"query": "putt", "matches": [...]}, {"query": "egg", "matches": [...]}]}`.
Each query uses the same rules and up-to-10 result limit as `GET /api/food/catalog?q=...`.
Input order and duplicate queries are preserved; a whitespace-only query has an empty match list.
The batch runs synchronously, and fuzzy searches can scan the catalogue once per query.
The migration creates the catalogue table empty. Search requires
an authenticated online session. Select search results to prepare portions in expandable cards.
Authenticated users can also add a shared catalogue item with `POST /api/food/catalog`.
Required body fields are `base_food_name` (1–100 characters, not blank), `category`, and
`food_type`. Optional fields are `aliases` (comma-separated text), `description`, and
`calories_100g`, `protein_100g`, `carbs_100g`, `fat_100g`, `fiber_100g` (non-negative numbers
per 100 g). The server records the authenticated profile as `user_id` and generates the `id`.
`category` must be one of `base_food`, `dairy`, `egg`, `fish`, `fruit`, `grain`,
`ingredient`, `legume`, `meat`, `nut_seed`, `seafood`, or `vegetable`; `food_type` must be
`processed` or `raw`. These values are based on the bundled catalogue data.
The database columns remain text and are protected by `CHECK` and `NOT NULL` constraints.
The migration fails if existing rows contain null or unsupported values; inspect and resolve such
rows before running `uv run alembic upgrade head`. Back up the database before applying migrations.
Created items are searchable by all users; `user_id` identifies their contributor, not their visibility.
The optional `image` field on catalogue creation accepts `{"mime_type": "image/png", "data": "<base64>"}`;
JPEG, PNG and WebP images are validated, compressed to JPEG and stored with the catalogue item.
Apply the latest migration before using this field.

The food diary is local-first like the money app. Meal items are written to the synced
`meal_logs` IndexedDB store immediately, then pushed to the server's `user_meal_log` table
(renamed from `food_entries`) by the sync engine. Each row stores the catalogue's per-100 g
nutrition values and portion-scaled totals as snapshots, so later catalogue edits do not change
history. Values unavailable for older rows remain null. The `image` column is reserved for future
meal photos and currently stays `null`.
Opening the food screens reads IndexedDB instead of fetching the diary over HTTP, so previously
synced meals appear instantly and remain visible offline. Meal saving works offline and syncs
when the connection returns. The daily calorie goal is cached locally; setting a goal still
requires an online session and is not part of the sync queue. On Home, set one daily calorie
goal per user; the current goal is used for all dates. Meals can be saved to a chosen date and
meal category from search or scan. For volume and count portions, enter the total weight in
grams; no density or per-item weight is assumed. Missing catalogue nutrition remains unknown,
not zero. Diary shows logged dates and meal details. Insights averages completed logged days
with known calories, counts days at or below the goal, and measures streaks as consecutive dates
with any logged food (a streak remains current through the following day).

The food scanner captures or uploads one image, previews it, and sends it to
`POST /api/food/ai/food-analyse` as `{"images": [{"mime_type": "image/jpeg", "data": "<base64>"}]}`.
It uses the same configured provider and model as expense analysis and returns `{"items": [...]}`
with estimated portions and calories. Review and remove recognized foods, search the shared
catalogue, select or create matches, and confirm the draft. After searching starts, items can
only be removed from the search or confirmation steps. A single catalogue result is selected
automatically; multiple results require a choice from the six highest-scoring matches. Confirmation
starts with the estimated quantity and unit, which can be adjusted. Catalogue creation is permanent.
Scan and catalogue operations require an online session. Food photos sent for analysis, like bill photos,
are stored in AI call logs; the audit and retention precautions below apply to them too.
Mass units are g and kg; volume units are ml, litre, tsp (5 ml), tbsp (15 ml), and cup
(250 ml). Count is separate for items such as eggs or glasses; no mass or volume conversion is
assumed for a count, and mass is not converted to volume.

## Adding a transaction

Choose a transaction type, then enter its required details. Categories can be searched or created
from the category dropdown; transfers default to Self Transfer when that category is visible.
Expense transactions can be personal or shared with a group. Opening the form from a group
preselects that group.
In Settings → Payment Account, a new or edited active account can be marked as the default;
choosing another replaces it. The default is preselected for expense, income and refund only
when it is eligible for the account selector. Transfers do not use this default. Inactivating
or deleting the default leaves no default until you choose another.

The expense camera button captures or uploads up to three JPEG, PNG, or WebP images (3 MB total).
Captured photos match the camera's mirror-preview setting and are sent in the same orientation.
**Analyse with AI** sends them to the configured AI provider and suggests transaction fields.
Review the suggestions and select an account before saving; analysis does not save a transaction.
An internet connection is required. The provider has a three-minute read timeout, configured in
`back-end/app/ai/provider.py`. The browser has a separate three-minute limit, configured in
`front-end/src/components/kit/ImageCapture.tsx`; its countdown is not AI completion progress. Since
the browser's limit includes upload and server processing, it can expire before the backend's read
timeout. The server or provider may still finish processing, so wait before retrying. The server stores full AI requests (including receipt images)
and responses in `ai_call_logs` for auditing, including failures and token usage when provided.
Completed calls record elapsed time in milliseconds in `elapsed_ms`; pending and existing logs
without a calculated duration have a null value.
For transport and response-format failures, the `error` column contains JSON diagnostics such as
exception-chain types, network error codes, timeout settings, and validation error types. Raw
exception messages are excluded to avoid logging credentials or receipt data in that column.
Response-format errors include traceback locations (without source or input data); food table
format errors also include a specific reason, a fixed diagnostic message, and the row number
where applicable. Transport and response-format errors include `traceback_text`, a readable
traceback limited to 20 frames and 2,048 characters. Arbitrary exception messages are omitted.
These logs contain sensitive financial information: restrict database access, secure backups, and
establish a retention/deletion policy before deploying.

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
API: http://localhost:8000/api · interactive docs: http://localhost:8000/docs · health: `/health` (reports database connectivity; returns HTTP 503 when the database is unavailable)

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
| `back-end/.env` | `APP_URL` | No | Used in invite emails and to infer secure session-cookie settings |
| `back-end/.env` | `SESSION_COOKIE_SECURE` | No | Optional override; defaults to secure for HTTPS requests |
| `back-end/.env` | `SESSION_COOKIE_SAMESITE` | No | Defaults to `lax`; use `none` with HTTPS only for a separately hosted frontend/API |
| `back-end/.env` | `SMTP_HOST/PORT/USER/PASSWORD/FROM` | **Yes** (password) | Optional. Without them, invite emails are skipped (a "mailto" link is offered in the UI) |
| `back-end/.env` | `NVIDIA_API_KEY` | **Yes** | Required for bill analysis; never place it in the frontend or commit it |
| `back-end/.env` | `EXPENSE_AI_PROVIDER` | No | Defaults to `nvidia` |
| `back-end/.env` | `EXPENSE_AI_MODEL` | No | Defaults to `mistralai/mistral-large-4-1t-a52b`; must support image input |
| `back-end/.env` | `MAX_IMAGE_UPLOAD_MB` | No | Max total bill image size accepted (before compression); defaults to `5` |
| `front-end/.env` | `VITE_MAX_IMAGE_UPLOAD_MB` | No (public) | Frontend limit for bill images; defaults to `5`; keep in sync with the back-end value |
| `back-end/.env` | `NVIDIA_BASE_URL` | No | Defaults to NVIDIA's chat completions endpoint |
| `front-end/.env` | `VITE_GOOGLE_CLIENT_ID` | No (public) | Same client ID |
| `front-end/.env` | `VITE_API_URL` | No | Defaults to `http://localhost:8000/api`; use `/api` for same-origin deployment |

- **Real secrets live only in `back-end/.env`** (database password, SMTP password). It is git-ignored; never commit it
  or paste it in chat/tickets. Rotate the database password in Supabase (Project Settings → Database) if it is ever exposed.
- Everything in `front-end/.env` ends up in the browser bundle, so it must **never** hold a secret.
- The server never trusts browser-provided identity data: Google credentials are verified when establishing a session,
  and API requests use server-issued, expiring access tokens.

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
| `NVIDIA_API_KEY` | Your NVIDIA API key | Required for bill analysis; mark sensitive |
| `EXPENSE_AI_MODEL` | Vision-capable NVIDIA model | Optional; defaults to `mistralai/mistral-large-4-1t-a52b` |
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
| Asked to sign in again | App sessions renew automatically and stay active for 30 days after last use. Sign in again if you have not used the app for over 30 days, or explicitly signed out; local data is kept |
| Port 5173/8000 already in use | Stop the other process, or run on another port (`npm run dev -- --port 5180`, `uvicorn … --port 8010`) and update `VITE_API_URL` / `CORS_ORIGINS` |
| `npm install` fails on old Node | Upgrade to Node 20.19+ (check with `node -v`) |
| Playwright: *Executable doesn't exist* | Run `npx playwright install chromium` (Linux may also need `npx playwright install-deps`) |
| Changes not showing after a production build | The service worker caches the app. Reload twice, or DevTools → Application → Service Workers → Unregister |
| Data from another Google account missing | Each account has its own local database in the browser; sign in with the original account |
| Invite email not received | SMTP isn't configured or was rejected (check the API log). Use the **Invited · email** link on the member row instead |
