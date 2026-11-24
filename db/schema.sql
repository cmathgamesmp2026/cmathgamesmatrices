CREATE TABLE IF NOT EXISTS matrices_snl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  turns_taken INTEGER NOT NULL,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  wrong_answers INTEGER NOT NULL DEFAULT 0,
  time_taken TEXT NOT NULL,                 -- 'HH:MM:SS', zero-padded so it sorts correctly
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic INTEGER NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','hard')),
  payload TEXT NOT NULL,                    -- JSON string (JSON.stringify / JSON.parse)
  signature TEXT NOT NULL UNIQUE,           -- SHA-256 hex
  context TEXT,
  times_served INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pool_topic_difficulty ON question_pool (topic, difficulty);

CREATE TABLE IF NOT EXISTS game_seen (       -- replaces the in-memory per-game seen sets
  game_id TEXT NOT NULL,
  pool_id INTEGER NOT NULL,
  signature TEXT NOT NULL,
  context TEXT,
  created_at INTEGER NOT NULL,              -- unix seconds
  PRIMARY KEY (game_id, pool_id)
);

CREATE TABLE IF NOT EXISTS model_state (     -- replaces the in-memory model fallback state
  model TEXT PRIMARY KEY,
  state TEXT NOT NULL,                      -- ready, exhausted, cooling, unavailable
  until INTEGER,                            -- unix seconds
  last_error TEXT,
  avg_ms REAL
);

CREATE TABLE IF NOT EXISTS locks (           -- one background generation at a time
  name TEXT PRIMARY KEY,
  until INTEGER NOT NULL
);
