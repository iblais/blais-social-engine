const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export interface TTSOptions {
  text: string;
  voiceId: string;
  apiKey: string;
  modelId?: string;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

/**
 * Generate speech from text using ElevenLabs TTS.
 * Returns an audio buffer (MP3).
 */
export async function elevenLabsTTS(options: TTSOptions): Promise<Buffer> {
  const {
    text,
    voiceId,
    apiKey,
    modelId = 'eleven_multilingual_v2',
    voiceSettings = { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
  } = options;

  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings,
    }),
    signal: AbortSignal.timeout(120_000), // 2 min timeout per chunk
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `ElevenLabs error ${res.status}: ${err?.detail?.message || err?.detail || res.statusText}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * List available voices.
 */
export async function listVoices(apiKey: string): Promise<Array<{ voice_id: string; name: string; category: string }>> {
  const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
    headers: { 'xi-api-key': apiKey },
  });

  if (!res.ok) throw new Error(`ElevenLabs voices error ${res.status}`);

  const data = await res.json();
  return (data.voices || []).map((v: { voice_id: string; name: string; category: string }) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
  }));
}
