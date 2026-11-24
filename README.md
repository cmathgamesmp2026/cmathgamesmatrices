# Matrices Snakes & Ladders (Cloudflare Pages + D1 Edition)

A web-based Snake and Ladders game where the player answers AI-generated Computing Mathematics (Matrices) questions to move. Built with **Vite + Phaser 3** on the frontend, **Cloudflare Pages Functions** for the API backend, **Cloudflare D1 (SQLite)** for storage, and **Google Gemini** with exact-fraction verification and a persistent question pool.

---

## Project Structure

```text
├── db/
│   └── schema.sql                 # D1 SQLite schema (matrices_snl, question_pool, game_seen, model_state, locks)
├── functions/
│   └── api/
│       ├── health.js              # GET /api/health
│       ├── leaderboard.js         # GET & POST /api/leaderboard
│       ├── pool-status.js         # GET /api/pool-status
│       └── question/
│           ├── start.js           # POST /api/question/start
│           └── index.js           # POST /api/question
├── shared/                        # Pure web-standard ES modules (Workers + Node compatible)
│   ├── config.js                  # Env var & model list parsing
│   ├── d1Pool.js                  # D1 prepared statement helpers for pool, game_seen & locks
│   ├── gemini.js                  # Gemini REST API client (fetch + AbortController), fallback & batching
│   ├── http.js                    # JSON response & body helpers
│   ├── mathVerify.js              # Exact fraction & matrix arithmetic verification guard
│   ├── modelState.js              # D1 & in-memory model fallback state tracker
│   ├── signature.js               # Web Crypto SHA-256 hex signature
│   ├── staticFallback.js          # Emergency verified fallback lessons (off by default)
│   ├── time.js                    # HH:MM:SS / MM:SS formatting & save-result validation
│   └── topics.js                  # Syllabus topics & deterministic per-game topic order
├── scripts/                       # Local Node.js CLI scripts (NOT deployed to Cloudflare)
│   ├── d1HttpClient.js            # Cloudflare D1 HTTP API client (parameterized queries)
│   ├── seedPool.js                # npm run seed-pool
│   └── migrateMysqlToD1.js        # npm run migrate-mysql-to-d1 [-- --with-leaderboard]
├── src/                           # Vite + Phaser 3 frontend (calls relative /api/* paths)
├── test/                          # Node built-in unit tests (`npm test`)
├── wrangler.toml                  # Cloudflare Pages & D1 configuration
├── .dev.vars.example              # Local Wrangler secret template
├── .env.example                   # Local CLI script template (seed-pool)
└── .env.migrate.example           # One-time MySQL -> D1 migration template
```

---

## Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Local Secrets (`.dev.vars`)
Copy `.dev.vars.example` to `.dev.vars` (gitignored) and add your Gemini API key:
```bash
cp .dev.vars.example .dev.vars
```
```ini
GEMINI_API_KEY=your_real_gemini_api_key_here
```
> **Security Note:** Never prefix `GEMINI_API_KEY` with `VITE_` and never commit `.dev.vars`, `.env`, or `.env.migrate`.

### 3. Initialize the Local D1 Database
Apply `db/schema.sql` to your local Wrangler D1 instance:
```bash
npm run db:local
```

### 4. Start the Local Dev Server
Run Vite and Cloudflare Pages Functions together with local D1 and `.dev.vars`:
```bash
npm run dev
```

### 5. Run Unit Tests & Production Build
```bash
npm test
npm run build
```

---

## Deployment to Cloudflare Pages

### Step 1: Create the D1 Database
Authenticate Wrangler (`npx wrangler login`), then create the D1 database:
```bash
npx wrangler d1 create matrices-snl-db
```
Copy the `database_id` printed by Wrangler.

### Step 2: Put `database_id` in `wrangler.toml`
Open `wrangler.toml` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with your real `database_id`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "matrices-snl-db"
database_id = "<your-real-database-id>"
```

### Step 3: Apply `db/schema.sql` to the Remote D1 Database
```bash
npm run db:remote
```

### Step 4: Set Secrets & Environment Variables
Set `GEMINI_API_KEY` as a **Secret** (never a plain variable or `VITE_` variable):
```bash
npx wrangler pages secret put GEMINI_API_KEY --project-name=matrices-snl
```
(Or add it in **Cloudflare Dashboard → Workers & Pages → matrices-snl → Settings → Variables and Secrets**.)

Non-secret variables (`GEMINI_MODELS`, `GEMINI_MODEL`, `GEMINI_MIN_GAP_MS`, `BATCH_SIZE`, `POOL_MIN_PER_TOPIC`, `POOL_TARGET_PER_TOPIC`) are configured with defaults in `wrangler.toml` and can also be overridden in the Cloudflare Pages dashboard.

### Step 5: Bind D1 as `DB`
If deploying via the Cloudflare Dashboard (Git integration), go to **Settings → Bindings → Add → D1 database**:
- **Variable name:** `DB`
- **D1 database:** `matrices-snl-db`

(When deploying directly with `wrangler pages deploy`, `wrangler.toml` configures the `DB` binding automatically.)

### Step 6: Deploy
**Option A — Direct CLI deploy:**
```bash
npm run build
npm run deploy
```

**Option B — Connect your Git repository in Cloudflare Pages:**
- **Build command:** `npm run build`
- **Build output directory:** `dist`

### Step 7: Populate the Remote D1 Question Pool

#### Option A — Migrate Existing MySQL Pool (One-Time, Saves Gemini Quota)
1. Copy `.env.migrate.example` to `.env.migrate` and fill in your old local MySQL credentials plus your Cloudflare `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` (a token with **D1: Edit** permission).
2. Run:
   ```bash
   # Copy question_pool only (INSERT OR IGNORE — safe to re-run):
   npm run migrate-mysql-to-d1

   # Also copy matrices_snl leaderboard rows (converts time_taken to HH:MM:SS):
   npm run migrate-mysql-to-d1 -- --with-leaderboard
   ```

#### Option B — Seed Directly with Gemini
1. Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN`.
2. Run:
   ```bash
   npm run seed-pool
   ```
   The script stops cleanly if all configured Gemini models hit their daily quota and can be re-run later to top up remaining topics.
