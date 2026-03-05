const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function geminiGenerate(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
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

// Nano Banana 2 (Gemini 3.1 Flash Image) — Google's fastest image generation model
export async function geminiGenerateImage(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Nano Banana 2 API error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData);
  if (!imagePart) throw new Error('No image generated');

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
}
