const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ═══════════════════════════════════════════════════════════════
// Text generation — Gemini 2.5 Flash (stable, fast)
// ═══════════════════════════════════════════════════════════════
export async function geminiGenerate(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini API error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ═══════════════════════════════════════════════════════════════
// Vision — Gemini 2.5 Flash with image input
// ═══════════════════════════════════════════════════════════════
export async function geminiVision(
  prompt: string,
  imageDataUrls: string[],
  apiKey: string
): Promise<string> {
  const parts: Array<Record<string, unknown>> = [];

  for (const dataUrl of imageDataUrls) {
    if (dataUrl.startsWith('data:')) {
      const [header, base64] = dataUrl.split(',');
      const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      parts.push({ inlineData: { mimeType, data: base64 } });
    } else {
      try {
        const imgRes = await fetch(dataUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
          parts.push({ inlineData: { mimeType, data: base64 } });
        }
      } catch {
        // Skip failed downloads
      }
    }
  }

  parts.push({ text: prompt });

  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini Vision error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ═══════════════════════════════════════════════════════════════
// Image Generation — Nano Banana 2 / Nano Banana Pro
// ═══════════════════════════════════════════════════════════════
export type ImageModel = 'nano-banana-2' | 'nano-banana-pro';

const IMAGE_MODEL_IDS: Record<ImageModel, string> = {
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
};

export interface ImageGenOptions {
  prompt: string;
  apiKey: string;
  model?: ImageModel;
  referenceImages?: string[]; // base64 data URLs
  aspectRatio?: string;       // e.g. '1:1', '4:5', '16:9'
  count?: number;             // 1-4
}

export async function geminiGenerateImage(options: ImageGenOptions): Promise<string[]> {
  const {
    prompt,
    apiKey,
    model = 'nano-banana-2',
    referenceImages,
    count = 1,
  } = options;

  const modelId = IMAGE_MODEL_IDS[model];
  const results: string[] = [];

  for (let i = 0; i < count; i++) {
    const parts: Array<Record<string, unknown>> = [];

    // Add reference images if provided
    if (referenceImages?.length) {
      for (const dataUrl of referenceImages) {
        if (dataUrl.startsWith('data:')) {
          const [header, base64] = dataUrl.split(',');
          const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
          parts.push({ inlineData: { mimeType, data: base64 } });
        }
      }
    }

    parts.push({ text: prompt });

    const res = await fetch(
      `${GEMINI_BASE}/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${model} error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const resultParts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = resultParts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData);
    if (!imagePart) throw new Error('No image generated');

    results.push(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Video Generation — Veo 3.1
// ═══════════════════════════════════════════════════════════════
export interface VideoGenOptions {
  prompt: string;
  apiKey: string;
  aspectRatio?: '16:9' | '9:16';
  duration?: '4' | '6' | '8';
  resolution?: '720p';
  startFrame?: string; // base64 data URL
  endFrame?: string;   // base64 data URL
}

interface VeoInstance {
  prompt: string;
  image?: { bytesBase64Encoded: string; mimeType: string };
  lastFrame?: { bytesBase64Encoded: string; mimeType: string };
}

function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  if (!dataUrl.startsWith('data:')) return null;
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  return { base64, mimeType };
}

/**
 * Start a Veo 3.1 video generation. Returns an operation name for polling.
 */
export async function veoGenerateVideo(options: VideoGenOptions): Promise<string> {
  const {
    prompt,
    apiKey,
    aspectRatio = '16:9',
    duration = '8',
    resolution = '720p',
    startFrame,
    endFrame,
  } = options;

  const instance: VeoInstance = { prompt };

  if (startFrame) {
    const parsed = parseDataUrl(startFrame);
    if (parsed) {
      instance.image = { bytesBase64Encoded: parsed.base64, mimeType: parsed.mimeType };
    }
  }

  if (endFrame) {
    const parsed = parseDataUrl(endFrame);
    if (parsed) {
      instance.lastFrame = { bytesBase64Encoded: parsed.base64, mimeType: parsed.mimeType };
    }
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/veo-3.1-generate-preview:predictLongRunning?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio,
          resolution,
          durationSeconds: duration,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Veo 3.1 error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.name; // operation name for polling
}

/**
 * Poll a Veo 3.1 operation until done. Returns the video URI.
 */
export async function veoPollOperation(operationName: string, apiKey: string): Promise<string> {
  const maxAttempts = 60; // 10 min max (10s * 60)

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000)); // wait 10s

    const res = await fetch(
      `${GEMINI_BASE}/${operationName}?key=${apiKey}`,
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Veo poll error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();

    if (data.done) {
      if (data.error) {
        throw new Error(`Veo generation failed: ${data.error.message}`);
      }
      const samples = data.response?.generateVideoResponse?.generatedSamples
        || data.response?.generatedSamples;
      if (samples?.[0]?.video?.uri) {
        return samples[0].video.uri;
      }
      throw new Error('No video generated');
    }
  }

  throw new Error('Video generation timed out after 10 minutes');
}
