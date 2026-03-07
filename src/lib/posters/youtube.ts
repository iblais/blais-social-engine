const YT_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';

interface YouTubePostPayload {
  accessToken: string;
  title: string;
  description: string;
  videoUrl: string;         // URL to download video from (Supabase storage)
  privacyStatus?: 'public' | 'unlisted' | 'private';
  tags?: string[];
  categoryId?: string;      // default "22" (People & Blogs)
  isShort?: boolean;
  playlistId?: string;
  madeForKids?: boolean;
}

/**
 * Upload a video to YouTube via resumable upload protocol.
 * Returns the YouTube video ID.
 */
export async function publishYouTubePost(payload: YouTubePostPayload): Promise<string> {
  const {
    accessToken,
    title,
    description,
    videoUrl,
    privacyStatus = 'public',
    tags,
    categoryId = '22',
    isShort = false,
    madeForKids = false,
  } = payload;

  // Step 1: Download the video file from storage
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download video: ${videoRes.status} ${videoRes.statusText}`);
  }

  const videoBuffer = await videoRes.arrayBuffer();
  const contentType = videoRes.headers.get('content-type') || 'video/mp4';
  const fileSize = videoBuffer.byteLength;

  if (fileSize === 0) {
    throw new Error('Video file is empty');
  }

  // For Shorts, prepend #Shorts to title if not already there
  const finalTitle = isShort && !title.includes('#Shorts')
    ? `${title} #Shorts`
    : title;

  // Step 2: Initiate resumable upload session
  const metadata = {
    snippet: {
      title: finalTitle.slice(0, 100),
      description,
      tags: tags || [],
      categoryId,
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: madeForKids,
    },
  };

  const initRes = await fetch(
    `${YT_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(fileSize),
        'X-Upload-Content-Type': contentType,
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(
      `YouTube upload init failed ${initRes.status}: ${(err as Record<string, Record<string, string>>)?.error?.message || JSON.stringify(err)}`
    );
  }

  const sessionUri = initRes.headers.get('location');
  if (!sessionUri) {
    throw new Error('YouTube upload init: no session URI in response');
  }

  // Step 3: Upload the video file to the session URI
  const uploadRes = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(
      `YouTube video upload failed ${uploadRes.status}: ${(err as Record<string, Record<string, string>>)?.error?.message || JSON.stringify(err)}`
    );
  }

  const result = await uploadRes.json();
  const videoId = (result as Record<string, string>).id;

  if (!videoId) {
    throw new Error('YouTube upload succeeded but no video ID returned');
  }

  return videoId;
}
