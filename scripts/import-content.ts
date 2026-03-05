/**
 * Import Blais Lab content (Track 1 — Tips & Tricks, Batch 01) into Supabase.
 *
 * Reads 30 days of captions + carousel slides from Google Drive, uploads media
 * to Supabase Storage, and creates posts + post_media records.
 *
 * Usage:
 *   npx tsx scripts/import-content.ts
 *
 * Required env vars (or .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   IMPORT_ACCOUNT_ID  — the social_accounts.id for Blais Lab
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ---------- Config ----------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ACCOUNT_ID = process.env.IMPORT_ACCOUNT_ID!;

if (!SUPABASE_URL || !SUPABASE_KEY || !ACCOUNT_ID) {
  console.error('Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IMPORT_ACCOUNT_ID');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BASE_DIR = 'G:/My Drive/BLAIS SOCIAL ENGINE/BLAIS_LAB_SOCIAL/TRACK_1_TIPS_AND_TRICKS/batch_01';
const CAPTIONS_FILE = path.join(BASE_DIR, 'captions', 'track1_captions_days1to30.txt');
const EDITED_DIR = path.join(BASE_DIR, 'edited');

// Posting times (EST, spread across 6 AM – midnight)
const POST_HOURS = [
  9, 12, 8, 17, 10, 14, 7, 19, 11, 16,
  9, 13, 8, 18, 10, 15, 7, 20, 11, 17,
  9, 12, 8, 14, 10, 16, 7, 19, 11, 13,
];

// ---------- Parse captions ----------

interface DayCaption {
  dayNum: number;
  title: string;
  body: string;
  hashtags: string;
  fullCaption: string;
}

function parseCaptions(raw: string): DayCaption[] {
  const blocks = raw.split(/(?=DAY \d+:)/);
  const results: DayCaption[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^DAY (\d+):\s*(.+)/);
    if (!headerMatch) continue;

    const dayNum = parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();

    const lines = trimmed.split('\n').slice(1); // skip header
    const hashtagLine = lines.findIndex((l) => l.trim().startsWith('#'));
    const bodyLines = hashtagLine >= 0 ? lines.slice(0, hashtagLine) : lines;
    const hashtags = hashtagLine >= 0 ? lines[hashtagLine].trim() : '';

    const body = bodyLines.join('\n').trim();
    const fullCaption = `${title}\n\n${body}${hashtags ? '\n\n' + hashtags : ''}`;

    results.push({ dayNum, title, body, hashtags, fullCaption });
  }

  return results;
}

// ---------- Main ----------

async function main() {
  console.log('Reading captions...');
  const raw = fs.readFileSync(CAPTIONS_FILE, 'utf-8');
  const captions = parseCaptions(raw);
  console.log(`Parsed ${captions.length} days of captions`);

  if (captions.length !== 30) {
    console.warn(`Expected 30 captions, got ${captions.length}`);
  }

  // Get account owner user_id
  const { data: account, error: accErr } = await supabase
    .from('social_accounts')
    .select('user_id')
    .eq('id', ACCOUNT_ID)
    .single();

  if (accErr || !account) {
    console.error('Account not found:', accErr?.message);
    process.exit(1);
  }

  const userId = account.user_id;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1); // start tomorrow

  for (const cap of captions) {
    const dayDir = path.join(EDITED_DIR, `D${String(cap.dayNum).padStart(2, '0')}`);

    if (!fs.existsSync(dayDir)) {
      console.warn(`Skipping Day ${cap.dayNum}: folder ${dayDir} not found`);
      continue;
    }

    const slides = fs.readdirSync(dayDir)
      .filter((f) => f.endsWith('.png'))
      .sort();

    console.log(`Day ${cap.dayNum}: "${cap.title}" — ${slides.length} slides`);

    // Schedule date
    const schedDate = new Date(startDate);
    schedDate.setDate(startDate.getDate() + cap.dayNum - 1);
    const hour = POST_HOURS[(cap.dayNum - 1) % POST_HOURS.length];
    // Convert EST to UTC (+5h)
    schedDate.setUTCHours(hour + 5, 0, 0, 0);

    // Create post
    const { data: post, error: postErr } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        account_id: ACCOUNT_ID,
        platform: 'instagram',
        caption: cap.fullCaption,
        media_type: slides.length > 1 ? 'carousel' : 'image',
        status: 'scheduled',
        scheduled_at: schedDate.toISOString(),
      })
      .select('id')
      .single();

    if (postErr || !post) {
      console.error(`  Failed to create post for Day ${cap.dayNum}:`, postErr?.message);
      continue;
    }

    // Upload slides
    for (let i = 0; i < slides.length; i++) {
      const slideFile = slides[i];
      const filePath = path.join(dayDir, slideFile);
      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `posts/${post.id}/${i}.png`;

      const { error: uploadErr } = await supabase.storage
        .from('media')
        .upload(storagePath, fileBuffer, { contentType: 'image/png' });

      if (uploadErr) {
        console.error(`  Upload error (${slideFile}):`, uploadErr.message);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(storagePath);

      const { error: mediaErr } = await supabase.from('post_media').insert({
        post_id: post.id,
        media_url: publicUrl,
        storage_path: storagePath,
        media_type: 'image',
        sort_order: i,
        file_size: fileBuffer.length,
      });

      if (mediaErr) {
        console.error(`  post_media insert error (${slideFile}):`, mediaErr.message);
      }
    }

    console.log(`  Created post ${post.id} — scheduled ${schedDate.toISOString()}`);
  }

  console.log('\nDone! All 30 days imported.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
