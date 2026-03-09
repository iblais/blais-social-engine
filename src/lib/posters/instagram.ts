interface PostPayload {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
  mediaType: 'image' | 'video' | 'carousel';
  postType?: 'post' | 'reel' | 'story';
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

/**
 * Wait for a media container to finish processing.
 * Images: ~5s, Videos/Reels: up to 2-3 minutes.
 */
async function waitForContainer(
  containerId: string,
  token: string,
  maxAttempts = 30,
  intervalMs = 1000
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

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Container ${containerId} timed out after ${maxAttempts * intervalMs / 1000}s`);
}

export async function publishInstagramPost(payload: PostPayload): Promise<string> {
  const { igUserId, accessToken, caption, imageUrl, mediaType, postType, carouselUrls } = payload;
  const base = getGraphBase(accessToken);
  const isVideo = mediaType === 'video';

  // Determine wait params: videos need longer polling (60 attempts × 3s = 3 min)
  const waitAttempts = isVideo ? 60 : 30;
  const waitInterval = isVideo ? 3000 : 1000;

  let containerId: string;

  if (mediaType === 'carousel' && carouselUrls?.length) {
    // Create individual item containers
    const itemIds: string[] = [];
    for (const url of carouselUrls) {
      const isVid = url.match(/\.(mp4|mov|avi)$/i);
      const item: ContainerResponse = await graphPost(
        `${base}/${igUserId}/media`,
        {
          ...(isVid
            ? { media_type: 'VIDEO', video_url: url }
            : { image_url: url }),
          is_carousel_item: 'true',
        },
        accessToken
      );
      await waitForContainer(item.id, accessToken, isVid ? 60 : 30, isVid ? 3000 : 1000);
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
  } else if (isVideo && postType === 'story') {
    // Story video: use STORIES media type
    const container: ContainerResponse = await graphPost(
      `${base}/${igUserId}/media`,
      {
        media_type: 'STORIES',
        video_url: imageUrl,
      },
      accessToken
    );
    containerId = container.id;
  } else if (!isVideo && postType === 'story') {
    // Story image
    const container: ContainerResponse = await graphPost(
      `${base}/${igUserId}/media`,
      {
        media_type: 'STORIES',
        image_url: imageUrl,
      },
      accessToken
    );
    containerId = container.id;
  } else if (isVideo) {
    // Video → Reel (default for video on Instagram)
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
    // Single image post
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
  await waitForContainer(containerId, accessToken, waitAttempts, waitInterval);

  // Publish
  const result = await graphPost(
    `${base}/${igUserId}/media_publish`,
    { creation_id: containerId },
    accessToken
  );

  return result.id;
}
