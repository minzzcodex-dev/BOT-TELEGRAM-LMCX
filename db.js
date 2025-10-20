import Database from 'better-sqlite3';

const db = new Database('bot.db');

// Buat tabel chats
db.exec(`
CREATE TABLE IF NOT EXISTS chats (
  chat_id INTEGER PRIMARY KEY,
  title TEXT,
  type TEXT, -- "group"|"supergroup"|"channel"
  anti_link INTEGER DEFAULT 1,
  welcome_enabled INTEGER DEFAULT 1,
  welcome_text TEXT,
  welcome_media_type TEXT,     -- "photo"|"video"|NULL
  welcome_media_path TEXT,     -- path file lokal
  welcome_media_url TEXT,      -- 🔥 NEW: url remote
  welcome_button_text TEXT,    -- 🔥 NEW: teks tombol
  welcome_button_url TEXT,     -- 🔥 NEW: link tombol
  auto_enabled INTEGER DEFAULT 0,
  auto_text TEXT,
  auto_media_type TEXT,
  auto_media_path TEXT,
  auto_media_url TEXT,         -- 🔥 NEW: url remote untuk auto
  auto_interval_min INTEGER DEFAULT 60,
  next_run_at INTEGER
);
`);

// Buat tabel bans
db.exec(`
CREATE TABLE IF NOT EXISTS bans (
  chat_id INTEGER,
  user_id INTEGER,
  until INTEGER,
  PRIMARY KEY(chat_id, user_id)
);
`);

// ================= PREPARED STATEMENTS =================

export const upsertChat = db.prepare(`
INSERT INTO chats (chat_id, title, type)
VALUES (@chat_id, @title, @type)
ON CONFLICT(chat_id) DO UPDATE SET
  title=excluded.title,
  type=excluded.type
`);

export const getChat = db.prepare(`SELECT * FROM chats WHERE chat_id=?`);
export const listChats = db.prepare(`SELECT * FROM chats ORDER BY title COLLATE NOCASE`);

export const saveChat = db.prepare(`
UPDATE chats SET
  anti_link=@anti_link,
  welcome_enabled=@welcome_enabled,
  welcome_text=@welcome_text,
  welcome_media_type=@welcome_media_type,
  welcome_media_path=@welcome_media_path,
  welcome_media_url=@welcome_media_url,
  welcome_button_text=@welcome_button_text,
  welcome_button_url=@welcome_button_url,
  auto_enabled=@auto_enabled,
  auto_text=@auto_text,
  auto_media_type=@auto_media_type,
  auto_media_path=@auto_media_path,
  auto_media_url=@auto_media_url,
  auto_interval_min=@auto_interval_min
WHERE chat_id=@chat_id
`);

export const setNextRun = db.prepare(`UPDATE chats SET next_run_at=? WHERE chat_id=?`);
export const getDueAutos = db.prepare(`
SELECT * FROM chats
WHERE auto_enabled=1 AND auto_interval_min>0
  AND (next_run_at IS NULL OR next_run_at<=?)
`);

export const setBan = db.prepare(`
INSERT INTO bans (chat_id,user_id,until)
VALUES (?,?,?)
ON CONFLICT(chat_id,user_id)
DO UPDATE SET until=excluded.until
`);

export const isBannedQ = db.prepare(`SELECT until FROM bans WHERE chat_id=? AND user_id=?`);
export const delExpiredBans = db.prepare(`DELETE FROM bans WHERE until < ?`);

export default db;
