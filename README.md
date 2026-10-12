# 🤖 Google Gemini AI & Voice Telegram Bot

Google Gemini sun'iy intellekti (Gemini 3.6 Flash) va ovoz sintezi (Gemini TTS) bilan integratsiya qilingan kuchli Telegram bot.

---

## ✨ Imkoniyatlari

- 🧠 **Google Gemini AI integratsiyasi:** Har qanday savollarga aqlli va to'liq javob berish (o'zbek, rus, ingliz va boshqa tillarda).
- 🎙 **Ovozli qo'shiq aytish (Voice/Audio):** Gemini sun'iy intellekti qo'shiq matnini yozadi va uni ovozli xabar (Telegram Voice) orqali kuylaydi.
- 🔊 **Ovozli eshitish (Text-to-Speech):** Istalgan javobni audio sifatida tinglash imkoniyati.
- 🔄 **Suhbat tarixi (Context memory):** Har bir chat uchun suhbat tarixini eslab qoladi va `/reset` orqali tozalash imkoniyatiga ega.
- ⚡ **Tezkor va ishonchli:** Zero-dependency arxitekturasi va DNS optimizatsiyasi tufayli darhol ulanadi va ishlaydi.

---

## 🚀 Ishga tushirish (O'rnatish)

### 1. Repozitoriyani yuklab olish:
```bash
git clone https://github.com/asliddintech/fefefe3.git
cd fefefe3
```

### 2. Sozlamalar (`.env` fayli):
`.env.example` faylidan nusxa olib `.env` yarating:
```env
BOT_TOKEN=SIZNING_TELEGRAM_BOT_TOKENINGIZ
GEMINI_API_KEY=SIZNING_GEMINI_API_KEYINGIZ
```
- **BOT_TOKEN:** [@BotFather](https://t.me/BotFather) orqali olinadi.
- **GEMINI_API_KEY:** [Google AI Studio](https://aistudio.google.com/app/apikey) dan bepul olinadi.

### 3. Botni ishga tushirish:
```bash
node bot.js
```

---

## 🛠 Texnologiyalar
- **Node.js** (v18+)
- **Telegram Bot API**
- **Google Gemini API** (Gemini 3.6 Flash & Gemini 3.8 Flash TTS)
