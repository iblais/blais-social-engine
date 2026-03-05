const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function geminiGenerate(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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

/**
 * Gemini vision — analyze images and generate text.
 * Uses gemini-2.0-flash which has vision built in.
 * Accepts base64 data URLs or fetches from URLs.
 */
export async function geminiVision(
  prompt: string,
  imageDataUrls: string[],
  apiKey: string
): Promise<string> {
  const parts: Array<Record<string, unknown>> = [];

  // Add images
  for (const dataUrl of imageDataUrls) {
    if (dataUrl.startsWith('data:')) {
      // Base64 data URL
      const [header, base64] = dataUrl.split(',');
      const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      parts.push({ inlineData: { mimeType, data: base64 } });
    } else {
      // URL — download and convert to base64
      try {
        const imgRes = await fetch(dataUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
          parts.push({ inlineData: { mimeType, data: base64 } });
        }
      } catch {
        // Skip failed image downloads
      }
    }
  }

  // Add text prompt
  parts.push({ text: prompt });

  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
    throw new Error(`Gemini Vision API error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Nano Banana 2 (Gemini 3.1 Flash Image) — Google's image generation model
export async function geminiGenerateImage(prompt: string, apiKey: string, referenceImages?: string[]): Promise<string> {
  const parts: Array<Record<string, unknown>> = [];

  // Add reference images if provided (for image-to-image)
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
    `${GEMINI_BASE}/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
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
    throw new Error(`Image generation API error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const resultParts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = resultParts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData);
  if (!imagePart) throw new Error('No image generated');

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
}
