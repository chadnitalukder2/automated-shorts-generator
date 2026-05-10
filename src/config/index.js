'use strict';

require('dotenv').config();

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name, fallback = '') {
  return process.env[name] || fallback;
}

const config = {
  env: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3000'), 10),
  logLevel: optional('LOG_LEVEL', 'info'),

  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: parseInt(optional('REDIS_PORT', '6379'), 10),
    password: optional('REDIS_PASSWORD', ''),
  },

  ai: {
    provider: optional('AI_PROVIDER', 'gemini'),   // gemini | groq | anthropic
    geminiApiKey: optional('GEMINI_API_KEY', ''),
    groqApiKey: optional('GROQ_API_KEY', ''),
  },

  // kept for backwards compat if someone sets AI_PROVIDER=anthropic
  anthropic: {
    apiKey: optional('ANTHROPIC_API_KEY', ''),
    model: 'claude-opus-4-5',
  },

  news: {
    apiKey: optional('NEWS_API_KEY', ''),
    cricketApiKey: optional('CRICKET_API_KEY', ''),
    maxArticles: 5,
  },

  tts: {
    voice: optional('TTS_VOICE', 'en-US-GuyNeural'),
    rate: optional('TTS_RATE', '+10%'),
    volume: optional('TTS_VOLUME', '+0%'),
    pitch: optional('TTS_PITCH', '+0Hz'),
  },

  youtube: {
    clientId: optional('YOUTUBE_CLIENT_ID', ''),
    clientSecret: optional('YOUTUBE_CLIENT_SECRET', ''),
    refreshToken: optional('YOUTUBE_REFRESH_TOKEN', ''),
    channelId: optional('YOUTUBE_CHANNEL_ID', ''),
    uploadEnabled: optional('UPLOAD_ENABLED', 'false') === 'true',
  },

  video: {
    width: parseInt(optional('VIDEO_WIDTH', '1080'), 10),
    height: parseInt(optional('VIDEO_HEIGHT', '1920'), 10),
    fps: parseInt(optional('VIDEO_FPS', '30'), 10),
    durationSeconds: parseInt(optional('VIDEO_DURATION_SECONDS', '55'), 10),
  },

  shorts: {
    channelName: optional('CHANNEL_NAME', 'ViralShorts'),
    // Legacy single-schedule (kept for backwards compat)
    maxDailyUploads: parseInt(optional('MAX_DAILY_UPLOADS', '2'), 10),
    cronSchedule: optional('CRON_SCHEDULE', '0 8,20 * * *'),
    categories: {
      sports: {
        cronSchedule: optional('SPORTS_CRON_SCHEDULE', '0 8,20 * * *'),
        maxDailyUploads: parseInt(optional('SPORTS_MAX_DAILY', '2'), 10),
      },
      ai: {
        cronSchedule: optional('AI_CRON_SCHEDULE', '0 11,17 * * *'),
        maxDailyUploads: parseInt(optional('AI_MAX_DAILY', '2'), 10),
      },
    },
  },

  output: {
    dir: optional('OUTPUT_DIR', './outputs'),
    cleanupAfterUpload: optional('CLEANUP_AFTER_UPLOAD', 'true') === 'true',
  },

  queue: {
    name: 'shorts-pipeline',
    concurrency: 2,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  },
};

module.exports = config;
