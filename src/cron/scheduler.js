'use strict';

const cron = require('node-cron');
const { addShortsJob, getQueueStats } = require('../queue/queues');
const config = require('../config');
const logger = require('../utils/logger');

const dailyCount = { date: '', count: 0 };

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function canAddJob() {
  const today = getTodayDate();
  if (dailyCount.date !== today) {
    dailyCount.date = today;
    dailyCount.count = 0;
  }
  return dailyCount.count < config.shorts.maxDailyUploads;
}

async function triggerShortsGeneration() {
  if (!canAddJob()) {
    logger.info(`Daily limit reached (${config.shorts.maxDailyUploads}). Skipping.`);
    return;
  }

  try {
    const stats = await getQueueStats();
    if (stats.active + stats.waiting >= 3) {
      logger.warn(`Queue busy (${stats.active} active, ${stats.waiting} waiting). Skipping.`);
      return;
    }

    const job = await addShortsJob({ triggeredBy: 'cron', triggeredAt: new Date().toISOString() });
    dailyCount.count += 1;

    logger.info(`Cron triggered job ${job.id} (${dailyCount.count}/${config.shorts.maxDailyUploads} today)`);
  } catch (err) {
    logger.error(`Cron trigger failed: ${err.message}`);
  }
}

function startScheduler() {
  const schedule = config.shorts.cronSchedule;

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron expression: ${schedule}`);
  }

  logger.info(`Scheduler started — cron: "${schedule}"`);

  cron.schedule(schedule, () => {
    logger.info('Cron fired — triggering shorts generation');
    triggerShortsGeneration();
  }, {
    timezone: 'UTC',
  });

  // Also schedule a daily stats log
  cron.schedule('0 0 * * *', async () => {
    const stats = await getQueueStats();
    logger.info('Daily queue stats', stats);
  });
}

module.exports = { startScheduler, triggerShortsGeneration };
