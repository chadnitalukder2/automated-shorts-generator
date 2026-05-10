'use strict';

require('dotenv').config();
const { Worker } = require('bullmq');
const { connection } = require('./queues');
const { processShortJob } = require('./jobProcessor');
const { ensureOutputDirs } = require('../utils/fileManager');
const config = require('../config');
const logger = require('../utils/logger');

async function startWorker() {
  await ensureOutputDirs();

  const worker = new Worker(
    config.queue.name,
    async (job) => {
      logger.info(`Worker picked up job: ${job.id} (name: ${job.name})`);
      return processShortJob(job);
    },
    {
      connection,
      concurrency: config.queue.concurrency,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed`, {
      title: result.title,
      youtubeUrl: result.youtubeUrl,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`, {
      stack: err.stack,
    });
  });

  worker.on('progress', (job, progress) => {
    logger.debug(`Job ${job.id} progress: ${progress}%`);
  });

  worker.on('error', (err) => {
    logger.error(`Worker error: ${err.message}`);
  });

  logger.info(`Worker started — queue: "${config.queue.name}", concurrency: ${config.queue.concurrency}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received — closing worker gracefully');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received — closing worker gracefully');
    await worker.close();
    process.exit(0);
  });

  return worker;
}

// Run if invoked directly (not required as module)
if (require.main === module) {
  startWorker().catch((err) => {
    logger.error(`Failed to start worker: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { startWorker };
