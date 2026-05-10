'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../../config');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

const NEWS_QUERIES = [
  'cricket match today',
  'IPL 2025',
  'cricket world cup',
  'test cricket news',
  'cricket viral moment',
];

/**
 * Fetch trending cricket news from NewsAPI.
 * Falls back to ESPN Cricinfo scraping if API key not set.
 */
async function fetchTrendingNews(jobId) {
  if (config.news.apiKey) {
    return fetchFromNewsAPI(jobId);
  }
  logger.warn('NEWS_API_KEY not set — falling back to ESPN scraper', { jobId });
  return fetchFromESPN(jobId);
}

async function fetchFromNewsAPI(jobId) {
  return withRetry(async () => {
    const query = NEWS_QUERIES[Math.floor(Math.random() * NEWS_QUERIES.length)];
    logger.info(`Fetching news from NewsAPI: "${query}"`, { jobId });

    const { data } = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: config.news.maxArticles,
        apiKey: config.news.apiKey,
      },
      timeout: 10000,
    });

    if (!data.articles?.length) throw new Error('No articles returned from NewsAPI');

    const articles = data.articles
      .filter((a) => a.title && a.description)
      .map((a) => ({
        title: a.title,
        description: a.description,
        content: a.content || a.description,
        url: a.url,
        publishedAt: a.publishedAt,
        source: a.source?.name || 'NewsAPI',
        imageUrl: a.urlToImage,
      }));

    logger.info(`Fetched ${articles.length} articles`, { jobId });
    return articles;
  }, { attempts: 3, label: 'NewsAPI fetch', jobId });
}

async function fetchFromESPN(jobId) {
  return withRetry(async () => {
    logger.info('Scraping ESPN Cricinfo headlines', { jobId });

    const { data } = await axios.get('https://www.espncricinfo.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CricketBot/1.0)',
        Accept: 'text/html',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const articles = [];

    $('a[href*="/story/"]').each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr('href');
      if (title.length > 20 && articles.length < config.news.maxArticles) {
        articles.push({
          title,
          description: title,
          content: title,
          url: href?.startsWith('http') ? href : `https://www.espncricinfo.com${href}`,
          publishedAt: new Date().toISOString(),
          source: 'ESPN Cricinfo',
          imageUrl: null,
        });
      }
    });

    if (!articles.length) throw new Error('No articles scraped from ESPN');
    logger.info(`Scraped ${articles.length} articles from ESPN`, { jobId });
    return articles;
  }, { attempts: 3, label: 'ESPN scraper', jobId });
}

/**
 * Pick the most engaging article based on heuristics.
 */
function selectBestArticle(articles) {
  const VIRAL_KEYWORDS = [
    'century', 'wickets', 'record', 'fastest', 'hat-trick', 'final',
    'world cup', 'ipl', 'thriller', 'shocking', 'historic', 'upset',
    'sixes', 'controversy', 'stunning', 'incredible',
  ];

  const scored = articles.map((a) => {
    const text = (a.title + ' ' + a.description).toLowerCase();
    const score = VIRAL_KEYWORDS.reduce((acc, kw) => acc + (text.includes(kw) ? 2 : 0), 0);
    return { ...a, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0];
}

module.exports = { fetchTrendingNews, selectBestArticle };
