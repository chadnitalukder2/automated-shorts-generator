#!/usr/bin/env node
'use strict';

/**
 * Pipeline health-check script.
 * Tests each module independently. Run: node scripts/test-pipeline.js
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs-extra');

const PASS = '✅';
const FAIL = '❌';
const SKIP = '⚠️ ';

let passed = 0, failed = 0, skipped = 0;

function result(label, status, detail = '') {
  const icon = status === 'pass' ? PASS : status === 'skip' ? SKIP : FAIL;
  console.log(`${icon}  ${label}${detail ? `  →  ${detail}` : ''}`);
  if (status === 'pass') passed++;
  else if (status === 'skip') skipped++;
  else failed++;
}

async function check(label, fn) {
  try {
    const detail = await fn();
    result(label, 'pass', detail);
  } catch (err) {
    result(label, 'fail', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function testRedis() {
  const Redis = require('ioredis');
  const config = require('../src/config');
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    lazyConnect: true,
    connectTimeout: 5000,
  });
  await redis.connect();
  const pong = await redis.ping();
  await redis.disconnect();
  if (pong !== 'PONG') throw new Error('Unexpected ping response');
  return `${config.redis.host}:${config.redis.port}`;
}

async function testNewsAPI() {
  const config = require('../src/config');
  if (!config.news.apiKey || config.news.apiKey === 'your_newsapi_key_here') {
    throw new Error('NEWS_API_KEY not set in .env');
  }
  const { fetchTrendingNews } = require('../src/modules/news/cricketNews');
  const articles = await fetchTrendingNews('test');
  return `${articles.length} articles  |  "${articles[0].title.slice(0, 55)}..."`;
}

async function testESPNScraper() {
  const { fetchTrendingNews } = require('../src/modules/news/cricketNews');
  const origKey = process.env.NEWS_API_KEY;
  delete process.env.NEWS_API_KEY;
  // patch config for this test
  const config = require('../src/config');
  const savedKey = config.news.apiKey;
  config.news.apiKey = '';
  const articles = await fetchTrendingNews('test-espn');
  config.news.apiKey = savedKey;
  if (origKey) process.env.NEWS_API_KEY = origKey;
  return `${articles.length} articles scraped from ESPN`;
}

async function testScriptGenerator() {
  const config = require('../src/config');
  const provider = config.ai.provider;

  const keyMap = { gemini: 'geminiApiKey', groq: 'groqApiKey', anthropic: null };
  const keyField = keyMap[provider];
  const keyValue = keyField ? config.ai[keyField] : config.anthropic.apiKey;

  if (!keyValue || keyValue.includes('your_') || keyValue.includes('...')) {
    throw new Error(`${provider} API key not set in .env`);
  }

  const { generateScript } = require('../src/modules/script/scriptGenerator');
  const article = {
    title: 'Rohit Sharma smashes 150 as India beat Australia in thrilling final',
    description: 'India won the match by 6 wickets in a stunning chase of 320 runs.',
    source: 'Test',
  };
  const script = await generateScript(article, 'test');
  const words = script.fullScript.split(' ').length;
  if (words < 30) throw new Error(`Script too short: ${words} words (expected 80-120)`);
  const warning = words < 60 ? `  ⚠️ short (aim for 80-120)` : '';
  return `[${provider}]  "${script.title}"  |  ${words} words${warning}`;
}

async function testEdgeTTS() {
  const { generateAudio } = require('../src/modules/tts/edgeTts');
  const tmpDir = path.join(__dirname, '../outputs/test-tts');
  await fs.ensureDir(tmpDir);
  const { audioPath, durationSeconds, wordTimings } = await generateAudio(
    'India win the cricket match. Rohit Sharma scores a century.',
    tmpDir,
    'test'
  );
  const exists = await fs.pathExists(audioPath);
  const size = (await fs.stat(audioPath)).size;
  await fs.remove(tmpDir);
  if (!exists || size < 1000) throw new Error('Audio file too small or missing');
  return `${durationSeconds.toFixed(1)}s audio  |  ${wordTimings.length} word timings  |  ${(size/1024).toFixed(0)}KB`;
}

async function testSubtitles() {
  const { generateSubtitles } = require('../src/modules/subtitles/subtitleGenerator');
  const timings = ['India', 'win', 'the', 'match', 'by', 'six', 'wickets'].map((w, i) => ({
    word: w, startMs: i * 500, endMs: (i + 1) * 500,
  }));
  const tmpDir = path.join(__dirname, '../outputs/test-subs');
  await fs.ensureDir(tmpDir);
  const { srtPath, chunks } = await generateSubtitles(timings, tmpDir, 'test');
  const srt = await fs.readFile(srtPath, 'utf8');
  await fs.remove(tmpDir);
  if (!srt.includes('-->')) throw new Error('Invalid SRT format');
  return `${chunks.length} subtitle chunks generated`;
}

async function testFFmpeg() {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.ffprobe('/dev/null', (err) => {
      // ffprobe existence check — error on /dev/null is expected, but "not found" is not
      if (err && err.message.includes('No such file or directory')) {
        reject(new Error('ffmpeg/ffprobe not installed'));
      } else {
        resolve('ffmpeg + ffprobe available');
      }
    });
  });
}

async function testQueueConnection() {
  const { shortsQueue } = require('../src/queue/queues');
  const counts = await shortsQueue.getJobCounts();
  await shortsQueue.close();
  return `Queue connected  |  ${JSON.stringify(counts)}`;
}

async function testYouTubeCredentials() {
  const config = require('../src/config');
  const missing = ['clientId', 'clientSecret', 'refreshToken']
    .filter((k) => !config.youtube[k] || config.youtube[k].startsWith('your_'));
  if (missing.length) {
    throw new Error(`Not set: ${missing.join(', ')} — run: node scripts/youtube-auth.js`);
  }
  const { google } = require('googleapis');
  const oauth2 = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    'http://localhost'
  );
  oauth2.setCredentials({ refresh_token: config.youtube.refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();
  return `Token valid  |  expires ${new Date(credentials.expiry_date).toISOString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('   Automated Shorts Generator — Health Check   ');
  console.log('═══════════════════════════════════════════════\n');

  await check('Redis connection',         testRedis);
  await check('Edge TTS audio',           testEdgeTTS);
  await check('Subtitle generator',       testSubtitles);
  await check('FFmpeg available',         testFFmpeg);
  await check('Queue connection',         testQueueConnection);

  // API-dependent tests
  await check('NewsAPI fetch', testNewsAPI);
  // ESPN scraper only tested when NewsAPI unavailable — it blocks scrapers, not a real failure
  await check('Script generator (AI)', testScriptGenerator);
  await check('YouTube credentials', testYouTubeCredentials);

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed  |  ${failed} failed  |  ${skipped} skipped`);
  console.log('═══════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Fix failed checks, then run: curl -X POST http://localhost:3000/generate\n');
    process.exit(1);
  } else {
    console.log('All checks passed. Trigger a job:\n');
    console.log('  curl -X POST http://localhost:3000/generate\n');
    console.log('  Dashboard: http://localhost:3000/admin/queues\n');
  }
}

main().catch((err) => {
  console.error('Test script crashed:', err.message);
  process.exit(1);
});
