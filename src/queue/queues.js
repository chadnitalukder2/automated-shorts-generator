'use strict';

const { Queue } = require('bullmq');
const config = require('../config');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password ? { password: config.redis.password } : {}),
};

const shortsQueue = new Queue(config.queue.name, {
  connection,
  defaultJobOptions: config.queue.defaultJobOptions,
});

async function addShortsJob(data = {}) {
  const job = await shortsQueue.add('generate-short', data, {
    jobId: `short-${Date.now()}`,
  });
  return job;
}

async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    shortsQueue.getWaitingCount(),
    shortsQueue.getActiveCount(),
    shortsQueue.getCompletedCount(),
    shortsQueue.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
}

module.exports = { shortsQueue, addShortsJob, getQueueStats, connection };
