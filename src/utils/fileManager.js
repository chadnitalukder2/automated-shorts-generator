'use strict';

const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

async function ensureOutputDirs() {
  const dirs = [
    config.output.dir,
    path.join(config.output.dir, 'jobs'),
    path.join(config.output.dir, 'logs'),
  ];
  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
}

async function createJobDir(jobId) {
  const dir = path.join(config.output.dir, 'jobs', jobId);
  await fs.ensureDir(dir);
  return dir;
}

function jobPath(jobId, filename) {
  return path.join(config.output.dir, 'jobs', jobId, filename);
}

async function cleanJobDir(jobId) {
  const dir = path.join(config.output.dir, 'jobs', jobId);
  await fs.remove(dir);
}

async function writeJson(filePath, data) {
  await fs.writeJson(filePath, data, { spaces: 2 });
}

async function readJson(filePath) {
  return fs.readJson(filePath);
}

async function fileExists(filePath) {
  return fs.pathExists(filePath);
}

module.exports = { ensureOutputDirs, createJobDir, jobPath, cleanJobDir, writeJson, readJson, fileExists };
