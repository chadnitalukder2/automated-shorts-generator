# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev (with hot-reload)
npm run dev

# Production
npm start

# Worker only (separate process)
npm run worker

# Test pipeline end-to-end
npm test

# Manually trigger a job via HTTP
npm run trigger

# Remotion Studio (preview composition)
npm run studio

# Lint
npm run lint

# Docker
npm run docker:build
npm run docker:up
npm run docker:logs
npm run docker:down

# YouTube OAuth setup (one-time)
node scripts/youtube-auth.js
```

## Architecture

This is a **standalone Node.js service** (not a WordPress plugin despite its location). It auto-generates cricket YouTube Shorts on a cron schedule and uploads them.

### Pipeline (end-to-end flow)

Every job runs these 7 steps sequentially in `src/queue/jobProcessor.js`:

1. **News** (`src/modules/news/cricketNews.js`) — fetch trending cricket articles via NewsAPI
2. **Script** (`src/modules/script/scriptGenerator.js`) — generate 100–120 word spoken script via AI
3. **TTS** (`src/modules/tts/edgeTts.js`) — convert script to audio using Microsoft Edge TTS (`msedge-tts`); returns word-level timing data
4. **Subtitles** (`src/modules/subtitles/subtitleGenerator.js`) — build per-word subtitle chunks and `.srt` from word timings
5. **Remotion render** (`src/modules/video/remotionRenderer.js`) — headless Chromium renders `CricketShort` composition (muted base video; audio added by FFmpeg)
6. **FFmpeg combine** (`src/modules/video/ffmpegCombiner.js`) — mux video + audio + burn-in subtitles
7. **YouTube upload** (`src/modules/upload/youtubeUploader.js`) — upload via YouTube Data API v3 (OAuth2 refresh token)

### Infrastructure

- **BullMQ** (Redis-backed) queue: `shorts-pipeline`. Worker runs at concurrency 2, 3 retries with exponential backoff.
- **Cron scheduler** (`src/cron/scheduler.js`): fires jobs at UTC times from `CRON_SCHEDULE`. Tracks daily count in-memory; skips if `MAX_DAILY_UPLOADS` reached or queue has ≥3 pending.
- **HTTP API** (`src/index.js`): Express on `PORT` (default 3000). Endpoints: `GET /`, `POST /generate`, `GET /health`, `GET /stats`, `GET /admin/queues` (Bull Board UI).
- Each job gets its own directory under `OUTPUT_DIR/<jobId>/`. Cleaned up after successful upload if `CLEANUP_AFTER_UPLOAD=true`.

### AI providers

Controlled by `AI_PROVIDER` env var. Switch without code changes:
- `gemini` (default) — Google Gemini 2.0 Flash, free tier
- `groq` — Llama 3.3 70B via Groq, free tier
- `anthropic` — Claude (paid), model hardcoded as `claude-opus-4-5` in `src/config/index.js`

### Remotion composition

`src/remotion/compositions/CricketShort.jsx` — vertical (1080×1920) short with: animated gradient or article image background, headline card, word-timed subtitles, channel branding, progress bar, subscribe CTA (last 10s). Uses `React.createElement` (no JSX transform needed at runtime). **Bundle is cached in memory after first render** — subsequent jobs in the same process skip re-bundling.

### Deployment

Railway (`railway.json` present). Requires Redis service. Docker Compose sets up app + worker + Redis + Bull Board. Chromium runs with `--no-sandbox` (required for containerized environments).

## Key env vars

| Var | Purpose |
|-----|---------|
| `AI_PROVIDER` | `gemini` / `groq` / `anthropic` |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `ANTHROPIC_API_KEY` | AI provider keys |
| `NEWS_API_KEY` | NewsAPI.org key |
| `REDIS_URL` | Full Redis URL (Railway); or use `REDIS_HOST`+`REDIS_PORT`+`REDIS_PASSWORD` |
| `UPLOAD_ENABLED` | Set `false` to render without uploading |
| `CRON_SCHEDULE` | cron expression in UTC (default: `0 8,14,20 * * *`) |
| `YOUTUBE_REFRESH_TOKEN` | Obtained via `node scripts/youtube-auth.js` |
