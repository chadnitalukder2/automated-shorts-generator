#!/usr/bin/env node
'use strict';

/**
 * One-shot trigger script — enqueues a single shorts generation job.
 * Usage: node scripts/trigger.js
 */

require('dotenv').config();
const { addShortsJob } = require('../src/queue/queues');
const logger = require('../src/utils/logger');

(async () => {
  try {
    const job = await addShortsJob({ triggeredBy: 'cli', triggeredAt: new Date().toISOString() });
    logger.info(`Job enqueued: ${job.id}`);
    console.log(`\nJob enqueued: ${job.id}`);
    console.log('Start the worker to process: npm run worker');
    process.exit(0);
  } catch (err) {
    logger.error(`Failed to enqueue job: ${err.message}`);
    console.error(err.message);
    process.exit(1);
  }
})();
