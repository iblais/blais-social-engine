const TWITTER_API = 'https://api.twitter.com/2';
const TWITTER_UPLOAD = 'https://upload.twitter.com/1.1';

interface TwitterPostPayload {
  accessToken: string;
  caption: string;
  imageUrl?: string;
  imageUrls?: string[];  // multi-image (up to 4)
}

/** Upload media via Twitter v1.1 media upload (still required for v2 tweets) */
async function uploadMedia(accessToken: string, imageUrl: string): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

  const imageBuffer = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

  const blob = new Blob([imageBuffer], { type: contentType });
  const form = new FormData();
  form.append('media', blob, 'image.jpg');
  form.append('media_category', 'tweet_image');

  const uploadRes = await fetch(`${TWITTER_UPLOAD}/media/upload.json`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(`Twitter media upload failed ${uploadRes.status}: ${JSON.stringify(err)}`);
  }

  const data = await uploadRes.json();
  return data.media_id_string;
}

export async function publishTwitterPost(payload: TwitterPostPayload): Promise<string> {
  const { accessToken, caption, imageUrl, imageUrls } = payload;

  // Twitter has 280 character limit
  const truncated = caption.length > 280 ? caption.slice(0, 277) + '...' : caption;

  const tweetBody: Record<string, unknown> = {
    text: truncated,
  };

  // Collect all image URLs to upload (max 4 for Twitter)
  const urlsToUpload: string[] = [];
  if (imageUrls && imageUrls.length > 1) {
    // Multi-image: use all provided URLs (capped at 4 by cron)
    urlsToUpload.push(...imageUrls.slice(0, 4));
  } else if (imageUrl) {
    urlsToUpload.push(imageUrl);
  }

  // Upload all images
  if (urlsToUpload.length > 0) {
    try {
      const mediaIds: string[] = [];
      for (const url of urlsToUpload) {
        const mediaId = await uploadMedia(accessToken, url);
        mediaIds.push(mediaId);
      }
      tweetBody.media = { media_ids: mediaIds };
    } catch (err) {
      console.error('Twitter media upload failed, posting text-only:', (err as Error).message);
      // Continue without images rather than failing entirely
    }
  }

  const res = await fetch(`${TWITTER_API}/tweets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(tweetBody),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Twitter API error ${res.status}: ${(err as Record<string, string>)?.detail || (err as Record<string, string>)?.title || JSON.stringify(err)}`
    );
  }

  const data = await res.json();
  return (data as Record<string, Record<string, string>>).data?.id;
}
