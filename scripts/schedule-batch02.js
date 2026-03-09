const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://mzwleneitsihjwfzfuho.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16d2xlbmVpdHNpaGp3ZnpmdWhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY0NzEyOCwiZXhwIjoyMDg4MjIzMTI4fQ.HDgn2em010TumtXt-yuLBLbcYHAeZKYcDFn2suoEoKc';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const USER_ID = '27d1a8aa-febb-44ac-a071-1e35ce4385a1';
const ACCOUNTS = {
  instagram: '642f478e-670b-4cdc-85cf-0a1c3e723eae',
  facebook: '0e6499b6-f8c3-4cde-a0e9-81b128877082',
  bluesky: 'a17a902f-e393-4062-a19c-42c1ae2f27d7',
};

const BASE_DIR = 'G:/My Drive/BLAIS SOCIAL ENGINE/BLAIS_LAB_SOCIAL/TRACK_1_TIPS_AND_TRICKS/batch_02';
const TOTAL_POSTS = 14;

// Schedule: 1 post per day starting March 21, varied hours
const SCHEDULE_HOURS = [10, 14, 11, 15, 12, 16, 10, 13, 11, 15, 12, 14, 10, 16]; // varied times

async function run() {
  let created = 0;
  let errors = 0;

  for (let postNum = 1; postNum <= TOTAL_POSTS; postNum++) {
    const paddedNum = String(postNum).padStart(2, '0');
    const captionPath = path.join(BASE_DIR, 'captions', `post_${paddedNum}.txt`);
    const caption = fs.readFileSync(captionPath, 'utf-8').trim();

    const slideDir = path.join(BASE_DIR, 'edited', `post_${postNum}`);
    const slides = fs.readdirSync(slideDir)
      .filter(f => /\.png$/i.test(f))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/(\d+)/)[1]);
        const bNum = parseInt(b.match(/(\d+)/)[1]);
        return aNum - bNum;
      });

    // Schedule date: March 21 + (postNum-1) days
    const dayOffset = postNum - 1;
    const hour = SCHEDULE_HOURS[dayOffset];
    const minute = Math.floor(Math.random() * 40) + 10; // 10-49 min
    const scheduledAt = new Date(Date.UTC(2026, 2, 21 + dayOffset, hour, minute, 0));

    console.log(`\n=== Post ${postNum}: ${scheduledAt.toISOString()} (${slides.length} slides) ===`);
    console.log(`  Caption: ${caption.substring(0, 60)}...`);

    // Upload slides to Supabase storage
    const mediaUrls = [];
    for (const slide of slides) {
      const filePath = path.join(slideDir, slide);
      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `posts/${USER_ID}/batch02/post_${paddedNum}/${slide}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error(`  UPLOAD ERROR ${slide}:`, uploadError.message);
        errors++;
        continue;
      }

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
      mediaUrls.push({ url: urlData.publicUrl, storagePath, slide });
      console.log(`  Uploaded: ${slide}`);
    }

    if (mediaUrls.length === 0) {
      console.error(`  SKIP: No media uploaded for post ${postNum}`);
      errors++;
      continue;
    }

    // Create post for each platform
    for (const [platform, accountId] of Object.entries(ACCOUNTS)) {
      const mediaType = platform === 'instagram' && mediaUrls.length > 1 ? 'carousel' : 'image';

      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: USER_ID,
          account_id: accountId,
          platform,
          caption,
          media_type: mediaType,
          status: 'scheduled',
          scheduled_at: scheduledAt.toISOString(),
        })
        .select('id')
        .single();

      if (postError) {
        console.error(`  POST ERROR (${platform}):`, postError.message);
        errors++;
        continue;
      }

      // Insert post_media records
      const mediaRecords = mediaUrls.map((m, idx) => ({
        post_id: post.id,
        media_url: m.url,
        storage_path: m.storagePath,
        media_type: 'image',
        sort_order: idx,
      }));

      const { error: mediaError } = await supabase
        .from('post_media')
        .insert(mediaRecords);

      if (mediaError) {
        console.error(`  MEDIA ERROR (${platform}):`, mediaError.message);
        errors++;
        continue;
      }

      console.log(`  ✓ ${platform}: ${post.id} (${mediaType}, ${mediaUrls.length} images)`);
      created++;
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Created: ${created} posts`);
  console.log(`Errors: ${errors}`);
}

run().catch(console.error);
