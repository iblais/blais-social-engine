const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface FacebookPostPayload {
  pageId: string;
  accessToken: string;
  caption: string;
  imageUrl?: string;
  linkUrl?: string;
}

export async function publishFacebookPost(payload: FacebookPostPayload): Promise<string> {
  const { pageId, accessToken, caption, imageUrl, linkUrl } = payload;

  let endpoint: string;
  const body: Record<string, string> = {};

  if (imageUrl) {
    // Photo post
    endpoint = `${GRAPH_BASE}/${pageId}/photos`;
    body.url = imageUrl;
    body.caption = caption;
  } else if (linkUrl) {
    // Link post
    endpoint = `${GRAPH_BASE}/${pageId}/feed`;
    body.message = caption;
    body.link = linkUrl;
  } else {
    // Text-only post
    endpoint = `${GRAPH_BASE}/${pageId}/feed`;
    body.message = caption;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Facebook API error ${res.status}: ${err?.error?.message || res.statusText}`
    );
  }

  const data = await res.json();
  return data.id || data.post_id;
}
