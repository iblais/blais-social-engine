const TWITTER_API = 'https://api.twitter.com/2';
const TWITTER_UPLOAD = 'https://upload.twitter.com/1.1';

interface TwitterPostPayload {
  accessToken: string;
  caption: string;
  imageUrl?: string;
}

/** Upload media via Twitter v1.1 media upload (still required for v2 tweets) */
async function uploadMedia(accessToken: string, imageUrl: string): Promise<string> {
  // Download the image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

  const imageBuffer = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

  // Twitter media upload uses multipart form data
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
  const { accessToken, caption, imageUrl } = payload;

  // Twitter has 280 character limit
  const truncated = caption.length > 280 ? caption.slice(0, 277) + '...' : caption;

  const tweetBody: Record<string, unknown> = {
    text: truncated,
  };

  // Upload image if provided
  if (imageUrl) {
    try {
      const mediaId = await uploadMedia(accessToken, imageUrl);
      tweetBody.media = { media_ids: [mediaId] };
    } catch (err) {
      console.error('Twitter media upload failed, posting text-only:', (err as Error).message);
      // Continue without image rather than failing entirely
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
      `Twitter API error ${res.status}: ${err?.detail || err?.title || JSON.stringify(err)}`
    );
  }

  const data = await res.json();
  return data.data?.id;
}
