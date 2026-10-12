const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

// Token kiritilganligini tekshirish
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.error('❌ XATOLIK: BOT_TOKEN topilmadi!');
    console.error('👉 Iltimos, .env faylini oching va @BotFather dan olgan tokeningizni kiriting:');
    console.error('BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz\n');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// /start komandasi uchun javob
bot.start((ctx) => {
    const userName = ctx.from.first_name || 'Foydalanuvchi';
    ctx.reply(
        `Salom, ${userName}! 🎵\nMen Telegram musiqa botiman.\nMenga istalgan qo'shiq nomini yoki ijrochisini yuboring, men uni topishga harakat qilaman.`,
        Markup.keyboard([
            ['🔍 Qo\'shiq qidirish', 'ℹ️ Ma\'lumot']
        ]).resize()
    );
});

// /help yoki Ma'lumot tugmasi
bot.hears('ℹ️ Ma\'lumot', (ctx) => {
    ctx.reply(
        'ℹ️ *Bot haqida ma\'lumot:*\n\n' +
        '• Bu bot Node.js va Telegraf yordamida yaratilgan.\n' +
        '• Qo\'shiq qidirish uchun shunchaki uning nomini yoki ijrochini yozib yuboring.\n' +
        '• Bot sizga audio va tugmalarni taqdim etadi.',
        { parse_mode: 'Markdown' }
    );
});

// "🔍 Qo'shiq qidirish" tugmasi bosilganda
bot.hears('🔍 Qo\'shiq qidirish', (ctx) => {
    ctx.reply('🎧 Qaysi qo\'shiqni qidiryapsiz? Qo\'shiq yoki ijrochi nomini yozib yuboring:');
});

// Matnli xabarlarni qabul qilish (Qidiruv qismi)
bot.on('text', async (ctx) => {
    const query = ctx.message.text.trim();

    const loadingMsg = await ctx.reply(`🔍 "${query}" bo'yicha qidirilmoqda...`);

    try {
        setTimeout(async () => {
            await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

            await ctx.reply(
                `🎶 *Natija topildi!*\n\n` +
                `📌 Nomi: *${query}*\n` +
                `👤 Ijrochi: *Noma'lum ijrochi*\n` +
                `⏱ Davomiyligi: *03:45*`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback('▶️ Tinglash', `play_${encodeURIComponent(query.slice(0, 20))}`),
                            Markup.button.callback('📥 Yuklab olish', `dl_${encodeURIComponent(query.slice(0, 20))}`)
                        ]
                    ])
                }
            );
        }, 1200);

    } catch (error) {
        console.error('Qidiruvda xatolik:', error);
        ctx.reply('❌ Kechirasiz, qo\'shiqni qidirishda xatolik yuz berdi.');
    }
});

// Inline tugmalar bosilganda ishlov berish
bot.action(/play_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply('🎧 Ijro etish rejimi tayyorlanmoqda...');
});

bot.action(/dl_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply('📥 Yuklab olish boshlandi... Audio tez orada yuboriladi.');
});

bot.action('play_track', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply('🎧 Ijro etish rejimi hozircha ishlab chiqilmoqda...');
});

bot.action('download_track', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply('📥 Yuklab olish boshlandi...');
});

// Xatoliklarni ushlash
bot.catch((err, ctx) => {
    console.error(`Bot xatoligi yuz berdi: ${ctx.updateType}`, err);
});

// Botni ishga tushirish
bot.launch().then(() => {
    console.log('✅ Bot muvaffaqiyatli ishga tushdi!');
    console.log('🤖 Telegramga kirib, botingizga /start buyrug\'ini yuboring.');
}).catch((err) => {
    console.error('❌ Botni ishga tushirishda xatolik:', err);
});

// Dastur to'xtatilganda xavfsiz o'chirish
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
