'use strict';

const { fetchTrendingNews, selectBestArticle } = require('./cricketNews');
const { fetchTrendingAINews, selectBestAIArticle } = require('./aiNews');
const { filterDuplicates, markArticleUsed } = require('../../utils/deduplication');

async function fetchNews(category, jobId) {
  if (category === 'ai') {
    const articles = await fetchTrendingAINews(jobId);
    const fresh = await filterDuplicates(articles, jobId);
    const best = selectBestAIArticle(fresh.length ? fresh : articles);
    await markArticleUsed(best.url);
    return best;
  }
  // default: sports/cricket
  const articles = await fetchTrendingNews(jobId);
  const fresh = await filterDuplicates(articles, jobId);
  const best = selectBestArticle(fresh.length ? fresh : articles);
  await markArticleUsed(best.url);
  return best;
}

module.exports = { fetchNews };
