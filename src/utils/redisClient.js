'use strict';

const Redis = require('ioredis');
const config = require('../config');

const redisUrl = process.env.REDIS_URL;

const redis = redisUrl
  ? new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 })
  : new Redis({
      host: config.redis.host,
      port: config.redis.port,
      ...(config.redis.password ? { password: config.redis.password } : {}),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

redis.on('error', (err) => {
  // Non-fatal: dedup degrades gracefully if Redis is unreachable
  if (err.code !== 'ECONNREFUSED') {
    process.stderr.write(`[redis] ${err.message}\n`);
  }
});

module.exports = redis;
