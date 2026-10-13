import fs from 'fs';
import dns from 'dns';
import http from 'http';

// Render.com Web Service port tekshiruvi uchun yengil HTTP server
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🎵 Telegram AI Musiqa Boti faol ishlamoqda!\n');
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
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

// Foydalanuvchilar suhbat tarixi va pleylisti
const chatHistories = new Map();
const userPlaylists = new Map();

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

// Ovozli xabar (Voice) yuborish
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
        return await res.json();
    } catch (err) {
        console.error('sendVoice xatosi:', err.message);
        return { ok: false, error: err };
    }
}

// Gemini TTS (Text-to-Speech)
async function textToSpeech(textPrompt) {
    if (!GEMINI_API_KEY) return null;

    const cleanText = textPrompt
        .replace(/[*_#`~\[\]()—]/g, ' ')
        .replace(/\n+/g, '. ')
        .slice(0, 450);

    const ttsModels = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview', 'gemini-3.8-flash-tts'];

    for (const model of ttsModels) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: cleanText }] }],
                    generationConfig: { responseModalities: ['AUDIO'] }
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

// Google Gemini API orqali javob olish (Matnli musiqa qidiruv va maslahat)
async function askGeminiMusic(chatId, userPrompt, systemPrompt = '') {
    if (!GEMINI_API_KEY) {
        return "⚠️ Gemini API kaliti sozlanmagan.";
    }

    if (!chatHistories.has(chatId)) {
        chatHistories.set(chatId, []);
    }
    const history = chatHistories.get(chatId);

    const baseSystemPrompt = 
        "Sen professional Telegram Musiqa Botisan. " +
        "Foydalanuvchilarga barcha turdagi qo'shiqlarni (o'zbekcha, ruscha, inglizcha, xitoycha, trenddagi remikslar va h.k.) topib berasan. " +
        "Qo'shiq nomi, ijrochi yoki matnidan bir qator kelganda, uni aniq topib, quyidagicha chiroyli formatda ber:\n" +
        "🎵 Qo'shiq: [Nomi]\n" +
        "👤 Ijrochi: [Ijrochi]\n" +
        "📅 Yil / Janr: ...\n" +
        "📝 Mashhur parcha / Ma'lumot: ...\n" +
        "Doimo o'zbek tilida xushmuomala, musiqiy emojilar bilan va aniq javob ber.";

    const contents = [
        {
            role: 'user',
            parts: [{ text: systemPrompt ? `${baseSystemPrompt}\n${systemPrompt}\nFoydalanuvchi: ${userPrompt}` : `${baseSystemPrompt}\nFoydalanuvchi: ${userPrompt}` }]
        }
    ];

    const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1500
                    }
                })
            });

            const data = await res.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const parts = data.candidates[0].content.parts || [];
                const aiResponse = parts.filter(p => p.text).map(p => p.text).join('\n');
                if (aiResponse) return aiResponse;
            }
        } catch (err) {
            console.error(`Gemini (${model}) xatosi:`, err.message);
        }
    }

    return "❌ Kechirasiz, musiqiy sun'iy intellektdan javob olishda uzilish yuz berdi. Iltimos, qayta urinib ko'ring.";
}

// Telegramdan Voice / Audio faylni yuklab olib, Gemini orqali aniqlash
async function recognizeAudioWithAI(fileId, mimeType = 'audio/ogg') {
    if (!GEMINI_API_KEY) return "⚠️ Gemini API kaliti sozlanmagan.";

    try {
        // 1. Telegramdan fayl yo'lini olish
        const fileInfo = await tgCall('getFile', { file_id: fileId });
        if (!fileInfo || !fileInfo.ok || !fileInfo.result || !fileInfo.result.file_path) {
            return "❌ Ovozli faylni yuklab olish imkoni bo'lmadi.";
        }

        const filePath = fileInfo.result.file_path;
        const downloadUrl = `${TELEGRAM_FILE_API}/${filePath}`;

        // 2. Faylni yuklab olish
        const fileRes = await fetch(downloadUrl);
        const arrayBuffer = await fileRes.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString('base64');

        // Fayl kengaytmasiga qarab mime type belgilash
        let actualMime = mimeType;
        if (filePath.endsWith('.mp3')) actualMime = 'audio/mp3';
        else if (filePath.endsWith('.wav')) actualMime = 'audio/wav';
        else if (filePath.endsWith('.oga') || filePath.endsWith('.ogg')) actualMime = 'audio/ogg';

        // 3. Gemini Multimodal orqali audioni tahlil qilish
        const models = ['gemini-3.5-flash', 'gemini-3.8-flash'];

        for (const model of models) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                {
                                    text: "Sen professional musiqa aniqlovchi sun'iy intellektsan. " +
                                          "Ushbu audio/ovozli xabarni diqqat bilan eshitib tahlil qil. " +
                                          "Undagi kuylangan qo'shiq, musiqa ohangi yoki so'zlarni aniqla. " +
                                          "Qo'shiq nomi va ijrochisini topib, foydalanuvchiga xushmuomala qilib taqdim et. " +
                                          "Agar aniq bo'lmasa, eng o'xshash ehtimolli qo'shiqlarni ko'rsat."
                                },
                                {
                                    inlineData: {
                                        mimeType: actualMime,
                                        data: base64Audio
                                    }
                                }
                            ]
                        }]
                    })
                });

                const data = await res.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    const parts = data.candidates[0].content.parts || [];
                    const text = parts.filter(p => p.text).map(p => p.text).join('\n');
                    if (text) return text;
                }
            } catch (err) {
                console.error(`Audio tahlil (${model}) xatosi:`, err.message);
            }
        }

        return "🎙 Ushbu audiodan qo'shiqni aniqlab bo'lmadi. Iltimos, musiqani biroz balandroq yoki toza ovozda yozib yuboring.";
    } catch (err) {
        console.error('Audio yuklab olish xatosi:', err.message);
        return "❌ Audioni qabul qilishda texnik xatolik yuz berdi.";
    }
}

// Asosiy boshqaruv menyusi (Klaviatura)
const mainMenu = {
    keyboard: [
        [{ text: "🔍 Qo'shiq qidirish" }, { text: "🎙 Ovozli qidiruv (Voice)" }],
        [{ text: "🔥 Trenddagi qo'shiqlar" }, { text: "📁 Mening pleylistim" }],
        [{ text: "🔄 Yangi suhbat" }, { text: "ℹ️ Bot haqida" }]
    ],
    resize_keyboard: true
};

// Xabarlarni boshqarish
async function handleUpdate(update) {
    // 1. Agar inline tugma bosilgan bo'lsa
    if (update.callback_query) {
        const query = update.callback_query;
        const chatId = query.message.chat.id;
        const data = query.data;

        // Pleylistga qo'shish
        if (data.startsWith('add_pl_')) {
            const trackName = decodeURIComponent(data.replace('add_pl_', ''));
            if (!userPlaylists.has(chatId)) {
                userPlaylists.set(chatId, []);
            }
            const playlist = userPlaylists.get(chatId);
            if (!playlist.includes(trackName)) {
                playlist.push(trackName);
                await tgCall('answerCallbackQuery', { 
                    callback_query_id: query.id, 
                    text: `✅ Pleylistga qo'shildi: ${trackName}` 
                });
            } else {
                await tgCall('answerCallbackQuery', { 
                    callback_query_id: query.id, 
                    text: "Ushbu tarona allaqachon pleylistingizda bor!" 
                });
            }
            return;
        }

        // Pleylistni tozalash
        if (data === 'clear_playlist') {
            userPlaylists.delete(chatId);
            await tgCall('answerCallbackQuery', { callback_query_id: query.id, text: "Pleylist tozalandi!" });
            await sendLongMessage(chatId, "📁 Pleylistingiz tozalandi. Yangi qo'shiqlarni qidirib qo'shishingiz mumkin!");
            return;
        }

        // TTS ovozli eshitish
        if (data === 'tts_last') {
            await tgCall('answerCallbackQuery', { callback_query_id: query.id, text: "Ovoz tayyorlanmoqda..." });
            await sendAction(chatId, 'record_voice');
            const history = chatHistories.get(chatId) || [];
            const lastModelMsg = [...history].reverse().find(m => m.role === 'model');
            if (lastModelMsg && lastModelMsg.parts && lastModelMsg.parts[0]) {
                const audioBuffer = await textToSpeech(lastModelMsg.parts[0].text);
                if (audioBuffer) {
                    await sendTelegramVoice(chatId, audioBuffer, "🔊 Gemini ovozli javobi");
                }
            }
            return;
        }

        await tgCall('answerCallbackQuery', { callback_query_id: query.id });
        return;
    }

    if (!update.message) return;
    const message = update.message;
    const chatId = message.chat.id;
    const firstName = message.from.first_name || 'Foydalanuvchi';

    // 2. Agar Foydalanuvchi Ovozli Xabar (Voice) yoki Audio yuborgan bo'lsa
    if (message.voice || message.audio) {
        const fileId = message.voice ? message.voice.file_id : message.audio.file_id;
        const mime = message.voice ? 'audio/ogg' : (message.audio.mime_type || 'audio/mp3');

        await sendAction(chatId, 'typing');
        const waitMsg = await sendLongMessage(chatId, "🎧 *Ovozli xabaringiz qabul qilindi. Sun'iy intellekt qo'shiqni aniqlamoqda...*", { parse_mode: 'Markdown' });

        const result = await recognizeAudioWithAI(fileId, mime);

        if (waitMsg && waitMsg.result) {
            await tgCall('deleteMessage', { chat_id: chatId, message_id: waitMsg.result.message_id }).catch(() => {});
        }

        // Qidiruv va YouTube tugmalari
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "▶️ YouTube'da tinglash", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(result.slice(0, 40))}` },
                    { text: "➕ Pleylistga qo'shish", callback_data: `add_pl_${encodeURIComponent(result.slice(0, 30))}` }
                ]
            ]
        };

        await sendLongMessage(chatId, `🎙 *Ovoz orqali aniqlangan natija:*\n\n${result}`, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
        return;
    }

    // 3. Agar matnli xabar kelgan bo'lsa
    if (!message.text) return;
    const text = message.text.trim();

    console.log(`[Xabar] ${firstName}: ${text}`);

    // /start komandasi
    if (text === '/start') {
        await sendLongMessage(
            chatId,
            `Assalomu alaykum, *${firstName}*! 🎵🎧✨\n\n` +
            `Men sun'iy intellekt (**Google Gemini AI**) bilan jihozlangan professional **Telegram Musiqa Botiman**!\n\n` +
            `🌟 **Imkoniyatlarim:**\n` +
            `• 🔍 **Nomi va ijrochi bo'yicha qidiruv** (O'zbek, rus, jahon taronalari)\n` +
            `• 📝 **Matn bo'laklari orqali qidiruv** (Qo'shiq so'zlarini yozsangiz topaman)\n` +
            `• 🎙 **Voice / Audio qidiruv** (Ovozli xabar yuborsangiz aniqlayman)\n` +
            `• 🔥 **Trenddagi TOP qo'shiqlar** ro'yxati\n` +
            `• 📁 **Shaxsiy pleylist** tuzish\n\n` +
            `Istalgan qo'shiq nomi yoki so'zlarini yozing, yoki quyidagi menyudan foydalaning:`,
            { parse_mode: 'Markdown', reply_markup: mainMenu }
        );
        return;
    }

    // Yangi suhbat (Tarixni tozalash)
    if (text === '🔄 Yangi suhbat' || text === '/reset' || text === '/clear') {
        chatHistories.delete(chatId);
        await sendLongMessage(chatId, `🔄 Suhbat tarixi yangilandi! Qaysi qo'shiqni qidiramiz?`, { reply_markup: mainMenu });
        return;
    }

    // Bot haqida ma'lumot
    if (text === "ℹ️ Bot haqida" || text === '/info') {
        await sendLongMessage(
            chatId,
            `ℹ️ *Bot haqida:*\n\n` +
            `• **Musiqiy Sun'iy Intellekt:** Google Gemini AI (Multimodal)\n` +
            `• **Qidiruv turlari:** Matn, Ijrochi, Qo'shiq so'zlari, Ovozli xabar (Voice/Humming)\n` +
            `• **Platforma:** Telegram Bot API & Node.js\n\n` +
            `Menga shunchaki qo'shiq nomini, so'zlarini yoki ovozli xabar yuboring! 🎶`,
            { parse_mode: 'Markdown', reply_markup: mainMenu }
        );
        return;
    }

    // Qo'shiq qidirish yo'riqnomasi
    if (text === "🔍 Qo'shiq qidirish") {
        await sendLongMessage(
            chatId,
            `🔍 *Qo'shiq qidirish bo'limi:*\n\n` +
            `Istalgan qo'shiq nomi yoki ijrochisini yozib yuboring.\n` +
            `*Masalan:*\n` +
            `• \`Konsta - O'zbekistonlik\`\n` +
            `• \`Tungi shahar\`\n` +
            `• \`Jony - Комета\`\n` +
            `• \`The Weeknd - Blinding Lights\``,
            { parse_mode: 'Markdown', reply_markup: mainMenu }
        );
        return;
    }

    // Ovozli qidiruv yo'riqnomasi
    if (text === "🎙 Ovozli qidiruv (Voice)") {
        await sendLongMessage(
            chatId,
            `🎙 *Ovozli qidiruv rejimi:*\n\n` +
            `Menga **5–15 soniyalik** ovozli xabar (Voice message) yoki qisqa audio fayl yuboring.\n\n` +
            `Siz qo'shiqni o'zingiz xirgoyi qilib kuylashingiz yoki fonda yangrayotgan musiqani yozib olishingiz mumkin. Sun'iy intellekt uni aniqlaydi! 🎧`,
            { parse_mode: 'Markdown', reply_markup: mainMenu }
        );
        return;
    }

    // Shaxsiy Pleylist
    if (text === "📁 Mening pleylistim") {
        const playlist = userPlaylists.get(chatId) || [];
        if (playlist.length === 0) {
            await sendLongMessage(
                chatId,
                `📁 *Sizning pleylistingiz hozircha bo'sh.*\n\nQo'shiq qidirganda uning ostidagi *"➕ Pleylistga qo'shish"* tugmasini bosing va o'z to'plamingizni yarating! 🎧`,
                { parse_mode: 'Markdown', reply_markup: mainMenu }
            );
        } else {
            const listText = playlist.map((item, idx) => `${idx + 1}. 🎶 *${item}*`).join('\n');
            const inlineKeyboard = {
                inline_keyboard: [
                    [{ text: "🗑 Pleylistni tozalash", callback_data: "clear_playlist" }]
                ]
            };
            await sendLongMessage(
                chatId,
                `📁 *Sizning shaxsiy pleylistingiz:*\n\n${listText}\n\nJami: ${playlist.length} ta tarona.`,
                { parse_mode: 'Markdown', reply_markup: inlineKeyboard }
            );
        }
        return;
    }

    // Trenddagi TOP musiqalar
    if (text === "🔥 Trenddagi qo'shiqlar") {
        await sendAction(chatId, 'typing');
        const trendPrompt = "Hozirgi vaqtda eng ommabop va trenddagi 5 ta o'zbekcha va 5 ta jahon xit qo'shiqlarini nomlari va ijrochilari bilan tartiblangan ro'yxat qilib ber.";
        const trendResponse = await askGeminiMusic(chatId, trendPrompt);

        await sendLongMessage(chatId, `🔥 *Hozirgi kunda eng ommabop trend qo'shiqlar:*\n\n${trendResponse}`, {
            parse_mode: 'Markdown',
            reply_markup: mainMenu
        });
        return;
    }

    // Qo'shiq qidiruvi / Umumiy so'rovlar (AI bilan muloqot)
    await sendAction(chatId, 'typing');
    const typingInterval = setInterval(() => sendAction(chatId, 'typing'), 3500);

    try {
        const aiResponse = await askGeminiMusic(chatId, text);
        clearInterval(typingInterval);

        // Birinchi qatordan qo'shiq nomini ajratib olish (tugma uchun)
        const cleanQuery = text.slice(0, 35);
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "▶️ YouTube'da tinglash", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}` },
                    { text: "➕ Pleylistga qo'shish", callback_data: `add_pl_${encodeURIComponent(cleanQuery)}` }
                ]
            ]
        };

        await sendLongMessage(chatId, aiResponse, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    } catch (err) {
        clearInterval(typingInterval);
        console.error('Qidiruvda xatolik:', err);
        await sendLongMessage(chatId, "❌ Kechirasiz, qidiruvda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
    }
}

// Telegram Long Polling
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
    console.log("Telegram API ga ulanmoqda...");
    const me = await tgCall('getMe');
    if (!me || !me.ok) {
        console.error("❌ Telegramga ulanib bo'lmadi:", me);
        setTimeout(startBot, 4000);
        return;
    }

    console.log("==================================================");
    console.log(`✅ Sun'iy Intellekt Musiqa Boti muvaffaqiyatli ishga tushdi!`);
    console.log(`🤖 Bot nomi: ${me.result.first_name}`);
    console.log(`🔗 Bot linki: https://t.me/${me.result.username}`);
    console.log(`🧠 Sun'iy intellekt: Google Gemini (Multimodal + Audio)`);
    console.log("==================================================");
    console.log("Xabarlar va audio qidiruvlar kutilmoqda...\n");

    pollUpdates();
}

startBot();

process.on('SIGINT', () => {
    console.log("\nBot to'xtatildi.");
    isRunning = false;
    process.exit(0);
});
