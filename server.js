import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import db, {
  upsertChat, listChats, getChat, saveChat,
  setNextRun, getDueAutos, setBan, isBannedQ, delExpiredBans
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';
const PORT = parseInt(process.env.PORT || '8080', 10);

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN belum diisi di .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ===== Helper =====
const isAdmin = async (ctx, userId) => {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ['creator','administrator'].includes(member.status);
  } catch { return false; }
};

const hasLink = (text) => {
  if (!text) return false;
  const re = /(https?:\/\/|t\.me\/|www\.|\.com\b|\.net\b|\.org\b|\.id\b|bit\.ly)/i;
  return re.test(text);
};

const scheduleMap = new Map(); // chat_id -> NodeJS.Timeout

function resetSchedule(chat) {
  const id = chat.chat_id;
  if (scheduleMap.has(id)) {
    clearInterval(scheduleMap.get(id));
    scheduleMap.delete(id);
  }
  if (chat.auto_enabled && chat.auto_interval_min > 0) {
    const ms = chat.auto_interval_min * 60 * 1000;
    const timer = setInterval(() => runAutoFor(id).catch(console.error), ms);
    scheduleMap.set(id, timer);
    setNextRun.run(Date.now() + ms, id);
  }
}

async function runAutoFor(chatId) {
  const row = getChat.get(chatId);
  if (!row || !row.auto_enabled) return;

  const caption = row.auto_text || '';
  try {
    if (row.auto_media_type === 'photo' && row.auto_media_path) {
      await bot.telegram.sendPhoto(chatId, { source: path.join(__dirname, 'public', row.auto_media_path) }, { caption, parse_mode: 'HTML' });
    } else if (row.auto_media_type === 'video' && row.auto_media_path) {
      await bot.telegram.sendVideo(chatId, { source: path.join(__dirname, 'public', row.auto_media_path) }, { caption, parse_mode: 'HTML' });
    } else {
      await bot.telegram.sendMessage(chatId, caption, { parse_mode: 'HTML' });
    }
  } catch (e) {
    console.error('Auto send error', chatId, e.message);
  } finally {
    if (row.auto_interval_min > 0) {
      const nextAt = Date.now() + row.auto_interval_min * 60 * 1000;
      setNextRun.run(nextAt, chatId);
    }
  }
}

// ====== BOT EVENTS ======

// daftar chat ke DB saat bot diinvite / ada pesan pertama
bot.on('message', async (ctx, next) => {
  const chat = ctx.chat;
  if (!chat) return next();
  upsertChat.run({ chat_id: chat.id, title: chat.title || chat.username || chat.first_name || '', type: chat.type });
  // auto-schedule ensure
  const cfg = getChat.get(chat.id);
  resetSchedule(cfg);

  // Cegah user banned mengirim pesan
  if (ctx.from && ctx.from.id) {
    const ban = isBannedQ.get(chat.id, ctx.from.id);
    const now = Date.now();
    if (ban && ban.until && ban.until > now) {
      // delete pesan dan abaikan
      try { if (ctx.message && ctx.message.message_id) await ctx.deleteMessage(); } catch {}
      return; // jangan next()
    }
  }

  // Anti-link (non-admin)
  if (cfg?.anti_link && chat.type !== 'private') {
    const text = ctx.message?.text || ctx.message?.caption || '';
    if (hasLink(text)) {
      const admin = await isAdmin(ctx, ctx.from.id);
      if (!admin) {
        try { await ctx.deleteMessage(); } catch {}
        try { await ctx.replyWithHTML(`🚫 <b>Link tidak diperbolehkan.</b>`); } catch {}
        return;
      }
    }
  }

  return next();
});

// Sambutan member baru: dengan tombol + auto delete + dukung URL
bot.on('new_chat_members', async (ctx) => {
  const cfg = getChat.get(ctx.chat.id);
  if (!cfg || !cfg.welcome_enabled) return;

  const names = ctx.message.new_chat_members
    .map(u => u.first_name || u.username || 'member')
    .join(', ');
  const text = (cfg.welcome_text || 'Selamat datang, @name!')
    .replace(/@name/gi, names);

  try {
    const keyboard = [];
    if (cfg.welcome_button_text && cfg.welcome_button_url) {
      keyboard.push([{ text: cfg.welcome_button_text, url: cfg.welcome_button_url }]);
    }

    let sentMsg;

    // === PILIH PRIORITAS MEDIA ===
    if (cfg.welcome_media_url) {
      // kirim dari URL eksternal
      if (cfg.welcome_media_type === 'video' || cfg.welcome_media_url.endsWith('.mp4')) {
        sentMsg = await ctx.replyWithVideo(cfg.welcome_media_url, {
          caption: text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        sentMsg = await ctx.replyWithPhoto(cfg.welcome_media_url, {
          caption: text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        });
      }
    } else if (cfg.welcome_media_type === 'photo' && cfg.welcome_media_path) {
      sentMsg = await ctx.replyWithPhoto(
        { source: path.join(__dirname, 'public', cfg.welcome_media_path) },
        { caption: text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
      );
    } else if (cfg.welcome_media_type === 'video' && cfg.welcome_media_path) {
      sentMsg = await ctx.replyWithVideo(
        { source: path.join(__dirname, 'public', cfg.welcome_media_path) },
        { caption: text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
      );
    } else {
      sentMsg = await ctx.replyWithHTML(text, {
        reply_markup: { inline_keyboard: keyboard },
      });
    }

    // 🔥 Hapus otomatis setelah 5 menit
    if (sentMsg && sentMsg.message_id) {
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(sentMsg.message_id);
        } catch (err) {
          console.warn('Gagal hapus pesan sambutan:', err.message);
        }
      }, 5 * 60 * 1000);
    }

  } catch (e) {
    console.error('Welcome send error', e.message);
  }
});

// Perintah admin: /ban @user   -> mute 7 hari
bot.command('ban', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply('Hanya admin.');

  // target bisa via reply atau mention
  let targetId;
  if (ctx.message?.reply_to_message?.from?.id) {
    targetId = ctx.message.reply_to_message.from.id;
  } else if (ctx.message?.entities) {
    // cari mention user (username) — Telegram tidak selalu memberi id, jadi sarankan via reply
  }
  if (!targetId) return ctx.reply('Balas pesan pengguna yang ingin di-mute 7 hari dengan /ban');

  const untilDate = Math.floor((Date.now() + 7*24*60*60*1000)/1000); // detik
  try {
    await ctx.restrictChatMember(targetId, {
      permissions: { can_send_messages: false },
      until_date: untilDate
    });
    setBan.run(ctx.chat.id, targetId, Date.now()+7*24*60*60*1000);
    ctx.reply('✅ Pengguna di-mute selama 7 hari (bukan di-kick).');
  } catch (e) {
    ctx.reply('Gagal membatasi user: ' + e.message);
  }
});

// /unban via reply untuk cabut mute
bot.command('unban', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply('Hanya admin.');

  let targetId = ctx.message?.reply_to_message?.from?.id;
  if (!targetId) return ctx.reply('Balas pesan pengguna yang ingin di-unmute dengan /unban');

  try {
    await ctx.restrictChatMember(targetId, {
      permissions: {
        can_send_messages: true, can_send_audios: true, can_send_documents: true,
        can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
        can_send_voice_notes: true
      },
      until_date: 0
    });
    setBan.run(ctx.chat.id, targetId, Date.now()-1);
    ctx.reply('✅ Mute dicabut.');
  } catch (e) {
    ctx.reply('Gagal unmute: ' + e.message);
  }
});

// ====== EXPRESS ADMIN ======
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads')),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/[^\w.\-]/g, '_');
    cb(null, safe);
  }
});
const upload = multer({ storage });

// Guard very simple
app.use((req, res, next) => {
  const token = req.query.token || req.headers['x-admin-token'];
  if (req.path.startsWith('/public') || req.path === '/health') return next();
  if (token !== ADMIN_TOKEN) return res.status(401).send('Unauthorized (append ?token=...)');
  res.locals.token = token;
  next();
});

app.get('/', (req, res) => {
  const chats = listChats.all();
  res.render('index', { chats, token: res.locals.token });
});

app.get('/edit/:chatId', (req, res) => {
  const chat = getChat.get(req.params.chatId);
  if (!chat) return res.status(404).send('Chat tidak ditemukan. Kirimi pesan di grup agar bot mendaftar.');
  res.render('edit', { chat, token: res.locals.token });
});

app.post('/edit/:chatId', upload.fields([
  { name: 'welcome_photo', maxCount: 1 },
  { name: 'welcome_video', maxCount: 1 },
  { name: 'auto_photo', maxCount: 1 },
  { name: 'auto_video', maxCount: 1 },
]), (req, res) => {
  const chatId = Number(req.params.chatId);
  const chat = getChat.get(chatId);
  if (!chat) return res.status(404).send('Chat tidak ditemukan.');

  const body = req.body;
const upd = {
  chat_id: chatId,
  anti_link: body.anti_link === '1' ? 1 : 0,
  welcome_enabled: body.welcome_enabled === '1' ? 1 : 0,
  welcome_text: body.welcome_text || null,
  welcome_media_type: chat.welcome_media_type,
  welcome_media_path: chat.welcome_media_path,
  welcome_media_url: body.welcome_media_url || null,          // 🔥 new
  welcome_button_text: body.welcome_button_text || null,      // 🔥 new
  welcome_button_url: body.welcome_button_url || null,        // 🔥 new
  auto_enabled: body.auto_enabled === '1' ? 1 : 0,
  auto_text: body.auto_text || null,
  auto_media_type: chat.auto_media_type,
  auto_media_path: chat.auto_media_path,
  auto_media_url: body.auto_media_url || null,                // 🔥 for future auto-send
  auto_interval_min: Math.max(1, parseInt(body.auto_interval_min || '60', 10))
};

  // handle uploads (prioritas video > foto jika keduanya diisi)
  if (req.files?.welcome_video?.[0]) {
    upd.welcome_media_type = 'video';
    upd.welcome_media_path = path.join('uploads', req.files.welcome_video[0].filename);
  } else if (req.files?.welcome_photo?.[0]) {
    upd.welcome_media_type = 'photo';
    upd.welcome_media_path = path.join('uploads', req.files.welcome_photo[0].filename);
  }

  if (req.files?.auto_video?.[0]) {
    upd.auto_media_type = 'video';
    upd.auto_media_path = path.join('uploads', req.files.auto_video[0].filename);
  } else if (req.files?.auto_photo?.[0]) {
    upd.auto_media_type = 'photo';
    upd.auto_media_path = path.join('uploads', req.files.auto_photo[0].filename);
  }

  saveChat.run(upd);
  const fresh = getChat.get(chatId);
  resetSchedule(fresh);

  res.redirect(`/edit/${chatId}?token=${res.locals.token}`);
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ====== CRON house-keeping (expired bans & due autos safety) ======
cron.schedule('*/1 * * * *', async () => {
  try {
    delExpiredBans.run(Date.now());
    const due = getDueAutos.all(Date.now());
    for (const row of due) {
      await runAutoFor(row.chat_id);
    }
  } catch (e) {
    console.error('cron', e);
  }
});

// ====== START ======
app.listen(PORT, () => {
  console.log('Admin panel on http://localhost:' + PORT + `/?token=${ADMIN_TOKEN}`);
});
bot.launch().then(() => console.log('Bot started (long polling).'));

// graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
