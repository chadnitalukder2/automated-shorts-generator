'use strict';

const ffmpeg = require('../../utils/ffmpegSetup');
const path = require('path');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

/**
 * Combine base video + audio + burn-in subtitles into final short.
 * Produces a YouTube Shorts-ready 1080x1920 H.264 video.
 */
async function combineMedia({ videoPath, audioPath, subtitlesPath, outputDir, jobId }) {
  return withRetry(async () => {
    const outputPath = path.join(outputDir, 'final.mp4');
    logger.info('Combining video + audio + subtitles with FFmpeg', { jobId });

    await new Promise((resolve, reject) => {
      const subtitleFilter = subtitlesPath
        ? `subtitles='${escapePath(subtitlesPath)}':force_style='FontName=Arial,FontSize=22,Bold=1,Alignment=2,MarginV=80,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=3,Shadow=2'`
        : null;

      let cmd = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 22',
          '-c:a aac',
          '-b:a 256k',
          '-shortest',
          '-movflags +faststart',
          '-pix_fmt yuv420p',
          // Map video from first input, audio from second
          '-map 0:v:0',
          '-map 1:a:0',
        ]);

      if (subtitleFilter) {
        cmd = cmd.videoFilters(subtitleFilter);
      }

      cmd
        .output(outputPath)
        .on('start', (cmdLine) => logger.debug(`FFmpeg: ${cmdLine}`, { jobId }))
        .on('progress', ({ percent }) => {
          if (Math.round(percent) % 25 === 0) {
            logger.info(`FFmpeg progress: ${Math.round(percent)}%`, { jobId });
          }
        })
        .on('end', resolve)
        .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
        .run();
    });

    logger.info(`Final video: ${outputPath}`, { jobId });
    return outputPath;
  }, { attempts: 2, label: 'FFmpeg combine', jobId });
}

/**
 * Escape path for FFmpeg subtitle filter (handles spaces and special chars).
 */
function escapePath(filePath) {
  return filePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

/**
 * Get video duration in seconds using FFprobe.
 */
async function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

module.exports = { combineMedia, getVideoDuration };
