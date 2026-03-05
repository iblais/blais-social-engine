const BSKY_API = 'https://bsky.social/xrpc';

interface BlueskyPostPayload {
  handle: string;       // e.g. 'user.bsky.social'
  appPassword: string;  // app password stored as access_token
  caption: string;
  imageUrl?: string;
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

async function uploadImage(
  accessJwt: string,
  imageUrl: string
): Promise<{ $type: string; ref: { $link: string }; mimeType: string; size: number }> {
  // Download the image first
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  const imageBuffer = await imgRes.arrayBuffer();

  // Upload as blob to Bluesky
  const uploadRes = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Authorization: `Bearer ${accessJwt}`,
    },
    body: imageBuffer,
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
  const { handle, appPassword, caption, imageUrl } = payload;

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

  // Upload image if provided
  if (imageUrl) {
    const blob = await uploadImage(session.accessJwt, imageUrl);
    record.embed = {
      $type: 'app.bsky.embed.images',
      images: [{ alt: '', image: blob }],
    };
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
