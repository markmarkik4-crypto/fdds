const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const { existsSync, readFileSync, writeFileSync } = require("fs");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = "/Users/harut/Desktop/telegram-image-bot";
const VIDEO_DIR = path.join(PROJECT_ROOT, "videos");
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;

let CONFIG = {};
try {
    const raw = readFileSync(path.join(PROJECT_ROOT, "config.json"), "utf8");
    CONFIG = JSON.parse(raw);
} catch (e) {
    CONFIG = { langs: [], themes: [], styles: [], music: [] };
}

const jobs = new Map();

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = req.url.split("?")[0];
    const method = req.method;

    // Parse body for POST/PUT
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
        try {
            if (body) {
                try { body = JSON.parse(body); } catch {}
            }

            // Routes
            if (url === "/api/config" && method === "GET") {
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify(CONFIG));
                return;
            }

            if (url === "/api/jobs" && method === "GET") {
                const result = [];
                try {
                    const dirs = fs.readdirSync(VIDEO_DIR);
                    for (const dir of dirs) {
                        if (!dir.startsWith("job_")) continue;
                        const jobId = dir.replace("job_", "");
                        const jobDir = path.join(VIDEO_DIR, dir);
                        try {
                            const files = fs.readdirSync(jobDir);
                            const mp4 = files.find(f => f.endsWith(".mp4"));
                            if (!mp4) continue;
                            const job = jobs.get(jobId);
                            const s = fs.statSync(path.join(jobDir, mp4));
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
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify(result));
                return;
            }

            if (url.startsWith("/api/status/") && method === "GET") {
                const jobId = url.split("/")[3];
                const job = jobs.get(jobId);
                if (!job) {
                    res.writeHead(200);
                    res.end(`data: ${JSON.stringify({status: "not_found"})}\n\n`);
                } else {
                    res.writeHead(200, {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                    });
                    res.write(`data: ${JSON.stringify(job)}\n\n`);
                }
                return;
            }

            if (url === "/api/generate" && method === "POST") {
                if (!OPENAI_KEY) {
                    res.writeHead(500, {"Content-Type": "application/json"});
                    res.end(JSON.stringify({error: "OPENAI_API_KEY not set"}));
                    return;
                }
                const b = typeof body === "string" ? {} : body || {};
                const { theme, customPrompt, lang, format, duration, style, music, voice, ttsSpeed, ttsInstructions, captionSettings, topicHint, subtopic, storyStyle } = b;

                if (!theme && !customPrompt) {
                    res.writeHead(400, {"Content-Type": "application/json"});
                    res.end(JSON.stringify({error: "Choose topic or enter prompt"}));
                    return;
                }

                const topic = customPrompt || theme;
                const jobId = randomUUID().slice(0, 8);
                jobs.set(jobId, {
                    status: "running", progress: 0, step: "Старт...",
                    topic, topicLabel: topic, langLabel: lang, styleLabel: style,
                    format, duration, lang,
                    voice: voice || "alloy", music: music || "none",
                    ttsSpeed: ttsSpeed || 1.0, ttsInstructions: ttsInstructions || "",
                    captionSettings: captionSettings || {},
                    videoPath: null, error: null, createdAt: Date.now(),
                });

                // Spawn Python render
                const outDir = path.join(VIDEO_DIR, `job_${jobId}`);
                fs.mkdirSync(outDir, { recursive: true });
                const args = [
                    path.join(PROJECT_ROOT, "scripts", "video_gen.py"),
                    "--api-key", OPENAI_KEY,
                    "render", jobId, topic, lang || "en", format || "9:16",
                    duration || "60", style || "cinematic", music || "none", voice || "alloy",
                    outDir, topicHint || "", JSON.stringify(captionSettings || {}),
                    subtopic || "", storyStyle || "intrigue",
                    String(ttsSpeed || 1.0), ttsInstructions || "",
                ];

                const proc = spawn("python3", args, {stdio: "pipe"});
                let stdout = "", stderr = "";
                proc.stdout.on("data", d => { stdout += d.toString(); });
                proc.stderr.on("data", d => { stderr += d.toString(); });
                proc.on("close", code => {
                    if (code === 0 && stdout.includes("SUCCESS:")) {
                        const videoPath = stdout.split("SUCCESS:")[1].trim().split("\n")[0];
                        jobs.set(jobId, {...jobs.get(jobId), status: "done", progress: 100, step: "Готово!", videoPath});
                    } else {
                        jobs.set(jobId, {...jobs.get(jobId), status: "error", step: "Ошибка", error: (stderr || stdout).slice(-300)});
                    }
                });

                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify({jobId, statusUrl: `/api/status/${jobId}`}));
                return;
            }

            if (url.startsWith("/api/download/") && method === "GET") {
                const jobId = url.split("/")[3];
                let job = jobs.get(jobId);
                let videoPath = job?.videoPath;
                if (!videoPath) {
                    const jobDir = path.join(VIDEO_DIR, `job_${jobId}`);
                    try {
                        const files = fs.readdirSync(jobDir);
                        const mp4 = files.find(f => f.endsWith(".mp4"));
                        if (mp4) videoPath = path.join(jobDir, mp4);
                    } catch {}
                }
                if (!videoPath || !existsSync(videoPath)) {
                    res.writeHead(404, {"Content-Type": "application/json"});
                    res.end(JSON.stringify({error: "Video not found"}));
                    return;
                }
                res.writeHead(200);
                res.end("OK");
                return;
            }

            // Static files
            const staticPath = path.join(PROJECT_ROOT, "public", url);
            if (existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
                const ext = path.extname(staticPath);
                const mime = {".html":"text/html",".js":"application/javascript",".css":"text/css",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml"}[ext] || "application/octet-stream";
                res.writeHead(200, {"Content-Type": mime});
                fs.createReadStream(staticPath).pipe(res);
                return;
            }

            // Serve index.html for all other routes (SPA)
            const indexPath = path.join(PROJECT_ROOT, "client", "dist", "index.html");
            if (existsSync(indexPath)) {
                res.writeHead(200, {"Content-Type": "text/html"});
                fs.createReadStream(indexPath).pipe(res);
                return;
            }

            res.writeHead(404, {"Content-Type": "application/json"});
            res.end(JSON.stringify({error: "Not found"}));
        } catch (e) {
            res.writeHead(500, {"Content-Type": "application/json"});
            res.end(JSON.stringify({error: e.message}));
        }
    });
});

server.listen(PORT, () => {
    console.log(`VidRush Web: http://localhost:${PORT}`);
});
