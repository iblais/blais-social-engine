const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface FacebookPostPayload {
  pageId: string;
  accessToken: string;
  caption: string;
  imageUrl?: string;
  imageUrls?: string[];  // multi-image carousel
  linkUrl?: string;
}

async function graphPost(
  url: string,
  body: Record<string, string | boolean>,
  token: string
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Facebook API error ${res.status}: ${(err as Record<string, Record<string, string>>)?.error?.message || res.statusText}`
    );
  }

  return res.json();
}

export async function publishFacebookPost(payload: FacebookPostPayload): Promise<string> {
  const { pageId, accessToken, caption, imageUrl, imageUrls, linkUrl } = payload;

  // Multi-image post (carousel-like on Facebook)
  // Facebook doesn't have native "carousel" like IG — use multi-photo post via unpublished photos
  if (imageUrls && imageUrls.length > 1) {
    // Step 1: Upload each image as unpublished
    const photoIds: string[] = [];
    for (const url of imageUrls) {
      const data = await graphPost(
        `${GRAPH_BASE}/${pageId}/photos`,
        {
          url,
          published: false,  // unpublished photo
        },
        accessToken
      );
      if (data.id) photoIds.push(data.id as string);
    }

    // Step 2: Create a feed post attaching all photos
    const feedBody: Record<string, string> = { message: caption };
    photoIds.forEach((id, i) => {
      feedBody[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
    });

    const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(feedBody),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Facebook multi-photo error ${res.status}: ${(err as Record<string, Record<string, string>>)?.error?.message || res.statusText}`
      );
    }

    const result = await res.json();
    return (result as Record<string, string>).id;
  }

  // Single image post
  if (imageUrl) {
    const data = await graphPost(
      `${GRAPH_BASE}/${pageId}/photos`,
      { url: imageUrl, caption },
      accessToken
    );
    return (data.id || data.post_id) as string;
  }

  // Link post
  if (linkUrl) {
    const data = await graphPost(
      `${GRAPH_BASE}/${pageId}/feed`,
      { message: caption, link: linkUrl },
      accessToken
    );
    return data.id as string;
  }

  // Text-only post
  const data = await graphPost(
    `${GRAPH_BASE}/${pageId}/feed`,
    { message: caption },
    accessToken
  );
  return data.id as string;
}
