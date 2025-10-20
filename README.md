# Telegram Group Manager Bot (LMCX)

Bot Telegram ini berfungsi untuk **mengelola grup otomatis** — dilengkapi dengan:
- Anti-link (hapus pesan non-admin yang mengandung link)
- Sapaan otomatis untuk member baru (dengan teks, media, tombol, dan auto-delete)
- Broadcast otomatis tiap beberapa menit (auto post teks, gambar, atau video)
- Panel admin berbasis web untuk konfigurasi semua pengaturan
- Dukungan upload media **atau** langsung via URL CDN
- Fitur ban/unban (mute user 7 hari atau cabut mute)
- Terintegrasi dengan SQLite untuk penyimpanan lokal

---

## Fitur Utama

| Fitur | Deskripsi |
|-------|------------|
| 🧱 Anti Link | Otomatis hapus pesan yang mengandung tautan dari non-admin |
| 👋 Sapaan Otomatis | Kirim sambutan ke member baru (bisa teks, gambar, atau video) |
| 🧹 Auto Delete | Pesan sambutan dihapus otomatis setelah 5 menit |
| 🖼️ Media URL | Bisa kirim media (foto/video) dari **URL eksternal (CDN)** tanpa upload |
| 🔁 Auto Broadcast | Kirim pesan otomatis setiap X menit (teks + media opsional) |
| 🔘 Tombol CTA | Tambahkan tombol link di bawah pesan sambutan atau broadcast |
| 🛠️ Admin Panel | Dashboard web untuk ubah pengaturan tiap grup |
| 🧩 SQLite Local DB | Menyimpan konfigurasi grup dan jadwal auto-broadcast |
| ⏰ Cron Internal | Menjalankan jadwal auto-post tanpa cronjob server eksternal |
| 🔒 Ban / Unban | Mute sementara pengguna di grup dengan perintah /ban & /unban |

---

## ⚙️ Persiapan & Instalasi

### 1. Clone repository
```bash
git clone https://github.com/USERNAME/bot-telegram-lmcx.git
cd bot-telegram-lmcx```
### 2. Install dependencies
```bash
npm install```
### 3. Lakukan Konfigurasi Di .env
```.env
BOT_TOKEN=1234567890:YOUR_TELEGRAM_BOT_TOKEN
ADMIN_TOKEN=supers3cret
PORT=8080```
### 4. Menjalankan Bot
```bash
pm2 start server.js --name lmcx-bot```
### 5. Berhasil
```dashboard admin
http://YOUR_SERVER_IP:8080/?token=TOKEN_SESUAI_ENV```
