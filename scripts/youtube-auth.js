#!/usr/bin/env node
'use strict';

/**
 * One-time YouTube OAuth2 setup.
 * Run: node scripts/youtube-auth.js
 * Prints the YOUTUBE_REFRESH_TOKEN to paste into .env
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌  YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in .env first.\n');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'http://localhost');

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
  prompt: 'consent',   // forces refresh_token to be returned
});

console.log('\n══════════════════════════════════════════════════════');
console.log('  YouTube OAuth Setup');
console.log('══════════════════════════════════════════════════════\n');
console.log('STEP 1 — Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n──────────────────────────────────────────────────────');
console.log('STEP 2 — Sign in with your YouTube account → click Allow');
console.log('──────────────────────────────────────────────────────');
console.log('STEP 3 — Browser shows "localhost refused to connect"');
console.log('         That is NORMAL. Look at the URL bar — copy the');
console.log('         value after  code=  (stops at  &scope  or end)');
console.log('         Example: 4/0AY0e-g7abc123...');
console.log('──────────────────────────────────────────────────────\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the code here and press Enter: ', async (code) => {
  rl.close();

  const cleanCode = code.trim().split('&')[0]; // strip any extra params

  try {
    const { tokens } = await oauth2Client.getToken(cleanCode);

    if (!tokens.refresh_token) {
      console.error('\n❌  No refresh_token returned.');
      console.error('   Fix: Go to https://myaccount.google.com/permissions');
      console.error('   Remove "Automate Video Generator" access, then re-run this script.\n');
      process.exit(1);
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log('✅  Success! Add this line to your .env file:\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n══════════════════════════════════════════════════════\n');

    // Also show channel ID if possible
    oauth2Client.setCredentials(tokens);
    try {
      const yt = google.youtube({ version: 'v3', auth: oauth2Client });
      const res = await yt.channels.list({ part: ['id', 'snippet'], mine: true });
      const ch = res.data.items?.[0];
      if (ch) {
        console.log(`Your channel: ${ch.snippet.title}`);
        console.log(`YOUTUBE_CHANNEL_ID=${ch.id}\n`);
      }
    } catch (_) {}

  } catch (err) {
    console.error('\n❌  Token exchange failed:', err.message);
    console.error('   The code may have expired (valid for ~60 seconds).');
    console.error('   Re-run this script and paste the code faster.\n');
    process.exit(1);
  }
});
