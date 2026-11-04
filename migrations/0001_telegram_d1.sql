-- RAFIQ Telegram D1 storage. Raw Telegram update payloads are never stored.
CREATE TABLE IF NOT EXISTS telegram_update_receipts (
  update_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_rate_limits (
  chat_id TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS telegram_request_sessions (
  chat_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  step TEXT NOT NULL CHECK (step IN ('service','area','schedule','notify')),
  service TEXT,
  area TEXT,
  schedule TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_requests (
  request_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  service TEXT NOT NULL,
  area TEXT NOT NULL,
  schedule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','contacted','closed','cancelled')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_requests_created_at ON telegram_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_requests_chat_id ON telegram_requests(chat_id);
CREATE TABLE IF NOT EXISTS telegram_request_notifications (
  request_id TEXT NOT NULL,
  manager_chat_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (request_id,manager_chat_id),
  FOREIGN KEY (request_id) REFERENCES telegram_requests(request_id) ON DELETE CASCADE
);
