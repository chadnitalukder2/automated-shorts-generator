'use strict';

const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, stack, jobId, ...meta }) => {
    const job = jobId ? ` [${jobId}]` : '';
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}${job}: ${stack || message}${extra}`;
  })
);

const fileFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: config.logLevel,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.DailyRotateFile({
      format: fileFormat,
      dirname: path.join(config.output.dir, 'logs'),
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
    }),
    new winston.transports.DailyRotateFile({
      format: fileFormat,
      level: 'error',
      dirname: path.join(config.output.dir, 'logs'),
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
});

logger.child = (meta) => logger.child(meta);

module.exports = logger;
