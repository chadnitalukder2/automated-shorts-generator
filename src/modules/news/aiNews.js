'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../../config');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

const AI_QUERIES = [
  'artificial intelligence breakthrough 2025',
  'ChatGPT OpenAI news',
  'Google AI Gemini update',
  'machine learning research',
  'AI startup funding',
  'large language model release',
  'robotics AI news',
];

const VIRAL_KEYWORDS_AI = [
  'breakthrough', 'launch', 'release', 'record', 'beats', 'surpasses',
  'revolutionary', 'shocking', 'first ever', 'billion', 'fired', 'ban',
  'regulation', 'leaked', 'exclusive', 'stunning', 'new model',
];

async function fetchTrendingAINews(jobId) {
  if (config.news.apiKey) {
    return fetchFromNewsAPI(jobId);
  }
  logger.warn('NEWS_API_KEY not set — falling back to TechCrunch scraper', { jobId });
  return fetchFromTechCrunch(jobId);
}

async function fetchFromNewsAPI(jobId) {
  return withRetry(async () => {
    const query = AI_QUERIES[Math.floor(Math.random() * AI_QUERIES.length)];
    logger.info(`Fetching AI news from NewsAPI: "${query}"`, { jobId });

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

    if (!data.articles?.length) throw new Error('No AI articles returned from NewsAPI');

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

    logger.info(`Fetched ${articles.length} AI articles`, { jobId });
    return articles;
  }, { attempts: 3, label: 'NewsAPI AI fetch', jobId });
}

async function fetchFromTechCrunch(jobId) {
  return withRetry(async () => {
    logger.info('Scraping TechCrunch AI headlines', { jobId });

    const { data } = await axios.get('https://techcrunch.com/category/artificial-intelligence/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        Accept: 'text/html',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const articles = [];

    $('a.loop-card__title-link, h2.wp-block-post-title a, .post-block__title a').each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr('href');
      if (title.length > 20 && articles.length < config.news.maxArticles) {
        articles.push({
          title,
          description: title,
          content: title,
          url: href?.startsWith('http') ? href : `https://techcrunch.com${href}`,
          publishedAt: new Date().toISOString(),
          source: 'TechCrunch',
          imageUrl: null,
        });
      }
    });

    if (!articles.length) throw new Error('No articles scraped from TechCrunch');
    logger.info(`Scraped ${articles.length} AI articles from TechCrunch`, { jobId });
    return articles;
  }, { attempts: 3, label: 'TechCrunch scraper', jobId });
}

function selectBestAIArticle(articles) {
  const scored = articles.map((a) => {
    const text = (a.title + ' ' + (a.description || '')).toLowerCase();
    const score = VIRAL_KEYWORDS_AI.reduce((acc, kw) => acc + (text.includes(kw) ? 2 : 0), 0);
    return { ...a, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0];
}

module.exports = { fetchTrendingAINews, selectBestAIArticle };
