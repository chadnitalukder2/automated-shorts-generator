'use strict';

const { google } = require('googleapis');
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    'urn:ietf:wg:oauth:2.0:oob' // out-of-band for server-side
  );

  oauth2Client.setCredentials({
    refresh_token: config.youtube.refreshToken,
  });

  return oauth2Client;
}

/**
 * Upload a video to YouTube as a Short.
 *
 * @param {object} params
 * @param {string} params.videoPath - Path to final .mp4
 * @param {string} params.title - Video title
 * @param {string} params.description - Video description
 * @param {string[]} params.hashtags - Tags for the video
 * @param {string} params.thumbnailText - Text shown in thumbnail
 * @param {string} params.jobId
 * @returns {Promise<{videoId: string, url: string}>}
 */
// YouTube category IDs: 17 = Sports, 28 = Science & Technology
const YOUTUBE_CATEGORY = { sports: '17', ai: '28' };
const BASE_TAGS = {
  sports: ['cricket', 'cricketshorts', 'shorts', 'cricketlovers'],
  ai:     ['ai', 'artificialintelligence', 'shorts', 'tech', 'technology'],
};

async function uploadToYoutube({ videoPath, title, description, hashtags, thumbnailText, jobId, category = 'sports' }) {
  if (!config.youtube.uploadEnabled) {
    logger.warn('YouTube upload disabled (UPLOAD_ENABLED=false)', { jobId });
    return { videoId: null, url: null, skipped: true };
  }

  validateCredentials();

  return withRetry(async () => {
    logger.info(`Uploading to YouTube: "${title}"`, { jobId });

    const auth = getOAuth2Client();
    const youtube = google.youtube({ version: 'v3', auth });

    const tags = [
      ...(BASE_TAGS[category] || BASE_TAGS.sports),
      ...hashtags.map((t) => t.replace('#', '')),
    ].slice(0, 30); // YouTube max 30 tags

    const hashtagLine = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    const categoryHashtag = category === 'ai' ? '#AI #Tech' : '#Cricket';
    const fullDescription = `${description}\n\n${hashtagLine}\n\n#Shorts ${categoryHashtag}`;

    const fileSize = (await fs.stat(videoPath)).size;

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: title.slice(0, 100), // YouTube title max 100 chars
          description: fullDescription.slice(0, 5000),
          tags,
          categoryId: YOUTUBE_CATEGORY[category] || '17',
          defaultLanguage: 'en',
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    }, {
      onUploadProgress: (evt) => {
        const pct = Math.round((evt.bytesRead / fileSize) * 100);
        if (pct % 20 === 0) {
          logger.info(`Upload progress: ${pct}%`, { jobId });
        }
      },
    });

    const videoId = response.data.id;
    const url = `https://www.youtube.com/shorts/${videoId}`;

    logger.info(`Uploaded successfully: ${url}`, { jobId });
    return { videoId, url };
  }, { attempts: 3, label: 'YouTube upload', jobId });
}

function validateCredentials() {
  const missing = ['clientId', 'clientSecret', 'refreshToken']
    .filter((k) => !config.youtube[k]);

  if (missing.length) {
    throw new Error(`Missing YouTube credentials: ${missing.join(', ')}`);
  }
}

module.exports = { uploadToYoutube };
