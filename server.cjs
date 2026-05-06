const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { spawn } = require("child_process");
const { join } = require("path");
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { mkdir, readdir } = require("fs/promises");
const { randomUUID } = require("crypto");
const PROJECT_ROOT = "/Users/harut/Desktop/telegram-image-bot";

const app = express();
const PORT = process.env.PORT || 3000;
const VIDEO_DIR = join(PROJECT_ROOT, "videos");
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(join(PROJECT_ROOT, "client", "dist")));

console.log("VidRush server starting...");

// Load CONFIG
let CONFIG = {};
try {
    const raw = readFileSync(join(PROJECT_ROOT, "config.json"), "utf8");
    CONFIG = JSON.parse(raw);
    CONFIG.langs = CONFIG.langs || [];
    CONFIG.themes = CONFIG.themes || [];
    CONFIG.styles = CONFIG.styles || [];
    CONFIG.music = CONFIG.music || [];
} catch (e) {
    console.log("config.json not found, using defaults");
    CONFIG = { langs: [], themes: [], styles: [], music: [] };
}

app.get("/api/config", (req, res) => res.json(CONFIG));

app.post("/api/prompt-from-categories", async (req, res) => {
    const { genre, subGenre, style, details } = req.body || {};
    const { spawn } = require("child_process");
    const args = [
        join(PROJECT_ROOT, "scripts", "video_gen.py"),
        "prompt_from_categories",
        genre || "", subGenre || "", style || "", details || "",
    ];
    let out = "", err = "";
    const proc = spawn("python3", args, { stdio: "pipe" });
    proc.stdout.on("data", d => { out += d.toString(); });
    proc.stderr.on("data", d => { err += d.toString(); });
    proc.on("close", code => {
        if (code === 0 && out.trim()) {
            res.json({ prompt: out.trim() });
        } else {
            res.status(500).json({ error: err.slice(0, 300) || "Script failed" });
        }
    });
    proc.on("error", e => res.status(500).json({ error: e.message }));
});

const jobs = new Map();

async function restoreJobsFromDisk() {
    try {
        const dirs = await readdir(VIDEO_DIR);
        let count = 0;
        for (const dir of dirs) {
            if (!dir.startsWith("job_")) continue;
            const jobId = dir.replace("job_", "");
            const jobDir = join(VIDEO_DIR, dir);
            try {
                const files = await readdir(jobDir);
                const mp4 = files.find(f => f.endsWith(".mp4"));
                if (mp4) {
                    const s = await stat(join(jobDir, mp4));
                    jobs.set(jobId, {
                        status: "done",
                        progress: 100,
                        step: "Готово",
                        topic: "",
                        topicLabel: jobId,
                        langLabel: "",
                        styleLabel: "",
                        format: "9:16",
                        createdAt: s.mtimeMs || Date.now(),
                        videoPath: join(jobDir, mp4),
                        error: null,
                    });
                    count++;
                }
            } catch {}
        }
        console.log(`Restored ${count} jobs from disk`);
    } catch (e) {
        console.log("restoreJobsFromDisk error:", e.message);
    }
}

async function runPythonRender(jobId, params) {
    const outDir = join(VIDEO_DIR, `job_${jobId}`);
    await mkdir(outDir, { recursive: true });

    const topic = params.customPrompt || params.theme;
    const topicLabel = CONFIG.themes?.find(t => t.id === params.theme)?.label || params.theme;
    const langLabel = CONFIG.langs?.find(l => l.id === params.lang)?.label || params.lang;
    const styleLabel = CONFIG.styles?.find(s => s.id === params.style)?.label || params.style;

    jobs.set(jobId, {
        status: "running",
        progress: 0,
        step: "Старт...",
        topic,
        topicLabel,
        langLabel,
        styleLabel,
        format: params.format,
        duration: params.duration,
        lang: params.lang,
        voice: params.voice || "alloy",
        music: params.music || "none",
        ttsSpeed: params.ttsSpeed || 1.0,
        ttsInstructions: params.ttsInstructions || "",
        captionSettings: params.captionSettings || {},
        videoPath: null,
        error: null,
        createdAt: Date.now(),
    });

    return new Promise((resolve, reject) => {
        const args = [
            join(PROJECT_ROOT, "scripts", "video_gen.py"),
            "--api-key", OPENAI_KEY,
            "render",
            jobId,
            topic,
            params.lang,
            params.format,
            params.duration,
            params.style,
            params.music,
            params.voice,
            outDir,
            params.angleHint || "",
            JSON.stringify(params.captionSettings || {}),
            params.subtopic || "",
            params.storyStyle || "intrigue",
            String(params.ttsSpeed || 1.0),
            params.ttsInstructions || "",
        ];

        const proc = spawn("python3", args, { stdio: "pipe" });
        let fullStdout = "";
        let stderr = "";

        proc.stdout.on("data", (d) => {
            fullStdout += d.toString();
            const lines = fullStdout.split("\n");
            for (const line of lines.slice(0, -1)) {
                if (line.startsWith("PROGRESS:")) {
                    const parts = line.split(":");
                    const stepNum = parseInt(parts[1]) || 0;
                    const stepText = parts.slice(2).join(":") || "";
                    const job = jobs.get(jobId);
                    if (job) {
                        job.progress = stepNum;
                        job.step = stepText;
                    }
                }
            }
        });

        proc.stderr.on("data", (d) => {
            stderr += d.toString();
        });

        proc.on("close", (code) => {
            if (code === 0 && fullStdout.includes("SUCCESS:")) {
                const videoPath = fullStdout.slice(fullStdout.indexOf("SUCCESS:") + 8).trim().split("\n")[0];
                jobs.set(jobId, { ...jobs.get(jobId), status: "done", progress: 100, step: "Готово!", videoPath });
                resolve(videoPath);
            } else {
                const errorMsg = stderr.slice(-500) || fullStdout.slice(-300) || "Unknown error";
                jobs.set(jobId, { ...jobs.get(jobId), status: "error", step: "Ошибка", error: errorMsg.slice(0, 300) });
                reject(new Error(errorMsg.slice(0, 300)));
            }
        });

        proc.on("error", (err) => {
            jobs.set(jobId, { ...jobs.get(jobId), status: "error", step: "Ошибка", error: err.message });
            reject(err);
        });
    });
}

app.get("/api/status/:jobId", (req, res) => {
    const { jobId } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const job = jobs.get(jobId);
    if (job) send(job);
    else { send({ status: "not_found" }); res.end(); return; }

    const interval = setInterval(() => {
        const j = jobs.get(jobId);
        if (!j) { send({ status: "not_found" }); clearInterval(interval); res.end(); return; }
        send(j);
        if (j.status === "done" || j.status === "error") { clearInterval(interval); res.end(); }
    }, 500);
    req.on("close", () => clearInterval(interval));
});

app.post("/api/generate", async (req, res) => {
    if (!OPENAI_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not set" });

    const { theme, angle, subtopic, storyStyle, topicHint, customPrompt, lang, format, duration, style, music, voice, ttsSpeed, ttsInstructions, captionSettings } = req.body;

    if (!theme && !customPrompt) return res.status(400).json({ error: "Choose topic or enter prompt" });

    const topic = customPrompt || theme;
    const angleHint = topicHint || "";
    if (!lang || !format || !duration || !style) return res.status(400).json({ error: "Missing required fields" });

    const jobId = randomUUID().slice(0, 8);
    const topicLabel = CONFIG.themes?.find(t => t.id === theme)?.label || theme || customPrompt || jobId;
    const langLabel = CONFIG.langs?.find(l => l.id === lang)?.label || lang;
    const styleLabel = CONFIG.styles?.find(s => s.id === style)?.label || style;
    jobs.set(jobId, {
        status: "running", progress: 0, step: "Старт...",
        topic, topicLabel, langLabel, styleLabel,
        format, duration, lang,
        voice: voice || "alloy", music: music || "none",
        ttsSpeed: ttsSpeed || 1.0, ttsInstructions: ttsInstructions || "",
        captionSettings: captionSettings || {},
        videoPath: null, error: null, createdAt: Date.now(),
    });

    runPythonRender(jobId, { theme, customPrompt, lang, format, duration, style, music: music || "none", voice: voice || "alloy", ttsSpeed: ttsSpeed || 1.0, ttsInstructions: ttsInstructions || "", angleHint, subtopic: subtopic || "", storyStyle: storyStyle || "intrigue", captionSettings: captionSettings || {} }).catch(() => {});

    res.json({ jobId, statusUrl: `/api/status/${jobId}` });
});

app.get("/api/job/:jobId/script", (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);
    if (!job || job.status !== "done") return res.status(404).json({ error: "Job not found" });
    const scriptPath = join(VIDEO_DIR, `job_${jobId}`, "script.json");
    if (!existsSync(scriptPath)) return res.status(404).json({ error: "Script not found" });
    res.sendFile(scriptPath);
});

app.put("/api/job/:jobId/script", (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);
    if (!job || job.status !== "done") return res.status(404).json({ error: "Job not found" });
    const { scenes, title } = req.body;
    if (!scenes || !Array.isArray(scenes)) return res.status(400).json({ error: "Invalid scenes" });
    try {
        const scriptPath = join(VIDEO_DIR, `job_${jobId}`, "script.json");
        const existing = existsSync(scriptPath) ? JSON.parse(readFileSync(scriptPath, "utf8")) : {};
        writeFileSync(scriptPath, JSON.stringify({ ...existing, scenes, title }, null, 2));
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/job/:jobId/rebuild", async (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    const scriptPath = join(VIDEO_DIR, `job_${jobId}`, "script.json");
    if (!existsSync(scriptPath)) return res.status(404).json({ error: "Script not found" });

    const newJobId = randomUUID().slice(0, 8);
    const { captionSettings } = req.body || {};
    const script = JSON.parse(readFileSync(scriptPath, "utf8"));

    jobs.set(newJobId, {
        status: "running", progress: 0, step: "Пересборка...",
        topic: job.topic, topicLabel: job.topicLabel, langLabel: job.langLabel, styleLabel: job.styleLabel,
        format: job.format, duration: job.duration, lang: job.lang,
        voice: job.voice, music: job.music,
        ttsSpeed: job.ttsSpeed, ttsInstructions: job.ttsInstructions,
        captionSettings: captionSettings || job.captionSettings || {},
        videoPath: null, error: null, createdAt: Date.now(),
    });

    runPythonRender(newJobId, {
        theme: job.topic, customPrompt: "", lang: job.lang, format: job.format, duration: job.duration,
        style: job.styleLabel?.toLowerCase() || "cinematic",
        music: job.music || "none", voice: job.voice || "alloy",
        ttsSpeed: job.ttsSpeed || 1.0, ttsInstructions: job.ttsInstructions || "",
        angleHint: "", subtopic: "", storyStyle: "intrigue",
        captionSettings: captionSettings || job.captionSettings || {},
    }).catch(() => {});

    res.json({ jobId: newJobId, statusUrl: `/api/status/${newJobId}` });
});

app.get("/api/download/:jobId", async (req, res) => {
    const { jobId } = req.params;
    let job = jobs.get(jobId);
    if (!job || !job.videoPath) {
        const jobDir = join(VIDEO_DIR, `job_${jobId}`);
        if (existsSync(jobDir)) {
            try {
                const files = await readdir(jobDir);
                const mp4 = files.find(f => f.endsWith(".mp4"));
                if (mp4) return res.download(join(jobDir, mp4), `video_${jobId}.mp4`);
            } catch {}
        }
        return res.status(404).json({ error: "Video not found" });
    }
    if (!existsSync(job.videoPath)) return res.status(404).json({ error: "Video file missing" });
    const filename = `video_${job.topicLabel || job.topic || jobId}.mp4`.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-\.]/g, "_");
    res.download(job.videoPath, filename);
});

app.get("/api/video/:jobId", async (req, res) => {
    const { jobId } = req.params;
    const jobDir = join(VIDEO_DIR, `job_${jobId}`);
    let videoPath = null;

    const job = jobs.get(jobId);
    if (job?.videoPath && existsSync(job.videoPath)) {
        videoPath = job.videoPath;
    } else {
        try {
            const files = await readdir(jobDir);
            const mp4 = files.find(f => f.endsWith(".mp4"));
            if (mp4) videoPath = join(jobDir, mp4);
        } catch {}
    }

    if (!videoPath || !existsSync(videoPath)) {
        return res.status(404).json({ error: "Video not found" });
    }

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");
    res.sendFile(videoPath);
});

app.get("/api/jobs", async (req, res) => {
    const result = [];
    try {
        const dirs = await readdir(VIDEO_DIR);
        for (const dir of dirs) {
            if (!dir.startsWith("job_")) continue;
            const jobId = dir.replace("job_", "");
            const jobDir = join(VIDEO_DIR, dir);
            try {
                const files = await readdir(jobDir);
                const mp4 = files.find(f => f.endsWith(".mp4"));
                if (!mp4) continue;
                const job = jobs.get(jobId);
                const s = await stat(join(jobDir, mp4));
                result.push({
                    jobId,
                    topic: job?.topic || "",
                    topicLabel: job?.topicLabel || jobId,
                    langLabel: job?.langLabel || "",
                    styleLabel: job?.styleLabel || "",
                    format: job?.format || "9:16",
                    createdAt: job?.createdAt || s.mtimeMs || Date.now(),
                });
            } catch {}
        }
    } catch {}
    result.sort((a, b) => b.createdAt - a.createdAt);
    res.json(result);
});

app.get("/api/music-preview", (req, res) => {
    const { id } = req.query;
    if (!id || id === "none") return res.status(404).send("Not found");
    if (id === "random") {
        const tracks = CONFIG.music.map(t => t.id).filter(tid => tid !== "none" && tid !== "random");
        return res.redirect(`/api/music-preview?id=${tracks[Math.floor(Math.random() * tracks.length)]}`);
    }
    const mp3Path = join(PROJECT_ROOT, "music", `${id}.mp3`);
    const wavPath = join(PROJECT_ROOT, "music", `${id}.wav`);
    const filePath = existsSync(mp3Path) ? mp3Path : existsSync(wavPath) ? wavPath : null;
    if (!filePath) return res.status(404).send("Music file not found");
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.sendFile(filePath);
});

app.get("/api/preview", async (req, res) => {
    const { voice, lang, speed, instructions } = req.query;
    if (!voice) return res.status(400).json({ error: "Missing voice" });
    const isEdge = voice.startsWith("edge_");
    const isGtts = voice.startsWith("gtts_") || (!isEdge && !voice.startsWith("gpt4o_"));
    const isGpt4o = voice.startsWith("gpt4o_");
    if (isGpt4o) {
        try {
            const { synthesizeSpeechTTS } = await import(join(PROJECT_ROOT, "scripts", "video_gen.py"));
            const tmpPath = join("/tmp", `preview_${Date.now()}.mp3`);
            await synthesizeSpeechTTS(voice, ["This is a test of the voice system."], "/tmp", lang || "en", parseFloat(speed) || 1.0, instructions || "");
            if (existsSync(tmpPath)) {
                res.sendFile(tmpPath, {}, (err) => { try { require("fs").unlinkSync(tmpPath); } catch {} });
            } else res.status(500).json({ error: "TTS failed" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else if (isEdge) {
        res.status(500).json({ error: "Edge TTS not supported in web preview" });
    } else if (isGtts) {
        res.status(500).json({ error: "gTTS not supported in web preview" });
    } else {
        res.status(500).json({ error: "Unknown voice type" });
    }
});

// SPA fallback — all non-API routes → React index.html
app.use((req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/video/")) return next();
    res.sendFile(join(PROJECT_ROOT, "client", "dist", "index.html"));
});

async function start() {
    await mkdir(VIDEO_DIR, { recursive: true });
    await restoreJobsFromDisk();
    app.listen(PORT, () => {
        console.log(`VidRush Web: http://localhost:${PORT}`);
    });
}

start().catch(e => { console.error("Server start error:", e.message); process.exit(1); });
