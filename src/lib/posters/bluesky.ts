import sharp from 'sharp';

const BSKY_API = 'https://bsky.social/xrpc';
const BSKY_MAX_IMAGE_SIZE = 950_000; // ~950KB to stay safely under 1MB limit

interface BlueskyPostPayload {
  handle: string;       // e.g. 'user.bsky.social'
  appPassword: string;  // app password stored as access_token
  caption: string;
  imageUrl?: string;
  imageUrls?: string[];  // multi-image (up to 4 on Bluesky)
}

interface BlueskySession {
  did: string;
  accessJwt: string;
}

async function createSession(handle: string, appPassword: string): Promise<BlueskySession> {
  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Bluesky auth failed ${res.status}: ${err?.message || res.statusText}`);
  }

  const data = await res.json();
  return { did: data.did, accessJwt: data.accessJwt };
}

/** Compress image to fit within Bluesky's ~1MB limit */
async function compressImage(buffer: Buffer): Promise<{ data: Buffer; mimeType: string }> {
  // If already under limit, return as-is (as jpeg for consistency)
  if (buffer.byteLength <= BSKY_MAX_IMAGE_SIZE) {
    return { data: buffer, mimeType: 'image/jpeg' };
  }

  // Try progressively lower quality
  for (const quality of [85, 70, 55, 40, 25]) {
    const compressed = await sharp(buffer)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (compressed.byteLength <= BSKY_MAX_IMAGE_SIZE) {
      return { data: compressed, mimeType: 'image/jpeg' };
    }
  }

  // If still too large, resize down
  const resized = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 40, mozjpeg: true })
    .toBuffer();
  return { data: resized, mimeType: 'image/jpeg' };
}

async function uploadImage(
  accessJwt: string,
  imageUrl: string
): Promise<{ $type: string; ref: { $link: string }; mimeType: string; size: number }> {
  // Download the image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

  const rawBuffer = Buffer.from(await imgRes.arrayBuffer());

  // Compress if needed
  const { data: imageBuffer, mimeType } = await compressImage(rawBuffer);

  // Upload as blob to Bluesky
  const uploadRes = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      Authorization: `Bearer ${accessJwt}`,
    },
    body: new Uint8Array(imageBuffer),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(`Bluesky image upload failed ${uploadRes.status}: ${err?.message || uploadRes.statusText}`);
  }

  const data = await uploadRes.json();
  return {
    $type: 'blob',
    ref: data.blob.ref,
    mimeType: data.blob.mimeType,
    size: data.blob.size,
  };
}

/** Parse facets (links, mentions, hashtags) from text for rich text */
function parseFacets(text: string): Array<{
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri?: string; tag?: string }>;
}> {
  const facets: Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; uri?: string; tag?: string }>;
  }> = [];
  const encoder = new TextEncoder();

  // URLs
  const urlRegex = /https?:\/\/[^\s)>\]]+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const start = encoder.encode(text.slice(0, match.index)).byteLength;
    const end = start + encoder.encode(match[0]).byteLength;
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }],
    });
  }

  // Hashtags
  const hashtagRegex = /#(\w+)/g;
  while ((match = hashtagRegex.exec(text)) !== null) {
    const start = encoder.encode(text.slice(0, match.index)).byteLength;
    const end = start + encoder.encode(match[0]).byteLength;
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: match[1] }],
    });
  }

  return facets;
}

export async function publishBlueskyPost(payload: BlueskyPostPayload): Promise<string> {
  const { handle, appPassword, caption, imageUrl, imageUrls } = payload;

  // Bluesky has a 300 grapheme limit
  const truncatedCaption = caption.length > 300 ? caption.slice(0, 297) + '...' : caption;

  // Authenticate
  const session = await createSession(handle, appPassword);

  // Build the post record
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: truncatedCaption,
    createdAt: new Date().toISOString(),
  };

  // Parse rich text facets
  const facets = parseFacets(truncatedCaption);
  if (facets.length) {
    record.facets = facets;
  }

  // Upload images — Bluesky supports up to 4 images per post
  const urlsToUpload: string[] = [];
  if (imageUrls && imageUrls.length > 1) {
    urlsToUpload.push(...imageUrls.slice(0, 4));
  } else if (imageUrl) {
    urlsToUpload.push(imageUrl);
  }

  if (urlsToUpload.length > 0) {
    const blobs = [];
    for (const url of urlsToUpload) {
      try {
        const blob = await uploadImage(session.accessJwt, url);
        blobs.push({ alt: '', image: blob });
      } catch (err) {
        console.error(`Bluesky image upload failed for ${url}:`, (err as Error).message);
      }
    }
    if (blobs.length > 0) {
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: blobs,
      };
    }
  }

  // Create the post
  const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Bluesky post failed ${res.status}: ${err?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.uri; // at://did:plc:.../app.bsky.feed.post/...
}
