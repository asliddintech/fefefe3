import fs from 'fs';
import dns from 'dns';
import http from 'http';

// Render.com Web Service port tekshiruvi uchun yengil HTTP server
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🤖 Google Gemini Telegram Boti faol ishlamoqda!\n');
}).listen(PORT, () => {
    console.log(`🌐 HTTP server ${PORT}-portda ishlamoqda.`);
});

// DNS da IPv4 ni birinchi o'ringa qo'yish (Telegram ulanish tezligini oshirish)
dns.setDefaultResultOrder('ipv4first');

// .env faylini yuklash
try {
    if (process.loadEnvFile) {
        process.loadEnvFile('.env');
    }
} catch {
    if (fs.existsSync('.env')) {
        const envContent = fs.readFileSync('.env', 'utf-8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const [key, ...vals] = trimmed.split('=');
            if (key && vals.length) {
                process.env[key.trim()] = vals.join('=').trim();
            }
        }
    }
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BOT_TOKEN) {
    console.error('❌ XATOLIK: BOT_TOKEN topilmadi!');
    process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Har bir chat uchun suhbat tarixini saqlash
const chatHistories = new Map();

// Telegram API so'rov yuboruvchi yordamchi funksiya
async function tgCall(method, body = {}) {
    try {
        const res = await fetch(`${TELEGRAM_API}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (err) {
        console.error(`Telegram API xatosi (${method}):`, err.message);
        return { ok: false, error: err };
    }
}

// Telegram harakat holati (action) yuborish
async function sendAction(chatId, action = 'typing') {
    return tgCall('sendChatAction', { chat_id: chatId, action });
}

// Xabarni uzunligiga qarab bo'lib yuborish
async function sendLongMessage(chatId, text, options = {}) {
    const MAX_LENGTH = 3800;
    if (text.length <= MAX_LENGTH) {
        let res = null;
        if (options.parse_mode) {
            res = await tgCall('sendMessage', {
                chat_id: chatId,
                text,
                parse_mode: options.parse_mode,
                reply_markup: options.reply_markup
            });
        }
        if (!res || !res.ok) {
            return tgCall('sendMessage', {
                chat_id: chatId,
                text,
                reply_markup: options.reply_markup
            });
        }
        return res;
    }

    for (let i = 0; i < text.length; i += MAX_LENGTH) {
        const chunk = text.slice(i, i + MAX_LENGTH);
        await tgCall('sendMessage', {
            chat_id: chatId,
            text: chunk,
            reply_markup: (i + MAX_LENGTH >= text.length) ? options.reply_markup : undefined
        });
    }
}

// Ovozli xabar (Voice) yoki Audio yuborish
async function sendTelegramVoice(chatId, wavBuffer, caption = '') {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('voice', new Blob([wavBuffer], { type: 'audio/wav' }), 'voice.wav');
    if (caption) formData.append('caption', caption.slice(0, 1000));

    try {
        const res = await fetch(`${TELEGRAM_API}/sendVoice`, {
            method: 'POST',
            body: formData
        });
        const json = await res.json();
        if (json && json.ok) return json;
    } catch (err) {
        console.error('sendVoice xatosi:', err.message);
    }

    // Agar sendVoice o'tmasa, sendAudio orqali yuboramiz
    return sendTelegramAudio(chatId, wavBuffer, "Gemini Qo'shig'i", "Gemini AI", caption);
}

// Audio fayl sifatida yuborish
async function sendTelegramAudio(chatId, wavBuffer, title = "Qo'shiq", performer = 'Gemini AI', caption = '') {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('audio', new Blob([wavBuffer], { type: 'audio/wav' }), 'song.wav');
    formData.append('title', title);
    formData.append('performer', performer);
    if (caption) formData.append('caption', caption.slice(0, 1000));

    try {
        const res = await fetch(`${TELEGRAM_API}/sendAudio`, {
            method: 'POST',
            body: formData
        });
        return await res.json();
    } catch (err) {
        console.error('sendAudio xatosi:', err.message);
        return { ok: false, error: err };
    }
}

// Gemini TTS orqali matnni ovozga aylantirish (Ovozli xabar yaratish)
async function textToSpeech(textPrompt) {
    if (!GEMINI_API_KEY) return null;

    // Matnni belgilardan tozalash va qisqartirish (TTS yaxshi talaffuz qilishi uchun)
    const cleanText = textPrompt
        .replace(/[*_#`~\[\]()—]/g, ' ')
        .replace(/\n+/g, '. ')
        .slice(0, 600);

    const models = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: cleanText }] }],
                    generationConfig: {
                        responseModalities: ['AUDIO']
                    }
                })
            });

            const data = await res.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const part = data.candidates[0].content.parts[0];
                if (part && part.inlineData && part.inlineData.data) {
                    return Buffer.from(part.inlineData.data, 'base64');
                }
            }
        } catch (err) {
            console.error(`TTS (${model}) xatoligi:`, err.message);
        }
    }
    return null;
}

// Google Gemini API orqali javob olish (Matn)
async function askGemini(chatId, userPrompt) {
    if (!GEMINI_API_KEY) {
        return "⚠️ Gemini API kaliti topilmadi.";
    }

    if (!chatHistories.has(chatId)) {
        chatHistories.set(chatId, []);
    }
    const history = chatHistories.get(chatId);

    // Foydalanuvchi savolini tarixga qo'shish
    history.push({
        role: 'user',
        parts: [{ text: userPrompt }]
    });

    if (history.length > 10) {
        history.splice(0, history.length - 10);
    }

    const requestBody = {
        contents: history,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
        }
    };

    const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'];

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await res.json();

            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const parts = data.candidates[0].content.parts || [];
                const aiResponse = parts.filter(p => p.text).map(p => p.text).join('\n');

                if (aiResponse) {
                    history.push({
                        role: 'model',
                        parts: [{ text: aiResponse }]
                    });
                    return aiResponse;
                }
            } else if (data.error) {
                console.error(`Gemini (${model}) xatoligi:`, data.error.message);
            }
        } catch (err) {
            console.error(`Gemini (${model}) tarmoq xatosi:`, err.message);
        }
    }

    return "❌ Kechirasiz, javob olishda xatolik yuz berdi.";
}

// Asosiy menyu
const mainMenu = {
    keyboard: [
        [{ text: "🎤 Ovozli qo'shiq aytish" }, { text: "💬 Savol berish" }],
        [{ text: "🔄 Yangi suhbat" }, { text: "ℹ️ Ma'lumot" }]
    ],
    resize_keyboard: true
};

// Xabarlarni boshqarish
async function handleUpdate(update) {
    // 1. Agar inline tugma bosilgan bo'lsa (ovozli eshitish)
    if (update.callback_query) {
        const query = update.callback_query;
        const chatId = query.message.chat.id;
        const data = query.data;

        await tgCall('answerCallbackQuery', { callback_query_id: query.id, text: "Ovoz tayyorlanmoqda..." });

        if (data === 'tts_last') {
            await sendAction(chatId, 'record_voice');
            const history = chatHistories.get(chatId) || [];
            const lastModelMsg = [...history].reverse().find(m => m.role === 'model');
            if (lastModelMsg && lastModelMsg.parts && lastModelMsg.parts[0]) {
                const audioBuffer = await textToSpeech(lastModelMsg.parts[0].text);
                if (audioBuffer) {
                    await sendTelegramVoice(chatId, audioBuffer, "🔊 Gemini ovozli xabari");
                } else {
                    await sendLongMessage(chatId, "Kechirasiz, ovozni yaratib bo'lmadi.");
                }
            }
        }
        return;
    }

    // 2. Agar matnli xabar kelgan bo'lsa
    if (!update.message || !update.message.text) return;

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text.trim();
    const firstName = message.from.first_name || 'Foydalanuvchi';

    console.log(`[Xabar] ${firstName}: ${text}`);

    // /start komandasi
    if (text === '/start') {
        await sendLongMessage(
            chatId,
            `Assalomu alaykum, *${firstName}*! 🤖🎵✨\n\n` +
            `Men **Google Gemini** sun'iy intellekti bilan integratsiya qilingan aqlli ovozli botman!\n\n` +
            `🎤 **Imkoniyatlarim:**\n` +
            `• Istalgan mavzuda **ovozli qo'shiq** kuylash\n` +
            `• Har qanday savollarga to'liq va aqlli javob berish\n` +
            `• Ovozli xabarlar (Audio) orqali so'zlashish\n\n` +
            `Quyidagi tugmalardan birini tanlang yoki savolingizni yozib yuboring:`,
            { parse_mode: 'Markdown', reply_markup: mainMenu }
        );
        return;
    }

    // Suhbat tarixini tozalash
    if (text === '🔄 Yangi suhbat' || text === '/reset' || text === '/clear') {
        chatHistories.delete(chatId);
        await sendLongMessage(
            chatId,
            `🔄 Suhbat tarixi tozalandi! Yangi savol yoki qo'shiq mavzusini yozib yuboring:`,
            { reply_markup: mainMenu }
        );
        return;
    }

    // Bot haqida ma'lumot
    if (text === "ℹ️ Ma'lumot" || text === '/info') {
        await sendLongMessage(
            chatId,
            `ℹ️ *Bot haqida:*\n\n` +
            `• **Sun'iy intellekt:** Google Gemini AI\n` +
            `• **Ovoz sintezi (TTS):** Gemini 3.8 Flash TTS\n` +
            `• Menga shunchaki *"Ovozli qo'shiq ayt"* yoki istalgan mavzuni yozing, men ham matnini, ham ovozli audio xabarini tayyorlab beraman! 🎧`,
            { parse_mode: 'Markdown', reply_markup: mainMenu }
        );
        return;
    }

    // Ovozli qo'shiq so'rovi tekshiruvi (qo'shiq, qoshiq, kishik, kuyla, ayt, ashula va h.k.)
    const isSongRequest = 
        text === "🎤 Ovozli qo'shiq aytish" ||
        /qo['`]?shiq|qoshiq|kishik|ashula|kuyla|sing|musiqa|musiqi/i.test(text) ||
        /ovozli/i.test(text);

    if (text === "💬 Savol berish") {
        await sendLongMessage(chatId, `✍️ Marhamat, istalgan savolingizni yozib yuboring:`);
        return;
    }

    if (isSongRequest) {
        // Qo'shiq kuylash va ovozli xabar yuborish
        await sendAction(chatId, 'record_voice');
        const waitMsg = await sendLongMessage(chatId, `🎵 *Gemini qo'shiq kuylashga tayyorlanmoqda va ovozli xabar yozmoqda...* 🎙`);

        const prompt = text === "🎤 Ovozli qo'shiq aytish"
            ? "Menga o'zbek tilida quvnoq, chiroyli va qisqa (2 band va naqoratdan iborat) qo'shiq yozib ber."
            : `Foydalanuvchi so'rovi: "${text}". O'zbek tilida chiroyli, sho'x va qisqa (2 band va naqorat) qo'shiq yozib ber.`;

        const lyrics = await askGemini(chatId, prompt);

        // Qo'shiq matnini yuborish
        await sendLongMessage(chatId, `🎶 *Qo'shiq matni:*\n\n${lyrics}`, { parse_mode: 'Markdown' });

        // Ovozli xabar yaratish (TTS)
        await sendAction(chatId, 'upload_voice');
        const audioBuffer = await textToSpeech(lyrics);

        if (audioBuffer) {
            await sendTelegramVoice(chatId, audioBuffer, "🎙 Gemini AI ovozli qo'shig'i 🎵");
        }

        if (waitMsg && waitMsg.result) {
            await tgCall('deleteMessage', { chat_id: chatId, message_id: waitMsg.result.message_id }).catch(() => {});
        }
        return;
    }

    // Oddiy savollarga javob berish
    await sendAction(chatId, 'typing');
    const typingInterval = setInterval(() => sendAction(chatId, 'typing'), 4000);

    try {
        const aiResponse = await askGemini(chatId, text);
        clearInterval(typingInterval);

        const inlineKeyboard = {
            inline_keyboard: [
                [{ text: "🔊 Ovozli eshitish", callback_data: "tts_last" }]
            ]
        };

        await sendLongMessage(chatId, aiResponse, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    } catch (err) {
        clearInterval(typingInterval);
        console.error('Xatoga javob berishda xato:', err);
        await sendLongMessage(chatId, "Kechirasiz, xatolik yuz berdi.");
    }
}

// Long Polling
let offset = 0;
let isRunning = true;

async function pollUpdates() {
    while (isRunning) {
        try {
            const response = await tgCall('getUpdates', {
                offset,
                timeout: 20,
                allowed_updates: ['message', 'callback_query']
            });

            if (response && response.ok && Array.isArray(response.result) && response.result.length > 0) {
                for (const update of response.result) {
                    offset = update.update_id + 1;
                    handleUpdate(update).catch(console.error);
                }
            } else if (!response || !response.ok) {
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (err) {
            console.error('Polling xatosi:', err.message);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

// Botni ishga tushirish
async function startBot() {
    console.log("Telegramga ulanmoqda...");
    const me = await tgCall('getMe');
    if (!me || !me.ok) {
        console.error("❌ Telegramga ulanib bo'lmadi:", me);
        setTimeout(startBot, 4000);
        return;
    }

    console.log("=========================================");
    console.log(`✅ Google Gemini Ovozli Boti ishga tushdi!`);
    console.log(`🤖 Bot nomi: ${me.result.first_name}`);
    console.log(`🔗 Bot havolasi: https://t.me/${me.result.username}`);
    console.log(`🎙 Ovoz sintezi (TTS): Gemini 3.8 Flash TTS`);
    console.log("=========================================");
    console.log("Xabarlar kutilmoqda...\n");

    pollUpdates();
}

startBot();

process.on('SIGINT', () => {
    console.log('\nBot to\'xtatildi.');
    isRunning = false;
    process.exit(0);
});
