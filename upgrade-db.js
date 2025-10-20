import Database from 'better-sqlite3';

const db = new Database('bot.db');

// daftar kolom baru yang harus ada
const newColumns = [
  ["welcome_media_url", "TEXT"],
  ["welcome_button_text", "TEXT"],
  ["welcome_button_url", "TEXT"],
  ["auto_media_url", "TEXT"]
];

for (const [col, type] of newColumns) {
  try {
    const exists = db.prepare(`PRAGMA table_info(chats);`).all().some(r => r.name === col);
    if (!exists) {
      console.log(`🧩 Menambahkan kolom ${col}...`);
      db.prepare(`ALTER TABLE chats ADD COLUMN ${col} ${type};`).run();
    } else {
      console.log(`✅ Kolom ${col} sudah ada, skip.`);
    }
  } catch (err) {
    console.error(`Gagal menambah kolom ${col}:`, err.message);
  }
}

console.log('🎉 Upgrade selesai.');
