'use strict';

const cron = require('node-cron');
const { addShortsJob, getQueueStats } = require('../queue/queues');
const config = require('../config');
const logger = require('../utils/logger');

// Per-category daily counters (reset at midnight)
const dailyCounts = {
  sports: { date: '', count: 0 },
  ai:     { date: '', count: 0 },
};

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function canAddJob(category) {
  const limit = config.shorts.categories[category]?.maxDailyUploads ?? 2;
  const counter = dailyCounts[category];
  const today = getTodayDate();
  if (counter.date !== today) {
    counter.date = today;
    counter.count = 0;
  }
  return counter.count < limit;
}

async function triggerGeneration(category) {
  if (!canAddJob(category)) {
    const limit = config.shorts.categories[category]?.maxDailyUploads ?? 2;
    logger.info(`Daily limit reached for [${category}] (${limit}). Skipping.`);
    return;
  }

  try {
    const stats = await getQueueStats();
    if (stats.active + stats.waiting >= 4) {
      logger.warn(`Queue busy (${stats.active} active, ${stats.waiting} waiting). Skipping [${category}].`);
      return;
    }

    const job = await addShortsJob({
      category,
      triggeredBy: 'cron',
      triggeredAt: new Date().toISOString(),
    });

    dailyCounts[category].count += 1;
    const limit = config.shorts.categories[category]?.maxDailyUploads ?? 2;
    logger.info(`Cron triggered [${category}] job ${job.id} (${dailyCounts[category].count}/${limit} today)`);
  } catch (err) {
    logger.error(`Cron trigger failed [${category}]: ${err.message}`);
  }
}

function startScheduler() {
  const categories = Object.keys(config.shorts.categories);

  for (const category of categories) {
    const schedule = config.shorts.categories[category].cronSchedule;

    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression for [${category}]: ${schedule}`);
    }

    logger.info(`Scheduler [${category}] started — cron: "${schedule}" UTC`);

    cron.schedule(schedule, () => {
      logger.info(`Cron fired [${category}] — triggering generation`);
      triggerGeneration(category);
    }, { timezone: 'UTC' });
  }

  // Daily stats log at midnight
  cron.schedule('0 0 * * *', async () => {
    const stats = await getQueueStats();
    logger.info('Daily queue stats', stats);
  });
}

module.exports = { startScheduler, triggerGeneration };
