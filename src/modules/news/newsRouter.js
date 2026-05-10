'use strict';

const { fetchTrendingNews, selectBestArticle } = require('./cricketNews');
const { fetchTrendingAINews, selectBestAIArticle } = require('./aiNews');

async function fetchNews(category, jobId) {
  if (category === 'ai') {
    const articles = await fetchTrendingAINews(jobId);
    return selectBestAIArticle(articles);
  }
  // default: sports/cricket
  const articles = await fetchTrendingNews(jobId);
  return selectBestArticle(articles);
}

module.exports = { fetchNews };
