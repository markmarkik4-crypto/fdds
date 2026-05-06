import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { writeFile, readFile, unlink, mkdir, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import https from "https";
import { fileURLToPath } from "url";
import { dirname as dir } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dir(__filename);
const PROJECT_ROOT = __dirname;
const VOICES_DIR = join(PROJECT_ROOT, "voices");
const SCRIPTS_DIR = join(PROJECT_ROOT, "scripts");
const VIDEO_DIR = join(PROJECT_ROOT, "videos");
const MUSIC_DIR = join(PROJECT_ROOT, "music");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!TELEGRAM_TOKEN) throw new Error("Set TELEGRAM_TOKEN in the environment.");
if (!OPENAI_KEY) throw new Error("Set OPENAI_API_KEY in .env");

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_KEY });

await mkdir(VOICES_DIR, { recursive: true });
await mkdir(VIDEO_DIR, { recursive: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
        }).on("error", reject);
    });
}

function runPython(script, args) {
    return new Promise((resolve, reject) => {
        // Pass OpenAI API key as --api-key argument so Python doesn't depend on inherited env
        const proc = spawn("python3", [join(SCRIPTS_DIR, script), "--api-key", OPENAI_KEY, ...args], {
            cwd: PROJECT_ROOT,
            env: process.env,
        });
        let stdout = "", stderr = "";
        proc.stdout.on("data", (d) => (stdout += d));
        proc.stderr.on("data", (d) => (stderr += d));
        proc.on("close", (code) => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(stderr || stdout));
        });
        proc.on("error", reject);
    });
}

async function getVoiceList() {
    try {
        const files = await readdir(VOICES_DIR);
        return files.filter((f) => f.endsWith(".wav")).map((f) => f.replace(".wav", ""));
    } catch { return []; }
}

async function downloadFile(fileId) {
    const file = await bot.getFile(fileId);
    return downloadUrl(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`);
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Video Generation State Machine ───────────────────────────────────────────

const videoThemes = {
    health: "💚 Здоровье",       finance: "💰 Финансы",
    entertainment: "🎬 Развлечения", education: "📚 Образование",
    food: "🍳 Еда и рецепты",   travel: "✈️ Путешествия",
    technology: "💻 Технологии", history: "🏛 История",
    military: "⚔️ Воен. история", sports: "⚽ Спорт",
    politics: "🏛 Политика",     business: "💼 Бизнес",
    science: "🔬 Наука",        environment: "🌍 Экология",
};

const videoLangs = {
    en: "🇬🇧 English",  ru: "🇷🇺 Русский",  uk: "🇺🇦 Українська",
    es: "🇪🇸 Español",  de: "🇩🇪 Deutsch",   fr: "🇫🇷 Français",
    pt: "🇧🇷 Português", ar: "🇸🇦 العربية",  zh: "🇨🇳 中文",
    ja: "🇯🇵 日本語",    ko: "🇰🇷 한국어",
};

const videoStyles = {
    fantasy: "🧙 Fantasy",     cinematic: "🎬 Cinematic",
    standard: "🖼️ Standard",   anime: "🎨 Anime",
    illustration: "✏️ Illust",  monochrome: "⬛ Mono",
    moody: "🌑 Moody",         photography: "📷 Photo",
    "3d": "🧸 3D Render",      retro: "📺 Retro",
};

const videoMusic = {
    none: "🔇 Без музыки",  random: "🎲 Случайная",
    valor: "⚔️ Chronicles of Valor",
    echoes: "🌫️ Echoes of Ages",
    empire: "🏰 Echoes of Empire",
    past: "⏳ Echoes of the Past",
};

function videoState(chatId) {
    return {
        chatId,
        step: 0,
        // 0=idle, 1=theme, 2=lang, 3=format, 4=duration,
        // 5=style, 6=music, 7=voice, 8=confirm, 9=rendering
        msgId: null,
        theme: null,
        customText: null,
        lang: "ru",
        format: "9:16",
        duration: 60,
        style: "fantasy",
        music: "none",
        voiceId: null,
    };
}

const videoSessions = new Map();

// ─── Subtitle Edit Sessions ───────────────────────────────────────────────────

const editSessions = new Map();
// editSessions: chatId → { sessionDir, format, music, entries, msgId }
// entries: [{ start, end, text }, ...]

function parseSrtContent(content) {
    const entries = [];
    for (const block of content.trim().split(/\n\n+/)) {
        const lines = block.trim().split("\n");
        if (lines.length < 3) continue;
        try {
            const [startStr, endStr] = lines[1].split(" --> ");
            entries.push({ start: startStr.trim(), end: endStr.trim(), text: lines.slice(2).join(" ").trim() });
        } catch { /* skip malformed */ }
    }
    return entries;
}

function formatSrtContent(entries) {
    return entries.map((e, i) =>
        `${i + 1}\n${e.start} --> ${e.end}\n${e.text}`
    ).join("\n\n") + "\n";
}

function subtitleListText(entries) {
    const lines = entries.map((e, i) => `${i + 1}. ${e.text}`);
    let body = lines.join("\n");
    if (body.length > 3200) body = body.slice(0, 3200) + "\n...";
    return (
        `📝 *Субтитры (${entries.length} записей):*\n\n${body}\n\n` +
        `✏️ Чтобы изменить, отправьте:\n\`<номер> <новый текст>\`\n\n` +
        `Например: \`3 Новый текст субтитра\``
    );
}

function subEditKb() {
    return inlineKb([
        [{ text: "🎬 Пересобрать видео", callback_data: "sub_rebuild" }],
        [{ text: "❌ Закрыть", callback_data: "sub_close" }],
    ]);
}

function getVideoSession(chatId) {
    if (!videoSessions.has(chatId)) videoSessions.set(chatId, videoState(chatId));
    return videoSessions.get(chatId);
}

// ─── Inline Keyboard Builders ──────────────────────────────────────────────────

function inlineKb(rows) {
    return { reply_markup: JSON.stringify({ inline_keyboard: rows }) };
}

function videoKb(step) {
    if (step === 1) {
        // Themes — 2-column grid + custom + back
        const rows = [];
        const entries = Object.entries(videoThemes);
        for (let i = 0; i < entries.length; i += 2) {
            const row = [{ text: entries[i][1], callback_data: `vid_theme_${entries[i][0]}` }];
            if (i + 1 < entries.length) row.push({ text: entries[i + 1][1], callback_data: `vid_theme_${entries[i + 1][0]}` });
            rows.push(row);
        }
        rows.push([{ text: "✏️ Свой текст / тема", callback_data: "vid_custom" }]);
        rows.push([{ text: "🔙 Назад в меню", callback_data: "vid_back_menu" }]);
        return inlineKb(rows);
    }
    if (step === 2) {
        const rows = [];
        const entries = Object.entries(videoLangs);
        for (let i = 0; i < entries.length; i += 2) {
            const row = [{ text: entries[i][1], callback_data: `vid_lang_${entries[i][0]}` }];
            if (i + 1 < entries.length) row.push({ text: entries[i + 1][1], callback_data: `vid_lang_${entries[i + 1][0]}` });
            rows.push(row);
        }
        rows.push([{ text: "◀️ Назад", callback_data: "vid_back" }]);
        return inlineKb(rows);
    }
    if (step === 3) {
        return inlineKb([
            [{ text: "📱 9:16 — Reels / TikTok / Shorts", callback_data: "vid_fmt_9:16" }],
            [{ text: "🖥️ 16:9 — YouTube (горизонтальное)", callback_data: "vid_fmt_16:9" }],
            [{ text: "◀️ Назад", callback_data: "vid_back" }],
        ]);
    }
    if (step === 4) {
        return inlineKb([
            [{ text: "⏱ 15 сек — Short", callback_data: "vid_dur_15" }],
            [{ text: "⏱ 30 сек — Medium", callback_data: "vid_dur_30" }],
            [{ text: "⏱ 60 сек — Standard", callback_data: "vid_dur_60" }],
            [{ text: "⏱ 90 сек — Long", callback_data: "vid_dur_90" }],
            [{ text: "◀️ Назад", callback_data: "vid_back" }],
        ]);
    }
    if (step === 5) {
        const rows = [];
        const entries = Object.entries(videoStyles);
        for (let i = 0; i < entries.length; i += 2) {
            const row = [{ text: entries[i][1], callback_data: `vid_style_${entries[i][0]}` }];
            if (i + 1 < entries.length) row.push({ text: entries[i + 1][1], callback_data: `vid_style_${entries[i + 1][0]}` });
            rows.push(row);
        }
        rows.push([{ text: "◀️ Назад", callback_data: "vid_back" }]);
        return inlineKb(rows);
    }
    if (step === 6) {
        const rows = [];
        const entries = Object.entries(videoMusic);
        for (let i = 0; i < entries.length; i += 2) {
            const row = [{ text: entries[i][1], callback_data: `vid_music_${entries[i][0]}` }];
            if (i + 1 < entries.length) row.push({ text: entries[i + 1][1], callback_data: `vid_music_${entries[i + 1][0]}` });
            rows.push(row);
        }
        rows.push([{ text: "◀️ Назад", callback_data: "vid_back" }]);
        return inlineKb(rows);
    }
    if (step === 7) {
        return inlineKb([
            [{ text: "🎲 Случайный голос", callback_data: "vid_voice_random" }],
            [{ text: "🎙 Ava (Female)", callback_data: "vid_voice_ava" }],
            [{ text: "🎙 Andrew (Male)", callback_data: "vid_voice_andrew" }],
            [{ text: "◀️ Назад", callback_data: "vid_back" }],
        ]);
    }
    if (step === 8) {
        return inlineKb([
            [{ text: "🚀 Сгенерировать видео!", callback_data: "vid_go" }],
            [{ text: "🔄 Начать заново", callback_data: "vid_reset" }],
            [{ text: "◀️ Назад", callback_data: "vid_back" }],
        ]);
    }
    return null;
}

function videoStepLabel(step) {
    return ["", "🎯 Тема", "🌐 Язык", "📐 Формат", "⏱ Длительность",
            "🎨 Стиль", "🎵 Музыка", "🎙 Голос", "✅ Подтверждение"][step] || `Шаг ${step}`;
}

function videoSummary(s) {
    return (
        `📋 *Сводка видео:*\n\n` +
        `🎯 Тема: *${videoThemes[s.theme] || s.customText || "—" }*\n` +
        `🌐 Язык: *${videoLangs[s.lang] || s.lang}*\n` +
        `📐 Формат: *${s.format}*\n` +
        `⏱ Длительность: *${s.duration} сек*\n` +
        `🎨 Стиль: *${videoStyles[s.style] || s.style}*\n` +
        `🎵 Музыка: *${videoMusic[s.music] || s.music}*\n` +
        `🎙 Голос: *${s.voiceId || "случайный"}*`
    );
}

function videoStepMessage(step) {
    return {
        1: "🎬 *Генератор видео VidRush*\n\nПошагово настроим видео. Выберите тему:",
        2: `🎬 *Видеогенератор — ${videoStepLabel(2)}*\n\nВыберите язык озвучки и субтитров:`,
        3: `🎬 *Видеогенератор — ${videoStepLabel(3)}*\n\nВыберите формат видео:`,
        4: `🎬 *Видеогенератор — ${videoStepLabel(4)}*\n\nВыберите длительность:`,
        5: `🎬 *Видеогенератор — ${videoStepLabel(5)}*\n\nВыберите стиль изображений:`,
        6: `🎬 *Видеогенератор — ${videoStepLabel(6)}*\n\nВыберите фоновую музыку:`,
        7: `🎬 *Видеогенератор — ${videoStepLabel(7)}*\n\nВыберите голос озвучки:`,
        8: null, // summary rendered in renderVideoStep
    }[step];
}

async function sendVideoStep(chatId, step, extraText) {
    const s = getVideoSession(chatId);
    let text = videoStepMessage(step) || "";
    if (extraText) text = extraText;
    const kb = videoKb(step);

    // Edit existing message if we have msgId, otherwise send new
    if (s.msgId) {
        try {
            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: s.msgId,
                parse_mode: "Markdown",
                ...kb,
            });
            return;
        } catch (err) {
            // edit failed (message too old / 400 / deleted) — send new one
            console.error("editMessageText failed:", err.message);
            s.msgId = null;
        }
    }
    const msg = await bot.sendMessage(chatId, text, { parse_mode: "Markdown", ...kb });
    s.msgId = msg.message_id;
}

async function startVideoWizard(chatId) {
    videoSessions.delete(chatId);
    const s = getVideoSession(chatId);
    s.step = 1;
    const msg = await bot.sendMessage(
        chatId,
        "🎬 *Генератор видео VidRush*\n\n" +
        "AI сгенерирует сценарий, картинки, озвучку и субтитры.\n\n" +
        "Выберите тему:",
        { parse_mode: "Markdown", ...videoKb(1) }
    );
    s.msgId = msg.message_id;
}

// ─── Callback Query Router ─────────────────────────────────────────────────────

// ─── Auto-restart on crash ───────────────────────────────────────────────────

function startBot() {
    bot.on("polling_error", (err) => {
        console.error("⚠️ Polling error:", err.message);
    });

    bot.on("error", (err) => {
        console.error("⚠️ Bot error:", err.message);
    });
}

startBot();

// ─── Callback Query Router ─────────────────────────────────────────────────────

bot.on("callback_query", async (query) => {
    try {
        const chatId = query.message?.chat.id;
        const msgId = query.message?.message_id;
        const data = query.data;
        if (!chatId || !data) return;

        // Answer immediately (remove loading state)
        await bot.answerCallbackQuery(query.id).catch(() => {});

    const s = getVideoSession(chatId);

    // ── BACK navigation ──
    if (data === "vid_back_menu") {
        videoSessions.delete(chatId);
        await bot.editMessageText("❌ Видеогенерация отменена.", {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "Markdown",
            ...mainKb(),
        });
        return;
    }
    if (data === "vid_back") {
        if (s.step > 1) {
            s.step--;
            await sendVideoStep(chatId, s.step);
        }
        return;
    }

    // ── STEP 1: Theme ──
    if (data === "vid_custom") {
        s.step = 99;
        if (s.msgId) {
            await bot.editMessageText(
                "✏️ Напишите свою тему или готовый текст для видео.\n\n" +
                "Пример: `\"Технологии будущего 2050\"`",
                chatId, s.msgId, { parse_mode: "Markdown" }
            );
        } else {
            const msg = await bot.sendMessage(chatId,
                "✏️ Напишите свою тему или готовый текст для видео.\n\n" +
                "Пример: `\"Технологии будущего 2050\"`",
                { parse_mode: "Markdown" }
            );
            s.msgId = msg.message_id;
        }
        return;
    }
    if (data.startsWith("vid_theme_")) {
        s.theme = data.replace("vid_theme_", "");
        s.customText = null;
        s.step = 2;
        await sendVideoStep(chatId, 2);
        return;
    }

    // ── STEP 2: Language ──
    if (data.startsWith("vid_lang_")) {
        s.lang = data.replace("vid_lang_", "");
        s.step = 3;
        await sendVideoStep(chatId, 3);
        return;
    }

    // ── STEP 3: Format ──
    if (data.startsWith("vid_fmt_")) {
        s.format = data.replace("vid_fmt_", "");
        s.step = 4;
        await sendVideoStep(chatId, 4);
        return;
    }

    // ── STEP 4: Duration ──
    if (data.startsWith("vid_dur_")) {
        s.duration = parseInt(data.replace("vid_dur_", ""), 10);
        s.step = 5;
        await sendVideoStep(chatId, 5);
        return;
    }

    // ── STEP 5: Style ──
    if (data.startsWith("vid_style_")) {
        s.style = data.replace("vid_style_", "");
        s.step = 6;
        await sendVideoStep(chatId, 6);
        return;
    }

    // ── STEP 6: Music ──
    if (data.startsWith("vid_music_")) {
        s.music = data.replace("vid_music_", "");
        s.step = 7;
        await sendVideoStep(chatId, 7);
        return;
    }

    // ── STEP 7: Voice ──
    if (data === "vid_voice_random") {
        const voices = await getVoiceList();
        s.voiceId = voices.length > 0
            ? voices[Math.floor(Math.random() * voices.length)]
            : "random";
        s.step = 8;
        await sendVideoStep(chatId, 8, videoSummary(s));
        return;
    }
    if (data === "vid_voice_ava") { s.voiceId = "ava"; s.step = 8; await sendVideoStep(chatId, 8, videoSummary(s)); return; }
    if (data === "vid_voice_andrew") { s.voiceId = "andrew"; s.step = 8; await sendVideoStep(chatId, 8, videoSummary(s)); return; }

    // ── STEP 8: Confirm ──
    if (data === "vid_reset") {
        videoSessions.delete(chatId);
        await startVideoWizard(chatId);
        return;
    }
    if (data === "vid_go") {
        s.step = 9;
        await renderVideo(chatId, s);
        return;
    }

    // ── BACK from vid_start_new ──
    if (data === "vid_start_new") {
        editSessions.delete(chatId);
        await startVideoWizard(chatId);
        return;
    }

    // ── SUBTITLE EDITING ──
    if (data === "sub_open") {
        const es = editSessions.get(chatId);
        if (!es) { await bot.answerCallbackQuery(query.id, { text: "Сессия истекла." }); return; }
        const text = subtitleListText(es.entries);
        const sentMsg = await bot.sendMessage(chatId, text, { parse_mode: "Markdown", ...subEditKb() });
        es.msgId = sentMsg.message_id;
        return;
    }

    if (data === "sub_close") {
        editSessions.delete(chatId);
        await bot.editMessageText(
            "❌ Редактирование субтитров закрыто.",
            { chat_id: chatId, message_id: msgId }
        );
        return;
    }

    if (data === "sub_rebuild") {
        const es = editSessions.get(chatId);
        if (!es) { await bot.answerCallbackQuery(query.id, { text: "Сессия истекла." }); return; }

        await bot.editMessageText(
            "⏳ *Пересобираю видео с новыми субтитрами...*\n\nЭто займёт ~30–60 секунд.",
            { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" }
        );

        await rerenderWithSubtitles(chatId, es, msgId);
        return;
    }

    } catch (err) {
        console.error("Callback error:", err.message);
    }
});

// ─── Text Input During Wizard (Custom Text) + Subtitle Editing ────────────────

bot.on("message", async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        if (!text) return;

        const s = videoSessions.get(chatId);
        if (s && s.step === 99) {
            s.customText = text;
            s.theme = "custom";
            s.step = 2;
            await sendVideoStep(chatId, 2);
            return;
        }

        // ── Subtitle edit input: "<number> <new text>" ──
        const es = editSessions.get(chatId);
        if (es && es.msgId) {
            const match = text.match(/^(\d+)\s+(.+)$/s);
            if (match) {
                const idx = parseInt(match[1], 10) - 1;
                const newText = match[2].trim();
                if (idx >= 0 && idx < es.entries.length) {
                    es.entries[idx].text = newText;
                    const updatedText = subtitleListText(es.entries);
                    try {
                        await bot.editMessageText(updatedText, {
                            chat_id: chatId,
                            message_id: es.msgId,
                            parse_mode: "Markdown",
                            ...subEditKb(),
                        });
                    } catch { /* message unchanged if text identical */ }
                    await bot.sendMessage(chatId, `✅ Субтитр ${idx + 1} обновлён.`);
                } else {
                    await bot.sendMessage(chatId, `❌ Номер ${idx + 1} не существует. Всего субтитров: ${es.entries.length}`);
                }
                return;
            }
        }
    } catch (err) {
        console.error("Message handler error:", err.message);
    }
});

// ─── Subtitle Re-render ────────────────────────────────────────────────────────

async function rerenderWithSubtitles(chatId, es, statusMsgId) {
    let outputVideo = null;
    try {
        // Write updated SRT to disk
        const srtPath = `${es.sessionDir}/subtitles.srt`;
        await writeFile(srtPath, formatSrtContent(es.entries), "utf-8");

        // Run Python rerender_subs
        const result = await runPython("video_gen.py", [
            "rerender_subs",
            es.sessionDir,
            es.format,
            es.music,
            `${es.sessionDir}/output_edited.mp4`,
        ]);

        const successIdx = result.indexOf("SUCCESS:");
        if (successIdx === -1) throw new Error(result);
        outputVideo = result.slice(successIdx + 8).trim().split("\n")[0].trim();

        await bot.sendChatAction(chatId, "upload_video");
        await bot.sendVideo(chatId, outputVideo, {
            caption: "🎬 *Видео с обновлёнными субтитрами*",
            parse_mode: "Markdown",
        });

        if (statusMsgId) {
            await bot.editMessageText("✅ *Готово!* Видео пересобрано с новыми субтитрами.", {
                chat_id: chatId,
                message_id: statusMsgId,
                parse_mode: "Markdown",
            }).catch(() => {});
        }
        editSessions.delete(chatId);

    } catch (err) {
        console.error(`[Rerender] ERROR: ${err.message}`);
        await bot.sendMessage(chatId,
            `❌ *Ошибка пересборки*\n\n\`${err.message.slice(0, 200)}\``,
            { parse_mode: "Markdown" }
        ).catch(() => {});
    } finally {
        if (outputVideo) { try { await unlink(outputVideo); } catch {} }
    }
}

// ─── Video Rendering ───────────────────────────────────────────────────────────

const PROGRESS_STEPS = [
    "⏳ Шаг 1/5: Генерация сценария...",
    "🎨 Шаг 2/5: Создание изображений...",
    "🔊 Шаг 3/5: Озвучка голосом...",
    "💬 Шаг 4/5: Субтитры...",
    "🎬 Шаг 5/5: Сборка видео...",
];

async function renderVideo(chatId, s) {
    const sessionDir = join(VIDEO_DIR, `${chatId}_${Date.now()}`);
    let currentMsgId = null;
    let tempVideo = null;

    console.log(`[VideoRender] Starting for chat ${chatId}, theme=${s.theme}, duration=${s.duration}s`);

    try {
        // ── Step 1: Send start message ──
        const startMsg = await bot.sendMessage(
            chatId,
            `🚀 *Генерация видео началась!*\n\n` +
            `Это займёт 1-3 минуты.\n` +
            `${PROGRESS_STEPS[0]}`,
            { parse_mode: "Markdown" }
        );
        currentMsgId = startMsg.message_id;
        console.log(`[VideoRender] Start message sent, msgId=${currentMsgId}`);

        const topic = s.theme === "custom" ? s.customText : s.theme;

        // ── Progress updater helper ──
        const updateProgress = async (stepIdx) => {
            if (stepIdx < PROGRESS_STEPS.length) {
                try {
                    await bot.editMessageText(
                        `${PROGRESS_STEPS[stepIdx]}\n\n_Ожидайте, не закрывайте чат..._`,
                        {
                            chat_id: chatId,
                            message_id: currentMsgId,
                            parse_mode: "Markdown",
                            reply_markup: JSON.stringify({
                                inline_keyboard: [[{ text: "⏳ Идёт генерация...", callback_data: "vid_nop" }]],
                            }),
                        }
                    );
                } catch (e) {
                    console.error(`[VideoRender] editMessageText failed: ${e.message}`);
                }
            }
        };

        await updateProgress(1);
        console.log(`[VideoRender] Calling Python render...`);

        // ── Step 2: Run Python pipeline ──
        const result = await runPython("video_gen.py", [
            "render",
            chatId.toString(),
            topic,
            s.lang,
            s.format,
            s.duration.toString(),
            s.style,
            s.music,
            s.voiceId || "random",
            sessionDir,
        ]);
        console.log(`[VideoRender] Python finished, result: ${result.substring(0, 50)}...`);

        // Extract SUCCESS path — look for "SUCCESS:" anywhere in the output (logs may precede it)
        const successIdx = result.indexOf("SUCCESS:");
        if (successIdx === -1) {
            throw new Error(result);
        }

        tempVideo = result.slice(successIdx + 8).trim().split("\n")[0].trim();
        console.log(`[VideoRender] Video at: ${tempVideo}`);

        await updateProgress(4);
        console.log(`[VideoRender] Sending video to user...`);

        // ── Step 3: Send video ──
        await bot.sendChatAction(chatId, "upload_video");
        await bot.sendVideo(chatId, tempVideo, {
            caption: `🎬 *${videoThemes[s.theme] || s.customText || "Видео"}*\n\n` +
                     `🌐 ${s.lang} · 📐 ${s.format} · ⏱ ${s.duration}с · 🎨 ${s.style}`,
            parse_mode: "Markdown",
        });

        // ── Step 4: Done — store edit session, offer subtitle editing ──
        let srtEntries = [];
        const srtFilePath = `${sessionDir}/subtitles.srt`;
        try {
            const srtContent = await readFile(srtFilePath, "utf-8");
            srtEntries = parseSrtContent(srtContent);
        } catch { /* no SRT generated */ }

        if (srtEntries.length > 0) {
            editSessions.set(chatId, {
                sessionDir,
                format: s.format,
                music: s.music,
                entries: srtEntries,
                msgId: null,
            });
        }

        await bot.editMessageText(
            "✅ *Видео готово!*\n\nХотите создать ещё или отредактировать субтитры?",
            {
                chat_id: chatId,
                message_id: currentMsgId,
                parse_mode: "Markdown",
                reply_markup: JSON.stringify({ inline_keyboard: [
                    ...(srtEntries.length > 0
                        ? [[{ text: "✏️ Редактировать субтитры", callback_data: "sub_open" }]]
                        : []),
                    [{ text: "🎬 Ещё видео", callback_data: "vid_start_new" }],
                ]}),
            }
        );
        console.log(`[VideoRender] Done!`);
        videoSessions.delete(chatId);

    } catch (err) {
        console.error(`[VideoRender] ERROR: ${err.message}`);

        // ── Send error message to user (always use sendMessage, editMessageText doesn't support reply keyboards) ──
        let errorText = err.message.length > 100
            ? `❌ *Ошибка генерации*\n\n\`${err.message.substring(0, 100)}...\``
            : `❌ *Ошибка генерации*\n\n\`${err.message}\``;

        try {
            await bot.sendMessage(chatId, errorText, { parse_mode: "Markdown", ...mainKb() });
        } catch (e2) {
            console.error(`[VideoRender] Failed to send error: ${e2.message}`);
            try {
                await bot.sendMessage(chatId, "❌ Ошибка генерации видео. Попробуйте /video.", mainKb());
            } catch {}
        }
        videoSessions.delete(chatId);

    } finally {
        if (tempVideo) { try { await unlink(tempVideo); } catch {} }
        try { await unlink(sessionDir); } catch {}
    }
}

// ─── Keyboard Builders ─────────────────────────────────────────────────────────

function mainKb() {
    return {
        reply_markup: JSON.stringify({
            keyboard: [
                [{ text: "🎨 Генерация изображений" }],
                [{ text: "🎬 Создать видео" }],
                [{ text: "🎙 Клонировать голос" }],
                [{ text: "🔊 Озвучить текст" }],
                [{ text: "📋 Мои голоса" }],
            ],
            resize_keyboard: true,
        }),
    };
}

function voiceSelectKb(voices) {
    if (voices.length === 0) return null;
    return {
        reply_markup: JSON.stringify({
            keyboard: voices.map((v) => [{ text: `🎭 ${v}` }]).concat([[{ text: "🔙 Назад" }]]),
            resize_keyboard: true,
        }),
    };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId,
        "👋 Привет! Я бот, который умеет:\n\n" +
        "🎨 *Генерация изображений* — пришлите текст\n" +
        "🎬 *Создание видео* — AI генерирует сценарий, картинки, озвучку и субтитры\n" +
        "🎙 *Клонирование голоса* — пришлите голосовое (3-10 сек)\n" +
        "🔊 *Озвучка текста* — выберите голос и напишите текст\n\n" +
        "Выберите действие:",
        { parse_mode: "Markdown", ...mainKb() }
    );
});

bot.onText(/\/video/, async (msg) => {
    await startVideoWizard(msg.chat.id);
});

bot.onText(/🎬 Создать видео/, async (msg) => {
    await startVideoWizard(msg.chat.id);
});

// ── Image Generation ────────────────────────────────────────────────────────

bot.onText(/Генерация изображений/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "✏️ Напишите текстовый запрос для генерации изображения:");
});

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text) return;

    // Skip menu items and commands (video wizard handled by callback_query above)
    if (text.startsWith("/") || [
        "🎨 Генерация изображений",
        "🎬 Создать видео",
        "🎙 Клонировать голос",
        "🔊 Озвучить текст",
        "📋 Мои голоса",
        "🔙 Назад",
    ].includes(text)) return;

    // Skip if in video wizard (text-only input only happens at step 99, handled above)
    const s = videoSessions.get(chatId);
    if (s && s.step > 0 && s.step !== 99) return;

    let tempFile = null;
    try {
        await bot.sendChatAction(chatId, "upload_photo");
        const result = await openai.images.generate({
            model: "dall-e-3", prompt: text, size: "1024x1024", style: "vivid",
        });
        const imageBuffer = await downloadUrl(result.data[0].url);
        tempFile = join(tmpdir(), `generated_${Date.now()}.png`);
        await writeFile(tempFile, imageBuffer);
        await bot.sendPhoto(chatId, tempFile);
    } catch (err) {
        console.error("Image generation failed:", err);
        const errorMsg = err?.code === "billing_hard_limit_reached"
            ? "❌ На аккаунте OpenAI закончились средства. Пополните баланс на platform.openai.com"
            : `❌ Ошибка: ${err?.message || "неизвестная ошибка"}`;
        await bot.sendMessage(chatId, errorMsg);
    } finally {
        if (tempFile) { try { await unlink(tempFile); } catch {} }
    }
});

// ── Voice Cloning ───────────────────────────────────────────────────────────

bot.onText(/🎙 Клонировать голос/, async (msg) => {
    await bot.sendMessage(msg.chat.id,
        "🎙 *Клонирование голоса*\n\n" +
        "Пришлите голосовое сообщение (3-10 секунд) с голосом, который хотите клонировать.\n\n" +
        "После этого вы сможете озвучивать любой текст этим голосом!",
        { parse_mode: "Markdown" }
    );
});

bot.onText(/📋 Мои голоса/, async (msg) => {
    const chatId = msg.chat.id;
    const voices = await getVoiceList();
    if (voices.length === 0) {
        await bot.sendMessage(chatId, "📭 У вас пока нет клонированных голосов.\nСначала пришлите голосовое сообщение для клонирования.", mainKb());
        return;
    }
    await bot.sendMessage(chatId,
        `📋 *Ваши клонированные голоса:*\n\n${voices.map((v) => `🎭 ${escapeHtml(v)}`).join("\n")}\n\nЧтобы озвучить текст — выберите "🔊 Озвучить текст"`,
        { parse_mode: "Markdown", ...voiceSelectKb(voices) }
    );
});

bot.onText(/🔊 Озвучить текст/, async (msg) => {
    const chatId = msg.chat.id;
    const voices = await getVoiceList();
    if (voices.length === 0) {
        await bot.sendMessage(chatId, "📭 Сначала нужно клонировать голос!\nПришлите голосовое сообщение (3-10 сек).", mainKb());
        return;
    }
    await bot.sendMessage(chatId,
        "🔊 *Озвучка текста*\n\n" +
        `У вас ${voices.length} клонированный(ых) голос(ов):\n${voices.map((v) => `🎭 ${v}`).join("\n")}\n\n` +
        "Напишите имя голоса и текст. Например: `женя привет как дела`",
        { parse_mode: "Markdown", ...voiceSelectKb(voices) }
    );
});

// ── Voice Message (Clone) ───────────────────────────────────────────────────

bot.on("voice", async (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from?.first_name || `user_${chatId}`;
    await bot.sendMessage(chatId, "🎙 Получил голосовое! Клонирую...");

    let tempOgg = null, tempWav = null;
    try {
        const oggBuffer = await downloadFile(msg.voice.file_id);
        tempOgg = join(tmpdir(), `voice_${Date.now()}.ogg`);
        await writeFile(tempOgg, oggBuffer);
        tempWav = join(tmpdir(), `voice_${Date.now()}.wav`);
        await runPython("convert.py", [tempOgg, tempWav]);

        const voiceId = `${userName}_${Date.now()}`;
        await runPython("voice_clone.py", ["clone", tempWav, voiceId]);

        await bot.sendMessage(chatId,
            `✅ Голос успешно клонирован!\n\n🎭 ID: *${voiceId}*\n\nТеперь напишите текст, и я озвучу его этим голосом!`,
            { parse_mode: "Markdown", ...mainKb() }
        );

        const sampleFile = join(VOICES_DIR, `${voiceId}.wav`);
        await bot.sendVoice(chatId, sampleFile, { caption: "🎧 Этот голос теперь доступен для озвучки!" });

    } catch (err) {
        console.error("Voice cloning failed:", err);
        await bot.sendMessage(chatId,
            `❌ Ошибка клонирования: ${err?.message || "неизвестная ошибка"}\n\nПопробуйте другое голосовое (3-10 сек, хорошее качество).`
        );
    } finally {
        for (const f of [tempOgg, tempWav]) { if (f) { try { await unlink(f); } catch {} } }
    }
});

// ── Synthesize Text ─────────────────────────────────────────────────────────

bot.on("message", async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        if (!text) return;

        if (text.startsWith("/") || [
            "🎨 Генерация изображений", "🎬 Создать видео",
            "🎙 Клонировать голос", "🔊 Озвучить текст", "📋 Мои голоса", "🔙 Назад",
        ].includes(text)) return;

        // Skip if in video wizard
        const vs = videoSessions.get(chatId);
        if (vs && vs.step > 0) return;

        const voices = await getVoiceList();
        const matchedVoice = voices.find((v) => text.toLowerCase().startsWith(v.toLowerCase()));
        if (!matchedVoice) return; // Let image generation handle it

        const remainingText = text.slice(matchedVoice.length).trim();
        if (!remainingText) {
            await bot.sendMessage(chatId, `🎭 Выбран голос *${matchedVoice}*, но текст пустой. Напишите что озвучить:`,
                { parse_mode: "Markdown" });
            return;
        }

        let tempOut = null;
        try {
            await bot.sendChatAction(chatId, "upload_audio");
            await bot.sendMessage(chatId, `🔊 Озвучиваю голосом *${matchedVoice}*...`, { parse_mode: "Markdown" });
            tempOut = join(tmpdir(), `speech_${Date.now()}.wav`);
            await runPython("voice_clone.py", ["synth", matchedVoice, remainingText, tempOut]);
            await bot.sendVoice(chatId, tempOut, {
                caption: `🎭 Голос: ${matchedVoice}\n📝 Текст: ${remainingText.slice(0, 100)}${remainingText.length > 100 ? "..." : ""}`,
            });
        } catch (err) {
            console.error("Synthesis failed:", err);
            await bot.sendMessage(chatId, `❌ Ошибка озвучки: ${err?.message || "неизвестная ошибка"}`);
        } finally {
            if (tempOut) { try { await unlink(tempOut); } catch {} }
        }
    } catch (err) {
        console.error("Message handler error:", err.message);
    }
});

// ─── Keep-alive: restart on unexpected crash ──────────────────────────────────

process.on("uncaughtException", (err) => {
    console.error("⚠️ Uncaught exception:", err.message);
    console.log("🔄 Restarting bot in 5 seconds...");
    setTimeout(() => {
        spawn("node", ["--env-file=.env", "bot.js"], {
            cwd: PROJECT_ROOT,
            detached: true,
            stdio: "inherit",
        }).unref();
        process.exit(1);
    }, 5000);
});

process.on("unhandledRejection", (err) => {
    console.error("⚠️ Unhandled rejection:", err);
});

console.log("🤖 Bot is running...");
