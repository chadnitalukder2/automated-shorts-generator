'use strict';

/**
 * Configure fluent-ffmpeg to use the bundled ffmpeg binary from @ffmpeg-installer/ffmpeg.
 * Call once at startup before any ffmpeg usage.
 */
const ffmpeg = require('fluent-ffmpeg');

try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  ffmpeg.setFfprobePath(ffmpegInstaller.path.replace('ffmpeg', 'ffprobe'));
} catch (_) {
  // System ffmpeg in PATH — no setup needed
}

module.exports = ffmpeg;
