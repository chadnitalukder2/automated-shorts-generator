'use strict';

const config = require('../../config');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

const SYSTEM_PROMPT = `You are a viral YouTube Shorts scriptwriter specializing in cricket content.
Your scripts are high-energy, punchy, and optimized for maximum engagement.

Rules:
- Total script must be 45-55 seconds when spoken at a normal pace (~130 words/min = ~100-120 words)
- Start with a HOOK that creates instant curiosity (first 5 seconds)
- Use short, punchy sentences. Never more than 15 words per sentence.
- Include specific stats, names, and facts for credibility
- End with a STRONG call-to-action to subscribe/like
- Write ONLY the spoken text — no stage directions, no labels, no markdown
- Make it sound natural and conversational, like an excited sports commentator`;

function buildUserPrompt(article) {
  return `Write a viral YouTube Shorts script about this cricket news.

HEADLINE: ${article.title}
DETAILS: ${article.description || article.content}

The script must be EXACTLY 100-120 words of natural spoken commentary.
Structure: shocking hook (first 2 sentences) → exciting facts/drama → subscribe CTA (last sentence).
Short punchy sentences. Excited sports commentator tone.

Output ONLY this JSON (no markdown, no explanation):
{
  "title": "Catchy YouTube title under 60 chars",
  "fullScript": "THE COMPLETE 100-120 WORD SPOKEN SCRIPT. Write every word out in full.",
  "hashtags": ["cricket", "shorts", "viral", "sports", "ipl", "cricketlovers", "trending"],
  "description": "One sentence YouTube description under 150 chars",
  "thumbnailText": "3-4 bold words for thumbnail"
}`;
}

// ── Provider: Google Gemini (free tier) ───────────────────────────────────────
async function generateWithGemini(article, jobId) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(article)}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  return parseScriptJSON(text);
}

// ── Provider: Groq (free tier — Llama 3) ──────────────────────────────────────
async function generateWithGroq(article, jobId) {
  const Groq = require('groq-sdk');
  const groq = new Groq({ apiKey: config.ai.groqApiKey });

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are a JSON API. Output only valid JSON. No commentary, no markdown, no code fences. The fullScript field must contain the complete spoken script — never a placeholder or summary.',
      },
      { role: 'user', content: buildUserPrompt(article) },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  });

  return parseScriptJSON(response.choices[0].message.content);
}

// ── Provider: Anthropic Claude (paid) ─────────────────────────────────────────
async function generateWithAnthropic(article, jobId) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(article) }],
  });

  return parseScriptJSON(response.content[0].text);
}

// ── Router ─────────────────────────────────────────────────────────────────────
const PROVIDERS = {
  gemini:    { fn: generateWithGemini,    keyField: 'geminiApiKey',    pkg: '@google/generative-ai' },
  groq:      { fn: generateWithGroq,      keyField: 'groqApiKey',      pkg: 'groq-sdk' },
  anthropic: { fn: generateWithAnthropic, keyField: null,              pkg: '@anthropic-ai/sdk' },
};

async function generateScript(article, jobId) {
  const provider = config.ai.provider;
  const p = PROVIDERS[provider];

  if (!p) throw new Error(`Unknown AI provider: "${provider}". Use: gemini, groq, anthropic`);

  // Key check
  if (p.keyField && !config.ai[p.keyField]) {
    throw new Error(`${p.keyField} not set in .env — required for provider "${provider}"`);
  }

  return withRetry(async () => {
    logger.info(`Generating script via ${provider}`, { jobId, headline: article.title });
    const script = await p.fn(article, jobId);
    logger.info(`Script: "${script.title}" (~${estimateWordCount(script.fullScript)} words)`, { jobId });
    return script;
  }, { attempts: 3, label: `Script (${provider})`, jobId });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseScriptJSON(raw) {
  // Strip markdown code fences if present
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON');

  const script = JSON.parse(jsonMatch[0]);

  // Build fullScript from available content
  if (!script.fullScript || script.fullScript.trim().length < 20) {
    const parts = [script.hook, script.body, script.cta].filter(Boolean);
    const reconstructed = parts.join(' ').trim();
    if (reconstructed.length > 20) {
      script.fullScript = reconstructed;
    } else {
      throw new Error('AI returned no script content (fullScript missing or empty)');
    }
  }

  // Ensure title
  if (!script.title) script.title = 'Cricket Viral Moment';

  // Ensure description
  if (!script.description) script.description = script.title;

  // Ensure hashtags array
  if (!Array.isArray(script.hashtags) || !script.hashtags.length) {
    script.hashtags = ['cricket', 'shorts', 'cricketlovers', 'viral', 'sports'];
  }

  return script;
}

function estimateWordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function estimateDurationSeconds(text) {
  return Math.round((estimateWordCount(text) / 130) * 60);
}

module.exports = { generateScript, estimateDurationSeconds };
