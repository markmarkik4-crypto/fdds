import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { mkdir } from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const VIDEO_DIR = process.env.VIDEO_DIR || path.join(PROJECT_ROOT, "videos");

let CONFIG = { langs: [], themes: [], styles: [], music: [] };
try {
    const raw = readFileSync(path.join(PROJECT_ROOT, "config.json"), "utf8");
    CONFIG = JSON.parse(raw);
    if (!CONFIG.langs) CONFIG.langs = [];
    if (!CONFIG.themes) CONFIG.themes = [];
    if (!CONFIG.styles) CONFIG.styles = [];
    if (!CONFIG.music) CONFIG.music = [];
} catch (e) {}

const jobs = new Map();

function stripLeadingEmoji(text) {
    return String(text || "").replace(/^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\s*(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*\s*/u, "").trim();
}

function humanizePromptValue(value) {
    const raw = String(value || "").trim().replace(/^["']|["']$/g, "");
    if (!raw) return "";
    if (/^[a-zA-Z0-9_-]+$/.test(raw) && raw.includes("_")) {
        return raw.replaceAll("_", " ").trim();
    }
    return stripLeadingEmoji(raw);
}

function resolveTheme(themeValue) {
    const raw = String(themeValue || "").trim();
    if (!raw) return null;
    const match = (CONFIG.themes || []).find((theme) =>
        theme.id === raw ||
        stripLeadingEmoji(theme.label) === stripLeadingEmoji(raw)
    );
    if (!match) return null;
    return {
        id: match.id,
        label: stripLeadingEmoji(match.label),
        raw: match,
    };
}

function resolveSubtopic(theme, subtopicValue) {
    const raw = String(subtopicValue || "").trim();
    if (!raw || !theme?.raw?.subtopics) return null;
    const match = theme.raw.subtopics.find((subtopic) =>
        subtopic.id === raw ||
        stripLeadingEmoji(subtopic.label) === stripLeadingEmoji(raw)
    );
    if (!match) return null;
    return {
        id: match.id,
        label: stripLeadingEmoji(match.label),
        raw: match,
    };
}

function readJsonSafe(filePath) {
    try {
        if (!existsSync(filePath)) return null;
        return JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

function getJobDir(jobId) {
    return path.join(VIDEO_DIR, `job_${jobId}`);
}

function getJobVideoPath(jobId) {
    const jobDir = getJobDir(jobId);
    if (!existsSync(jobDir)) return null;
    try {
        const files = fs.readdirSync(jobDir);
        const mp4 = files.find(f => f.endsWith(".mp4"));
        return mp4 ? path.join(jobDir, mp4) : null;
    } catch {
        return null;
    }
}

function getStoredJob(jobId) {
    const liveJob = jobs.get(jobId);
    const jobDir = getJobDir(jobId);
    const scriptPath = path.join(jobDir, "script.json");
    const script = readJsonSafe(scriptPath);
    const videoPath = liveJob?.videoPath || getJobVideoPath(jobId);

    if (!liveJob && !existsSync(jobDir) && !script && !videoPath) return null;

    const createdStatPath = videoPath || scriptPath || (existsSync(jobDir) ? jobDir : null);
    let createdAt = Date.now();
    if (createdStatPath) {
        try {
            createdAt = fs.statSync(createdStatPath).mtimeMs || createdAt;
        } catch {}
    }

    const sceneDurations = Array.isArray(script?.scenes)
        ? script.scenes.reduce((sum, scene) => sum + Number(scene?.duration || 0), 0)
        : 0;

    const stored = {
        jobId,
        status: liveJob?.status || (videoPath ? "done" : "draft"),
        progress: liveJob?.progress ?? (videoPath ? 100 : 0),
        step: liveJob?.step || (videoPath ? "Готово!" : ""),
        topic: liveJob?.topic || script?.topic || script?.title || "",
        topicLabel: liveJob?.topicLabel || script?.title || script?.topic || jobId,
        langLabel: liveJob?.langLabel || script?.lang || "",
        styleLabel: liveJob?.styleLabel || script?.style || "",
        format: liveJob?.format || script?.format || "9:16",
        duration: Number(liveJob?.duration || script?.duration || sceneDurations || 60),
        lang: liveJob?.lang || script?.lang || "ru",
        style: liveJob?.style || liveJob?.styleLabel || script?.style || "cinematic",
        voice: liveJob?.voice || script?.voice || "alloy",
        music: liveJob?.music || script?.music || "none",
        ttsSpeed: Number(liveJob?.ttsSpeed || script?.ttsSpeed || 1.0),
        ttsInstructions: liveJob?.ttsInstructions || script?.ttsInstructions || "",
        storyStyle: liveJob?.storyStyle || script?.storyStyle || "intrigue",
        captionSettings: liveJob?.captionSettings || script?.cap || {},
        videoPath: videoPath || null,
        createdAt,
        error: liveJob?.error || null,
        script,
        scriptPath,
        jobDir,
    };

    return stored;
}

function copySceneImages(fromDir, toDir) {
    if (!existsSync(fromDir)) return;
    try {
        const files = fs.readdirSync(fromDir).filter(name => /^scene_\d+\.png$/.test(name));
        for (const file of files) {
            fs.copyFileSync(path.join(fromDir, file), path.join(toDir, file));
        }
    } catch {}
}

// ─── SSE streaming status ───────────────────────────────────────────────────────
function sendSSE(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function startSSE(jobId, res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const job = jobs.get(jobId);
    if (job) sendSSE(res, job);
    else { sendSSE(res, { status: "not_found" }); res.end(); return; }

    const interval = setInterval(() => {
        const j = jobs.get(jobId);
        if (!j) { sendSSE(res, { status: "not_found" }); clearInterval(interval); res.end(); return; }
        sendSSE(res, j);
        if (j.status === "done" || j.status === "error") { clearInterval(interval); res.end(); }
    }, 500);
    res.on("close", () => clearInterval(interval));
}

// ─── JSON response helpers ──────────────────────────────────────────────────────
function json(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

// ─── Parse POST body ────────────────────────────────────────────────────────────
function parseBody(req) {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve(body); }
        });
    });
}

// ─── Serve static file ─────────────────────────────────────────────────────────
function serveFile(res, filePath, mime) {
    if (!existsSync(filePath)) { json(res, 404, { error: "File not found" }); return; }
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(filePath).pipe(res);
}

function serveVideoStream(req, res, filePath) {
    if (!filePath || !existsSync(filePath)) { json(res, 404, { error: "Video not found" }); return; }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        const start = match?.[1] ? Number(match[1]) : 0;
        const end = match?.[2] ? Number(match[2]) : fileSize - 1;
        const safeStart = Number.isFinite(start) ? Math.max(0, Math.min(start, fileSize - 1)) : 0;
        const safeEnd = Number.isFinite(end) ? Math.max(safeStart, Math.min(end, fileSize - 1)) : fileSize - 1;
        const chunkSize = safeEnd - safeStart + 1;

        res.writeHead(206, {
            "Content-Type": "video/mp4",
            "Content-Length": chunkSize,
            "Content-Range": `bytes ${safeStart}-${safeEnd}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400",
        });
        fs.createReadStream(filePath, { start: safeStart, end: safeEnd }).pipe(res);
        return;
    }

    res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
    });
    fs.createReadStream(filePath).pipe(res);
}

// ─── Router ──────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = req.url.split("?")[0];
    const method = req.method;
    const parts = url.split("/").filter(Boolean);

    try {
        // GET /api/config
        if (url === "/api/config" && method === "GET") {
            json(res, 200, CONFIG); return;
        }

        // GET /api/health
        if (url === "/api/health" && method === "GET") {
            json(res, 200, { ok: true, service: "vidrush", timestamp: Date.now() }); return;
        }

        // GET /api/jobs
        if (url === "/api/jobs" && method === "GET") {
            const result = [];
            try {
                const dirs = fs.readdirSync(VIDEO_DIR);
                for (const dir of dirs) {
                    if (!dir.startsWith("job_")) continue;
                    const jobId = dir.replace("job_", "");
                    const job = getStoredJob(jobId);
                    if (!job?.videoPath) continue;
                    result.push({
                        jobId,
                        topic: job.topic || "",
                        topicLabel: job.topicLabel || jobId,
                        langLabel: job.langLabel || "",
                        styleLabel: job.styleLabel || "",
                        format: job.format || "9:16",
                        createdAt: job.createdAt || Date.now(),
                    });
                }
            } catch {}
            result.sort((a, b) => b.createdAt - a.createdAt);
            json(res, 200, result); return;
        }

        // GET /api/status/:jobId
        if (parts[1] === "status" && parts[2] && method === "GET") {
            startSSE(parts[2], res); return;
        }

        // POST /api/prompt-from-categories
        //   body: { genre, subGenre, style }
        //   returns: { prompt: "<english prompt>" }
        if (url === "/api/prompt-from-categories" && method === "POST") {
            const body = await parseBody(req);
            const genre = humanizePromptValue(body.genre || "");
            const subGenre = humanizePromptValue(body.subGenre || body.sub_genre || "");
            const style = humanizePromptValue(body.style || "");
            const details = humanizePromptValue(body.details || "");
            const args = [
                path.join(PROJECT_ROOT, "scripts", "video_gen.py"),
                "prompt_from_categories", genre, subGenre, style, details,
            ];
            const proc = spawn("python3", args, { stdio: "pipe" });
            let stdout = "", stderr = "";
            proc.stdout.on("data", d => { stdout += d.toString(); });
            proc.stderr.on("data", d => { stderr += d.toString(); });
            proc.on("close", code => {
                if (code === 0) {
                    json(res, 200, { prompt: stdout.trim() });
                } else {
                    json(res, 500, { error: (stderr || "prompt_from_categories failed").slice(-500) });
                }
            });
            proc.on("error", err => json(res, 500, { error: err.message }));
            return;
        }

        // POST /api/generate
        if (url === "/api/generate" && method === "POST") {
            const body = await parseBody(req);
            const openAiKey = process.env.OPENAI_API_KEY || "";
            if (!body.theme && !body.customPrompt) { json(res, 400, { error: "Choose topic or enter prompt" }); return; }

            const { theme, customPrompt, lang, format, duration, style, music, voice, ttsSpeed, ttsInstructions, captionSettings, topicHint, subtopic, storyStyle, promptPreview } = body;
            const resolvedTheme = resolveTheme(theme);
            const resolvedSubtopic = resolveSubtopic(resolvedTheme, subtopic);
            const normalizedTheme = resolvedTheme?.label || humanizePromptValue(theme);
            const normalizedSubtopic = resolvedSubtopic?.label || humanizePromptValue(subtopic);
            const normalizedHint = humanizePromptValue(topicHint);
            const topic = typeof customPrompt === "string" && customPrompt.trim()
                ? customPrompt.trim()
                : normalizedTheme;
            const jobId = randomUUID().slice(0, 8);

            jobs.set(jobId, {
                status: "running", progress: 0, step: "Старт...",
                topic, topicLabel: topic, langLabel: lang || "", styleLabel: style || "",
                format: format || "9:16", duration: duration || "60", lang: lang || "en",
                voice: voice || "alloy", music: music || "none",
                ttsSpeed: ttsSpeed || 1.0, ttsInstructions: ttsInstructions || "",
                captionSettings: captionSettings || {},
                videoPath: null, error: null, createdAt: Date.now(),
            });

            const outDir = path.join(VIDEO_DIR, `job_${jobId}`);
            fs.mkdirSync(outDir, { recursive: true });

            const args = [
                path.join(PROJECT_ROOT, "scripts", "video_gen.py"),
                "--api-key", openAiKey,
                "render", jobId, topic,
                lang || "en", format || "9:16", duration || "60",
                style || "cinematic", music || "none", voice || "alloy",
                outDir, normalizedHint || "", JSON.stringify(captionSettings || {}),
                normalizedSubtopic || "", storyStyle || "intrigue",
                String(ttsSpeed || 1.0), ttsInstructions || "",
                promptPreview ? String(promptPreview).trim() : "",
            ];

            const proc = spawn("python3", args, { stdio: "pipe" });
            let stdout = "", stderr = "";
            proc.stdout.on("data", d => { stdout += d.toString(); });
            proc.stderr.on("data", d => { stderr += d.toString(); });
            proc.on("close", code => {
                if (code === 0 && stdout.includes("SUCCESS:")) {
                    const videoPath = stdout.split("SUCCESS:")[1].trim().split("\n")[0];
                    jobs.set(jobId, { ...jobs.get(jobId), status: "done", progress: 100, step: "Готово!", videoPath });
                } else {
                    jobs.set(jobId, { ...jobs.get(jobId), status: "error", step: "Ошибка", error: (stderr || stdout).slice(-500) });
                }
            });
            proc.on("error", err => {
                jobs.set(jobId, { ...jobs.get(jobId), status: "error", step: "Ошибка", error: err.message });
            });

            json(res, 200, { jobId, statusUrl: `/api/status/${jobId}` }); return;
        }

        // GET|HEAD /api/download/:jobId
        if (parts[1] === "download" && parts[2] && (method === "GET" || method === "HEAD")) {
            const jobId = parts[2];
            const job = getStoredJob(jobId);
            const videoPath = job?.videoPath;
            if (!videoPath || !existsSync(videoPath)) { json(res, 404, { error: "Video not found" }); return; }
            const rawName = `video_${job?.topicLabel || job?.topic || jobId}.mp4`;
            const asciiName = `video_${jobId}.mp4`;
            const encodedName = encodeURIComponent(rawName.replace(/["\\]/g, "_"));
            const stat = fs.statSync(videoPath);
            res.writeHead(200, {
                "Content-Type": "video/mp4",
                "Content-Length": stat.size,
                "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
            });
            if (method === "HEAD") { res.end(); return; }
            fs.createReadStream(videoPath).pipe(res); return;
        }

        // GET /api/video/:jobId
        if (parts[1] === "video" && parts[2] && method === "GET") {
            const job = getStoredJob(parts[2]);
            serveVideoStream(req, res, job?.videoPath || null); return;
        }

        // GET /api/music-preview?id=...
        if (url.startsWith("/api/music-preview") && method === "GET") {
            const u = new URL(req.url, `http://localhost:${PORT}`);
            const id = u.searchParams.get("id");
            if (!id || id === "none") { json(res, 404, { error: "Not found" }); return; }
            if (id === "random") {
                const tracks = CONFIG.music.map(t => t.id).filter(t => t !== "none" && t !== "random");
                const pick = tracks[Math.floor(Math.random() * tracks.length)] || "chill";
                const mp3 = path.join(PROJECT_ROOT, "music", `${pick}.mp3`);
                const wav = path.join(PROJECT_ROOT, "music", `${pick}.wav`);
                const file = existsSync(mp3) ? mp3 : existsSync(wav) ? wav : null;
                if (!file) { json(res, 404, { error: "Music not found" }); return; }
                res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" });
                fs.createReadStream(file).pipe(res); return;
            }
            const mp3 = path.join(PROJECT_ROOT, "music", `${id}.mp3`);
            const wav = path.join(PROJECT_ROOT, "music", `${id}.wav`);
            const file = existsSync(mp3) ? mp3 : existsSync(wav) ? wav : null;
            if (!file) { json(res, 404, { error: "Music not found" }); return; }
            res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" });
            fs.createReadStream(file).pipe(res); return;
        }

        // GET /api/preview?voice=...&lang=...&speed=...&instructions=...
        if (url.startsWith("/api/preview") && method === "GET") {
            const u = new URL(req.url, `http://localhost:${PORT}`);
            const voice = u.searchParams.get("voice") || "alloy";
            const lang = u.searchParams.get("lang") || "en";
            const speed = u.searchParams.get("speed") || "1.0";
            const instructions = u.searchParams.get("instructions") || "";
            const openAiKey = process.env.OPENAI_API_KEY || "";
            const tmpDir = path.join(PROJECT_ROOT, "videos", "_previews");
            fs.mkdirSync(tmpDir, { recursive: true });
            const outPath = path.join(tmpDir, `preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`);

            const args = [
                path.join(PROJECT_ROOT, "scripts", "video_gen.py"),
                "--api-key", openAiKey,
                "preview", voice, lang, outPath, String(speed), instructions,
            ];

            const proc = spawn("python3", args, { stdio: "pipe" });
            let stdout = "", stderr = "";
            proc.stdout.on("data", d => { stdout += d.toString(); });
            proc.stderr.on("data", d => { stderr += d.toString(); });
            proc.on("close", () => {
                if (existsSync(outPath)) {
                    res.writeHead(200, {
                        "Content-Type": "audio/wav",
                        "Cache-Control": "no-store",
                    });
                    const stream = fs.createReadStream(outPath);
                    stream.on("close", () => fs.unlink(outPath, () => {}));
                    stream.pipe(res);
                    return;
                }
                json(res, 500, { error: (stderr || stdout || "Preview generation failed").slice(-500) });
            });
            return;
        }

        // GET /api/job/:jobId/project
        if (parts[1] === "job" && parts[2] && parts[3] === "project" && method === "GET") {
            const job = getStoredJob(parts[2]);
            if (!job) { json(res, 404, { error: "Job not found" }); return; }
            if (!job.script) { json(res, 404, { error: "Script not found" }); return; }
            json(res, 200, {
                job: {
                    jobId: job.jobId,
                    topic: job.topic,
                    topicLabel: job.topicLabel,
                    langLabel: job.langLabel,
                    styleLabel: job.styleLabel,
                    format: job.format,
                    createdAt: job.createdAt,
                    lang: job.lang,
                    duration: job.duration,
                    style: job.style,
                    voice: job.voice,
                    music: job.music,
                    ttsSpeed: job.ttsSpeed,
                    ttsInstructions: job.ttsInstructions,
                    storyStyle: job.storyStyle,
                },
                script: job.script,
            }); return;
        }

        // GET /api/job/:jobId/script
        if (parts[1] === "job" && parts[3] === "script" && method === "GET") {
            const jobId = parts[2];
            const job = getStoredJob(jobId);
            if (!job) { json(res, 404, { error: "Job not found" }); return; }
            if (!existsSync(job.scriptPath)) { json(res, 404, { error: "Script not found" }); return; }
            serveFile(res, job.scriptPath, "application/json"); return;
        }

        // PUT /api/job/:jobId/script
        if (parts[1] === "job" && parts[3] === "script" && method === "PUT") {
            const jobId = parts[2];
            const job = getStoredJob(jobId);
            if (!job) { json(res, 404, { error: "Job not found" }); return; }
            const body = await parseBody(req);
            const { scenes, title } = body || {};
            if (!scenes || !Array.isArray(scenes)) { json(res, 400, { error: "Invalid scenes" }); return; }
            const existing = job.script || {};
            const next = {
                ...existing,
                title,
                scenes,
                duration: scenes.reduce((sum, scene) => sum + Number(scene?.duration || 0), 0),
                topic: existing.topic || job.topic || title,
                style: existing.style || job.style,
                music: existing.music || job.music,
                voice: existing.voice || job.voice,
                ttsSpeed: existing.ttsSpeed || job.ttsSpeed,
                ttsInstructions: existing.ttsInstructions || job.ttsInstructions,
                storyStyle: existing.storyStyle || job.storyStyle,
                lang: existing.lang || job.lang,
                format: existing.format || job.format,
            };
            writeFileSync(job.scriptPath, JSON.stringify(next, null, 2));
            json(res, 200, { ok: true }); return;
        }

        // POST /api/job/:jobId/rebuild
        if (parts[1] === "job" && parts[3] === "rebuild" && method === "POST") {
            const jobId = parts[2];
            const job = getStoredJob(jobId);
            const openAiKey = process.env.OPENAI_API_KEY || "";
            if (!job) { json(res, 404, { error: "Job not found" }); return; }
            if (!existsSync(job.scriptPath)) { json(res, 404, { error: "Script not found" }); return; }

            const body = await parseBody(req);
            const { captionSettings } = body || {};
            const script = readJsonSafe(job.scriptPath);
            if (!script) { json(res, 500, { error: "Failed to load script" }); return; }

            const newJobId = randomUUID().slice(0, 8);
            const outDir = getJobDir(newJobId);
            fs.mkdirSync(outDir, { recursive: true });
            copySceneImages(job.jobDir, outDir);

            if (captionSettings) {
                script.cap = captionSettings;
            } else if (job.captionSettings && Object.keys(job.captionSettings).length > 0) {
                script.cap = job.captionSettings;
            }

            jobs.set(newJobId, {
                status: "running", progress: 0, step: "Пересборка...",
                topic: job.topic, topicLabel: job.topicLabel, langLabel: job.langLabel, styleLabel: job.styleLabel,
                format: job.format, duration: job.duration, lang: job.lang, style: job.style,
                voice: job.voice, music: job.music,
                ttsSpeed: job.ttsSpeed, ttsInstructions: job.ttsInstructions,
                storyStyle: job.storyStyle,
                captionSettings: script.cap || captionSettings || job.captionSettings || {},
                videoPath: null, error: null, createdAt: Date.now(),
            });

            const args = [
                path.join(PROJECT_ROOT, "scripts", "video_gen.py"),
                "--api-key", openAiKey,
                "rebuild", newJobId, JSON.stringify(script),
                job.voice || "alloy", job.music || "none",
                outDir, JSON.stringify(script.cap || {}),
            ];

            const proc = spawn("python3", args, { stdio: "pipe" });
            let stdout = "", stderr = "";
            proc.stdout.on("data", d => { stdout += d.toString(); });
            proc.stderr.on("data", d => { stderr += d.toString(); });
            proc.on("close", code => {
                if (code === 0 && stdout.includes("SUCCESS:")) {
                    const videoPath = stdout.split("SUCCESS:")[1].trim().split("\n")[0];
                    jobs.set(newJobId, { ...jobs.get(newJobId), status: "done", progress: 100, step: "Готово!", videoPath });
                } else {
                    jobs.set(newJobId, { ...jobs.get(newJobId), status: "error", step: "Ошибка", error: (stderr || stdout).slice(-500) });
                }
            });
            proc.on("error", err => {
                jobs.set(newJobId, { ...jobs.get(newJobId), status: "error", step: "Ошибка", error: err.message });
            });

            json(res, 200, { jobId: newJobId, statusUrl: `/api/status/${newJobId}` }); return;
        }

        // DELETE /api/job/:jobId
        if (parts[1] === "job" && parts[2] && method === "DELETE" && parts.length === 3) {
            const jobId = parts[2];
            const jobDir = getJobDir(jobId);
            if (!existsSync(jobDir)) { json(res, 404, { error: "Job not found" }); return; }
            jobs.delete(jobId);
            fs.rmSync(jobDir, { recursive: true, force: true });
            json(res, 200, { ok: true }); return;
        }

        // Serve client dist/assets/
        if (url.startsWith("/assets/")) {
            const assetPath = path.join(PROJECT_ROOT, "client", "dist", url);
            if (existsSync(assetPath)) {
                const ext = path.extname(assetPath);
                const mime = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" }[ext] || "application/octet-stream";
                res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=86400" });
                fs.createReadStream(assetPath).pipe(res); return;
            }
            json(res, 404, { error: "Asset not found" }); return;
        }

        // Serve client dist/
        const clientIndex = path.join(PROJECT_ROOT, "client", "dist", "index.html");
        if (existsSync(clientIndex)) {
            res.writeHead(200, { "Content-Type": "text/html" });
            fs.createReadStream(clientIndex).pipe(res); return;
        }

        // Serve static from public/
        const publicPath = path.join(PROJECT_ROOT, "public", url);
        if (existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
            const ext = path.extname(publicPath);
            const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp4": "video/mp4", ".mp3": "audio/mpeg" }[ext] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": mime });
            fs.createReadStream(publicPath).pipe(res); return;
        }

        json(res, 404, { error: "Not found" });

    } catch (e) {
        json(res, 500, { error: e.message });
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────
mkdir(VIDEO_DIR, { recursive: true }).then(() => {
    server.listen(PORT, () => {
        console.log(`VidRush Web: http://localhost:${PORT}`);
    });
}).catch(e => {
    console.error("Server start error:", e.message);
    process.exit(1);
});
