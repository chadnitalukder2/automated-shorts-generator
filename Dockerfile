# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # FFmpeg for video processing
    ffmpeg \
    # TTS fallback for when Edge TTS is unavailable
    espeak-ng \
    # Font support for subtitle rendering
    fonts-liberation \
    fonts-noto \
    # Required by Remotion Chrome Headless Shell
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Stage 2: Dependencies ───────────────────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 3: Production ─────────────────────────────────────────────────────────
FROM base AS production

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -G audio,video appuser

WORKDIR /app

# Copy deps from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY src ./src
COPY scripts ./scripts
COPY public ./public

# Create output directories with correct permissions
RUN mkdir -p outputs/jobs outputs/logs && \
    chown -R appuser:appuser /app

USER appuser

# Pre-download Remotion's Chrome Headless Shell so it's baked into the image
RUN node -e "const {ensureBrowser} = require('@remotion/renderer'); ensureBrowser().then(r => console.log('Chrome ready:', r.path)).catch(e => { console.error(e); process.exit(1); })"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT||3000) + '/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "src/index.js"]
