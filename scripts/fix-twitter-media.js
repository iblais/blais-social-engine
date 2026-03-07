const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get all twitter posts we just created (they have no media yet)
  const { data: twitterPosts } = await c.from('posts')
    .select('id, caption, post_media(id)')
    .eq('platform', 'twitter')
    .eq('status', 'scheduled');

  const noMedia = twitterPosts ? twitterPosts.filter(p => !p.post_media || p.post_media.length === 0) : [];
  console.log(`Twitter posts without media: ${noMedia.length}`);

  // For each, find the matching IG post by caption and copy its media
  let linked = 0;
  for (const tp of noMedia) {
    const captionPrefix = (tp.caption || '').substring(0, 100);

    // Find matching IG or FB post with media
    const { data: match } = await c.from('posts')
      .select('id, post_media(media_url, media_type)')
      .neq('platform', 'twitter')
      .like('caption', captionPrefix + '%')
      .limit(1)
      .single();

    if (match && match.post_media && match.post_media.length > 0) {
      const mediaRows = match.post_media.map(m => ({
        post_id: tp.id,
        media_url: m.media_url,
        media_type: m.media_type || 'image',
      }));
      const { error } = await c.from('post_media').insert(mediaRows);
      if (error) {
        console.error('Error for', tp.id, error.message);
      } else {
        linked++;
      }
    }
  }

  console.log(`Linked media to ${linked} Twitter posts`);
  process.exit(0);
})();
