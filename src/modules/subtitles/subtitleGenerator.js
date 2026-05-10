'use strict';

const fs = require('fs-extra');
const path = require('path');
const logger = require('../../utils/logger');

const WORDS_PER_CHUNK = 4; // words per subtitle line

/**
 * Generate SRT subtitles from word timings.
 * Groups words into chunks for readability.
 */
async function generateSubtitles(wordTimings, outputDir, jobId) {
  const srtPath = path.join(outputDir, 'subtitles.srt');
  const jsonPath = path.join(outputDir, 'subtitles.json');

  const chunks = groupIntoChunks(wordTimings, WORDS_PER_CHUNK);
  const srtContent = chunksToSRT(chunks);
  const jsonSubtitles = chunksToJSON(chunks);

  await fs.writeFile(srtPath, srtContent, 'utf8');
  await fs.writeJson(jsonPath, jsonSubtitles, { spaces: 2 });

  logger.info(`Subtitles generated: ${chunks.length} entries`, { jobId });
  return { srtPath, jsonPath, chunks: jsonSubtitles };
}

function groupIntoChunks(wordTimings, chunkSize) {
  const chunks = [];
  for (let i = 0; i < wordTimings.length; i += chunkSize) {
    const slice = wordTimings.slice(i, i + chunkSize);
    chunks.push({
      index: chunks.length + 1,
      text: slice.map((w) => w.word).join(' '),
      startMs: slice[0].startMs,
      endMs: slice[slice.length - 1].endMs,
      words: slice,
    });
  }
  return chunks;
}

function chunksToSRT(chunks) {
  return chunks
    .map((c) => {
      const start = msToSRTTime(c.startMs);
      const end = msToSRTTime(c.endMs);
      return `${c.index}\n${start} --> ${end}\n${c.text}\n`;
    })
    .join('\n');
}

function chunksToJSON(chunks) {
  return chunks.map((c) => ({
    index: c.index,
    text: c.text,
    startMs: c.startMs,
    endMs: c.endMs,
    startFrame: msToFrame(c.startMs),
    endFrame: msToFrame(c.endMs),
  }));
}

function msToSRTTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${padMs(milliseconds)}`;
}

function msToFrame(ms, fps = 30) {
  return Math.round((ms / 1000) * fps);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function padMs(n) {
  return String(n).padStart(3, '0');
}

module.exports = { generateSubtitles };
