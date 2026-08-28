PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
);

CREATE TABLE IF NOT EXISTS scores (
  player_id TEXT NOT NULL,
  letter TEXT NOT NULL,
  value REAL NOT NULL CHECK (value >= 0),
  updated_at INTEGER NOT NULL,
  best_rank INTEGER,
  PRIMARY KEY (player_id, letter),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS score_claims (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  letter TEXT NOT NULL,
  value REAL NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  player_id TEXT NOT NULL,
  letter TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, letter),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet (
  player_id TEXT PRIMARY KEY,
  earned INTEGER NOT NULL DEFAULT 0 CHECK (earned >= 0),
  spent INTEGER NOT NULL DEFAULT 0 CHECK (spent >= 0),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 0),
  created_at INTEGER NOT NULL,
  UNIQUE (x, y, level),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS marks_level_idx ON marks(level);
CREATE INDEX IF NOT EXISTS marks_player_created_idx ON marks(player_id, created_at);
CREATE INDEX IF NOT EXISTS players_ip_created_idx ON players(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS scores_letter_value_idx ON scores(letter, value DESC, updated_at ASC);

CREATE TABLE IF NOT EXISTS canvas (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 2),
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO canvas (id, level, updated_at) VALUES (1, 0, unixepoch() * 1000);
