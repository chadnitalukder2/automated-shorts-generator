'use strict';

require('dotenv').config();
const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { startWorker } = require('./queue/workers');
const { startScheduler } = require('./cron/scheduler');
const { addShortsJob, getQueueStats, shortsQueue } = require('./queue/queues');
const { ensureOutputDirs } = require('./utils/fileManager');
const config = require('./config');
const logger = require('./utils/logger');

async function main() {
  logger.info(`Starting Automated Shorts Generator [${config.env}]`);

  await ensureOutputDirs();

  // ── Worker ────────────────────────────────────────────────────────────────
  await startWorker();

  // ── Cron Scheduler ────────────────────────────────────────────────────────
  startScheduler();

  // ── HTTP API ──────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // ── Bull Board (queue dashboard UI) ───────────────────────────────────────
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(shortsQueue)],
    serverAdapter: boardAdapter,
  });
  app.use('/admin/queues', boardAdapter.getRouter());

  // Health check
  app.get('/health', async (req, res) => {
    const stats = await getQueueStats();
    res.json({
      status: 'ok',
      env: config.env,
      queue: stats,
      uploadEnabled: config.youtube.uploadEnabled,
      timestamp: new Date().toISOString(),
    });
  });

  // Manually trigger a shorts generation
  app.post('/generate', async (req, res) => {
    try {
      const job = await addShortsJob({
        triggeredBy: 'api',
        ...req.body,
      });
      logger.info(`API triggered job: ${job.id}`);
      res.status(202).json({ jobId: job.id, status: 'queued' });
    } catch (err) {
      logger.error(`API trigger failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Queue stats
  app.get('/stats', async (req, res) => {
    const stats = await getQueueStats();
    res.json(stats);
  });

  app.listen(config.port, () => {
    logger.info(`HTTP API listening on port ${config.port}`);
    logger.info(`GET  /admin/queues — Bull Board dashboard (UI)`);
    logger.info(`POST /generate     — trigger shorts generation`);
    logger.info(`GET  /health       — health check`);
    logger.info(`GET  /stats        — queue statistics`);
  });

  // Global error handlers
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error(`Startup failed: ${err.message}`);
  process.exit(1);
});
