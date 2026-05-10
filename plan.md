# Improvement Plan — Automated Shorts Generator

## Priority: Quick Wins (1–2 hrs each)

### 1. Redis-Backed Daily Counters
**Problem:** In-memory `dailyCounts` resets on worker restart → daily limit bypassed.  
**Fix:** Replace with Redis `INCR` + `EXPIREAT` midnight.
```js
const key = `daily:${category}:${date}`;
const count = await redis.incr(key);
if (count === 1) await redis.expireat(key, tomorrowMidnightUnix);
```
**File:** `src/cron/scheduler.js`

---

### 2. Article Deduplication
**Problem:** Same story can fire multiple jobs in a day.  
**Fix:** Store last 50 used article URLs in Redis set. Skip if URL already in set.
```js
const key = `used-articles`;
const isDupe = await redis.sismember(key, article.url);
if (isDupe) pick next article;
await redis.sadd(key, article.url);
await redis.expire(key, 60 * 60 * 24 * 7); // 7-day window
```
**File:** `src/modules/news/cricketNews.js`

---

### 3. Dead Letter Queue + Failure Alerts
**Problem:** Jobs failing after 3 retries disappear silently.  
**Fix:** BullMQ `onFailed` worker event → move to `shorts-failed` queue + log alert.
```js
worker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} permanently failed: ${err.message}`);
  failedQueue.add('dead', { jobData: job.data, error: err.message });
});
```
**File:** `src/queue/workers.js`

---

### 4. Script Quality Validation
**Problem:** Bad AI output (wrong word count, missing hook) accepted silently.  
**Fix:** After parse, enforce constraints. Retry the AI call if validation fails.
- Word count: 90–125 words (hard reject outside range)
- First sentence: ≤ 15 words (hook rule)
- No placeholder text (`...`, `[insert]`, etc.)

**File:** `src/modules/script/scriptGenerator.js`

---

## Priority: High Value (half day each)

### 5. Auto-Generated Thumbnails
**Problem:** YouTube picks random frame → low CTR.  
**Fix:** Use `sharp` + `canvas` to render thumbnail from `thumbnailText` + article image. Upload via `youtube.thumbnails.set()` post-upload.  
**New file:** `src/modules/video/thumbnailGenerator.js`  
**Integrate in:** `src/queue/jobProcessor.js` (step 7.5, after upload)

---

### 6. Multi-Script Generation + Pick Best
**Problem:** Single AI attempt → no quality floor.  
**Fix:** Generate 2 scripts in parallel, score each:
- Word count accuracy (closer to 110 = higher score)
- Hook length (first sentence ≤ 12 words = bonus)
- Keyword density (viral words from `VIRAL_KEYWORDS`)

Use highest-scoring script.  
**File:** `src/modules/script/scriptGenerator.js`

---

### 7. More News Sources (RSS Feeds)
**Problem:** NewsAPI has rate limits; ESPN scraper is fragile.  
**Fix:** Add RSS feed parsers (no API key needed):
- Cricket: `https://www.espncricinfo.com/rss/content/story/feeds/0.xml`
- Cricket: `https://feeds.bbci.co.uk/sport/cricket/rss.xml`
- AI/Tech: `https://techcrunch.com/feed/`
- AI/Tech: `https://www.theverge.com/rss/index.xml`

Use `rss-parser` npm package. Merge + deduplicate across sources.  
**File:** `src/modules/news/newsRouter.js`

---

### 8. Google Trends Query Selection
**Problem:** `NEWS_QUERIES` array is static, misses what's actually viral today.  
**Fix:** Use `google-trends-api` to fetch trending cricket/AI terms at cron fire time. Replace random query pick with top trending term.
```js
const trends = await googleTrends.dailyTrends({ geo: 'IN', category: 'Sports' });
```
**File:** `src/modules/news/cricketNews.js`

---

## Priority: Bigger Features (1–2 days each)

### 9. YouTube Analytics Feedback Loop
**Problem:** No data on which videos perform best.  
**Fix:** 24h after upload, poll `youtube.videos.list` for `statistics` (views, likes, CTR).  
Store in Redis hash: `analytics:{jobId}` → `{ views, likes, category, topic }`.  
Expose `/admin/analytics` endpoint showing top performers.  
Feed view counts back into `selectBestArticle` keyword weights.  
**New file:** `src/modules/analytics/youtubeAnalytics.js`

---

### 10. Multiple Background Videos
**Problem:** Single muted base video → repetitive visual.  
**Fix:** Create pool of 5–10 B-roll clips per category in `assets/backgrounds/`:
- `sports/`: cricket stadium, pitch close-up, crowd, batting montage
- `ai/`: code scrolling, circuit board, robot, data visualization

Select randomly (or based on article keywords) in `CricketShort.jsx`.  
**File:** `src/remotion/compositions/CricketShort.jsx`

---

## Implementation Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Redis daily counters | 1 hr | High (bug fix) |
| 2 | Article deduplication | 1 hr | High |
| 3 | Dead letter queue | 1 hr | Medium |
| 4 | Script validation | 2 hrs | High |
| 5 | RSS news sources | 3 hrs | High |
| 6 | Multi-script + pick best | 3 hrs | Medium |
| 7 | Auto thumbnails | 4 hrs | Very High (CTR) |
| 8 | Google Trends queries | 3 hrs | Medium |
| 9 | Analytics feedback loop | 1 day | High (long term) |
| 10 | Multiple backgrounds | 1 day | Medium (visual) |
