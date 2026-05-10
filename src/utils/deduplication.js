'use strict';

const crypto = require('crypto');
const redis = require('./redisClient');
const logger = require('./logger');

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function urlKey(url) {
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
  return `shorts:seen:${hash}`;
}

async function isArticleUsed(url) {
  try {
    return (await redis.get(urlKey(url))) !== null;
  } catch {
    return false; // Redis unavailable → allow article through
  }
}

async function markArticleUsed(url) {
  try {
    await redis.set(urlKey(url), '1', 'EX', TTL_SECONDS);
  } catch (err) {
    logger.warn(`dedup: failed to mark article used: ${err.message}`);
  }
}

/**
 * Returns subset of articles not seen in the last 7 days.
 * Logs how many were filtered. Returns original array if Redis fails.
 */
async function filterDuplicates(articles, jobId) {
  try {
    const checks = await Promise.all(articles.map((a) => isArticleUsed(a.url)));
    const fresh = articles.filter((_, i) => !checks[i]);
    const skipped = articles.length - fresh.length;
    if (skipped > 0) {
      logger.info(`dedup: skipped ${skipped} already-used article(s)`, { jobId });
    }
    return fresh;
  } catch {
    return articles;
  }
}

module.exports = { isArticleUsed, markArticleUsed, filterDuplicates };
