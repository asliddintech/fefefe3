# 🎵 Telegram Musiqa Boti (Node.js & Telegraf)

Ushbu bot Telegram orqali qo'shiqlar qidirish va boshqarish uchun mo'ljallangan.

---

## 🚀 O'rnatish va Ishga tushirish yo'riqnomasi

### 1-qadam: Bot Token olish
1. Telegramda [@BotFather](https://t.me/botfather) botiga kiring.
2. `/newbot` buyrug'ini yuboring.
3. Botingiz uchun nom va username tanlang (masalan, `MyMusicBot` va `MyMusic_robot`).
4. `@BotFather` sizga **API Token** beradi (masalan: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`).

### 2-qadam: Tokenni `.env` fayliga yozish
Loyihangizdagi `.env` faylini oching va tokenni joylashtiring:
```env
BOT_TOKEN=SIZNING_TELEGRAM_BOT_TOKENINGIZ
```

### 3-qadam: Paketlarni o'rnatish
Terminal (PowerShell yoki CMD) orqali quyidagi buyruqni bajaring:
```bash
npm install
```

### 4-qadam: Botni ishga tushirish
Botni ishga tushirish uchun:
```bash
npm run bot
```
yoki to'g'ridan-to'g'ri:
```bash
node bot.js
```
*(CommonJS usulida ishlatmoqchi bo'lsangiz: `node bot.cjs`)*

---

## 🛠 Bot imkoniyatlari
- **`/start`** – Foydalanuvchi bilan salomlashish va asosiy menyu (klaviatura tugmalari).
- **`🔍 Qo'shiq qidirish`** – Qidiruv bo'limi.
- **`ℹ️ Ma'lumot`** – Bot haqida ma'lumot beruvchi xabar.
- **Qo'shiq nomini yuborish** – Yuborilgan so'rov bo'yicha qidiruv o'tkaziladi va inline tugmalar (`▶️ Tinglash`, `📥 Yuklab olish`) chiqariladi.
