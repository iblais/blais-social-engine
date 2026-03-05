interface PostPayload {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
  mediaType: 'image' | 'video' | 'carousel';
  carouselUrls?: string[];
}

interface ContainerResponse {
  id: string;
}

const GRAPH_API_VERSION = 'v22.0';

/** Instagram Login tokens (IGA...) use graph.instagram.com; Facebook tokens (EAA...) use graph.facebook.com */
function getGraphBase(token: string): string {
  return token.startsWith('IGA')
    ? `https://graph.instagram.com/${GRAPH_API_VERSION}`
    : `https://graph.facebook.com/${GRAPH_API_VERSION}`;
}

async function graphPost(url: string, body: Record<string, string>, token: string) {
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
      `Instagram API error ${res.status}: ${err?.error?.message || res.statusText}`
    );
  }

  return res.json();
}

async function waitForContainer(
  containerId: string,
  token: string,
  maxAttempts = 30
): Promise<void> {
  const base = getGraphBase(token);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${base}/${containerId}?fields=status_code`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();

    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') {
      throw new Error(`Container ${containerId} failed: ${JSON.stringify(data)}`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Container ${containerId} timed out`);
}

export async function publishInstagramPost(payload: PostPayload): Promise<string> {
  const { igUserId, accessToken, caption, imageUrl, mediaType, carouselUrls } = payload;
  const base = getGraphBase(accessToken);

  let containerId: string;

  if (mediaType === 'carousel' && carouselUrls?.length) {
    // Create individual item containers
    const itemIds: string[] = [];
    for (const url of carouselUrls) {
      const isVideo = url.match(/\.(mp4|mov|avi)$/i);
      const item: ContainerResponse = await graphPost(
        `${base}/${igUserId}/media`,
        {
          ...(isVideo
            ? { media_type: 'VIDEO', video_url: url }
            : { image_url: url }),
          is_carousel_item: 'true',
        },
        accessToken
      );
      await waitForContainer(item.id, accessToken);
      itemIds.push(item.id);
    }

    // Create carousel container
    const carousel: ContainerResponse = await graphPost(
      `${base}/${igUserId}/media`,
      {
        media_type: 'CAROUSEL',
        caption,
        children: itemIds.join(','),
      },
      accessToken
    );
    containerId = carousel.id;
  } else if (mediaType === 'video') {
    const container: ContainerResponse = await graphPost(
      `${base}/${igUserId}/media`,
      {
        media_type: 'REELS',
        video_url: imageUrl,
        caption,
      },
      accessToken
    );
    containerId = container.id;
  } else {
    // Single image
    const container: ContainerResponse = await graphPost(
      `${base}/${igUserId}/media`,
      {
        image_url: imageUrl,
        caption,
      },
      accessToken
    );
    containerId = container.id;
  }

  // Wait for container to be ready
  await waitForContainer(containerId, accessToken);

  // Publish
  const result = await graphPost(
    `${base}/${igUserId}/media_publish`,
    { creation_id: containerId },
    accessToken
  );

  return result.id;
}
