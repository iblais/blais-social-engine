'use client';

import { useState, useCallback } from 'react';

interface YouTubeUploadParams {
  file: File;
  accountId: string;
  title: string;
  description: string;
  isShort?: boolean;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  tags?: string[];
  categoryId?: string;
  madeForKids?: boolean;
}

interface UseYouTubeUploadReturn {
  uploadToYouTube: (params: YouTubeUploadParams) => Promise<string>;
  progress: number;
  uploading: boolean;
  error: string | null;
}

/**
 * React hook for uploading videos directly from the browser to YouTube
 * using the resumable upload protocol. Bypasses Supabase storage and Vercel.
 */
export function useYouTubeUpload(): UseYouTubeUploadReturn {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadToYouTube = useCallback(async (params: YouTubeUploadParams): Promise<string> => {
    const {
      file,
      accountId,
      title,
      description,
      isShort = false,
      privacyStatus = 'public',
      tags = [],
      categoryId = '22',
      madeForKids = false,
    } = params;

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // Step 1: Get a fresh access token from our API
      const tokenRes = await fetch('/api/youtube/upload-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'Failed to get YouTube token');
      }

      const { accessToken } = await tokenRes.json();

      // Step 2: Initiate resumable upload session
      const finalTitle = isShort && !title.includes('#Shorts')
        ? `${title} #Shorts`
        : title;

      const metadata = {
        snippet: {
          title: finalTitle.slice(0, 100),
          description,
          tags,
          categoryId,
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: madeForKids,
        },
      };

      const initRes = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(file.size),
            'X-Upload-Content-Type': file.type || 'video/mp4',
          },
          body: JSON.stringify(metadata),
        }
      );

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        throw new Error(
          `YouTube upload init failed (${initRes.status}): ${(err as Record<string, Record<string, string>>)?.error?.message || JSON.stringify(err)}`
        );
      }

      const sessionUri = initRes.headers.get('location');
      if (!sessionUri) {
        throw new Error('YouTube did not return an upload session URI');
      }

      // Step 3: Upload the file using XMLHttpRequest for progress tracking
      const videoId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              if (result.id) {
                resolve(result.id);
              } else {
                reject(new Error('YouTube upload succeeded but no video ID returned'));
              }
            } catch {
              reject(new Error('Failed to parse YouTube upload response'));
            }
          } else {
            let msg = `YouTube upload failed (${xhr.status})`;
            try {
              const err = JSON.parse(xhr.responseText);
              msg = err?.error?.message || msg;
            } catch { /* use default message */ }
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during YouTube upload'));
        xhr.ontimeout = () => reject(new Error('YouTube upload timed out'));

        xhr.open('PUT', sessionUri);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.send(file);
      });

      setProgress(100);
      return videoId;
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploadToYouTube, progress, uploading, error };
}
