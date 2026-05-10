'use strict';

const config = require('../../config');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

const SYSTEM_PROMPTS = {
  sports: `You are a viral YouTube Shorts scriptwriter specializing in cricket content.
Your scripts are high-energy, punchy, and optimized for maximum engagement.

Rules:
- Total script must be 45-55 seconds when spoken at a normal pace (~130 words/min = ~100-120 words)
- Start with a HOOK that creates instant curiosity (first 5 seconds)
- Use short, punchy sentences. Never more than 15 words per sentence.
- Include specific stats, names, and facts for credibility
- End with a STRONG call-to-action to subscribe/like
- Write ONLY the spoken text — no stage directions, no labels, no markdown
- Make it sound natural and conversational, like an excited sports commentator`,

  ai: `You are a viral YouTube Shorts scriptwriter specializing in AI and technology news.
Your scripts are mind-blowing, punchy, and make complex tech feel exciting and relatable.

Rules:
- Total script must be 45-55 seconds when spoken at a normal pace (~130 words/min = ~100-120 words)
- Start with a HOOK that makes the listener think "wait, what?!" (first 5 seconds)
- Use short, punchy sentences. Never more than 15 words per sentence.
- Explain tech simply — no jargon, speak like you're telling a friend something wild
- Include real company names, numbers, and facts for credibility
- End with a STRONG call-to-action to subscribe/like
- Write ONLY the spoken text — no stage directions, no labels, no markdown
- Make it sound like an excited tech journalist breaking huge news`,
};

const CATEGORY_META = {
  sports: {
    topic: 'cricket news',
    tone: 'Excited sports commentator tone.',
    hashtags: ['cricket', 'shorts', 'viral', 'sports', 'ipl', 'cricketlovers', 'trending'],
  },
  ai: {
    topic: 'AI and tech news',
    tone: 'Excited tech journalist breaking big news.',
    hashtags: ['ai', 'shorts', 'viral', 'tech', 'artificialintelligence', 'technology', 'trending'],
  },
};

function buildUserPrompt(article, category = 'sports') {
  const meta = CATEGORY_META[category] || CATEGORY_META.sports;
  return `Write a viral YouTube Shorts script about this ${meta.topic}.

HEADLINE: ${article.title}
DETAILS: ${article.description || article.content}

The script must be EXACTLY 100-120 words of natural spoken commentary.
Structure: shocking hook (first 2 sentences) → exciting facts/drama → subscribe CTA (last sentence).
Short punchy sentences. ${meta.tone}

Output ONLY this JSON (no markdown, no explanation):
{
  "title": "Catchy YouTube title under 60 chars",
  "fullScript": "THE COMPLETE 100-120 WORD SPOKEN SCRIPT. Write every word out in full.",
  "hashtags": ${JSON.stringify(meta.hashtags)},
  "description": "One sentence YouTube description under 150 chars",
  "thumbnailText": "3-4 bold words for thumbnail"
}`;
}

// ── Provider: Google Gemini (free tier) ───────────────────────────────────────
async function generateWithGemini(article, jobId, category) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const systemPrompt = SYSTEM_PROMPTS[category] || SYSTEM_PROMPTS.sports;
  const prompt = `${systemPrompt}\n\n${buildUserPrompt(article, category)}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  return parseScriptJSON(text, category);
}

// ── Provider: Groq (free tier — Llama 3) ──────────────────────────────────────
async function generateWithGroq(article, jobId, category) {
  const Groq = require('groq-sdk');
  const groq = new Groq({ apiKey: config.ai.groqApiKey });

  const systemPrompt = SYSTEM_PROMPTS[category] || SYSTEM_PROMPTS.sports;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `${systemPrompt}\n\nYou are also a JSON API. Output only valid JSON. No commentary, no markdown, no code fences. The fullScript field must contain the complete spoken script — never a placeholder or summary.`,
      },
      { role: 'user', content: buildUserPrompt(article, category) },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  });

  return parseScriptJSON(response.choices[0].message.content, category);
}

// ── Provider: Anthropic Claude (paid) ─────────────────────────────────────────
async function generateWithAnthropic(article, jobId, category) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const systemPrompt = SYSTEM_PROMPTS[category] || SYSTEM_PROMPTS.sports;

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: buildUserPrompt(article, category) }],
  });

  return parseScriptJSON(response.content[0].text, category);
}

// ── Router ─────────────────────────────────────────────────────────────────────
const PROVIDERS = {
  gemini:    { fn: generateWithGemini,    keyField: 'geminiApiKey',    pkg: '@google/generative-ai' },
  groq:      { fn: generateWithGroq,      keyField: 'groqApiKey',      pkg: 'groq-sdk' },
  anthropic: { fn: generateWithAnthropic, keyField: null,              pkg: '@anthropic-ai/sdk' },
};

async function generateScript(article, jobId, category = 'sports') {
  const provider = config.ai.provider;
  const p = PROVIDERS[provider];

  if (!p) throw new Error(`Unknown AI provider: "${provider}". Use: gemini, groq, anthropic`);

  if (p.keyField && !config.ai[p.keyField]) {
    throw new Error(`${p.keyField} not set in .env — required for provider "${provider}"`);
  }

  return withRetry(async () => {
    logger.info(`Generating script via ${provider} [${category}]`, { jobId, headline: article.title });
    const script = await p.fn(article, jobId, category);
    logger.info(`Script: "${script.title}" (~${estimateWordCount(script.fullScript)} words)`, { jobId });
    return script;
  }, { attempts: 3, label: `Script (${provider}/${category})`, jobId });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseScriptJSON(raw, category = 'sports') {
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

  const meta = CATEGORY_META[category] || CATEGORY_META.sports;

  if (!script.title) script.title = category === 'ai' ? 'AI Viral Moment' : 'Cricket Viral Moment';
  if (!script.description) script.description = script.title;
  if (!Array.isArray(script.hashtags) || !script.hashtags.length) {
    script.hashtags = meta.hashtags;
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
