'use strict';

const pRetry = require('p-retry');
const logger = require('./logger');

async function withRetry(fn, options = {}) {
  const { attempts = 3, label = 'operation', jobId } = options;

  return pRetry(fn, {
    retries: attempts - 1,
    factor: 2,
    minTimeout: 2000,
    maxTimeout: 30000,
    onFailedAttempt: (error) => {
      logger.warn(`${label} attempt ${error.attemptNumber}/${attempts} failed: ${error.message}`, { jobId });
    },
  });
}

module.exports = { withRetry };
