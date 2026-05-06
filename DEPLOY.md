# VidRush Production Deploy

## Recommended host

Use Render or Railway, not static hosting. This app needs:

- a long-running Node server;
- Python;
- FFmpeg;
- persistent storage for generated videos.

## Render

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from `render.yaml`.
3. Add secret env vars:
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
   - optional: `ANTHROPIC_API_KEY`, `HF_TOKEN`, `REPLICATE_API_TOKEN`, `TOGETHER_API_KEY`, `PEXELS_API_KEY`
4. Deploy.
5. Healthcheck: `/api/health`.
6. Generated videos are stored on the persistent disk mounted at `/app/videos`.

## Railway

1. Create a new project from GitHub.
2. Railway will build with `Dockerfile`.
3. Add a volume mounted to `/app/videos`.
4. Set env var `VIDEO_DIR=/app/videos`.
5. Add the same API keys as Render.

## Local Docker smoke test

```bash
docker build -t vidrush .
docker run --env-file .env -p 3000:3000 -v "$PWD/videos:/app/videos" vidrush
```

Then open:

```text
http://localhost:3000/api/health
```
