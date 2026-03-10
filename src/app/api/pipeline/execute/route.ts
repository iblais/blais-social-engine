import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { geminiGenerate, geminiGenerateImage } from '@/lib/ai/gemini';
import { elevenLabsTTS } from '@/lib/ai/elevenlabs';

export const maxDuration = 300;

const GEMINI_KEY = process.env.GEMINI_API_KEY!;

interface Channel {
  id: string;
  name: string;
  niche: string;
  tone: string;
  target_length: string;
  tags_default: string[];
  posting_frequency: string;
  voice_id: string | null;
  voice_settings: Record<string, unknown> | null;
}

type Supabase = ReturnType<typeof createAdminClient>;

async function log(
  supabase: Supabase,
  runId: string,
  stage: string,
  level: 'info' | 'error' | 'success',
  message: string,
  details?: Record<string, unknown>
) {
  await supabase.from('pipeline_logs').insert({
    run_id: runId,
    stage,
    level,
    message,
    details: details || null,
  });
}

async function updateRun(supabase: Supabase, runId: string, fields: Record<string, unknown>) {
  await supabase.from('pipeline_runs').update(fields).eq('id', runId);
}

/** Get an API key from app_settings table */
async function getApiKey(supabase: Supabase, userId: string, key: string): Promise<string | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .single();
  return data?.value || null;
}

function parseJSON(raw: string): unknown {
  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const arrStart = cleaned.indexOf('[');
  const objStart = cleaned.indexOf('{');
  const start = arrStart !== -1 && (objStart === -1 || arrStart < objStart) ? arrStart : objStart;
  const isArray = start === arrStart && arrStart !== -1;
  const end = isArray
    ? cleaned.lastIndexOf(']') + 1
    : cleaned.lastIndexOf('}') + 1;
  if (start === -1 || end <= 0) throw new Error('No JSON found in AI response');
  let jsonStr = cleaned.slice(start, end);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Last resort: try to fix unescaped quotes in string values
    jsonStr = jsonStr.replace(/"([^"]*?)"/g, (full, inner) => {
      if (inner.includes(':') || inner.includes(',')) return full;
      return `"${inner.replace(/"/g, '\\"')}"`;
    });
    return JSON.parse(jsonStr);
  }
}

/* ─── STAGE 1: SCOUT ─── */
async function stageScout(supabase: Supabase, runId: string, channel: Channel) {
  await updateRun(supabase, runId, { current_stage: 'scout' });
  await log(supabase, runId, 'scout', 'info', `Scouting trending topics for "${channel.name}"...`);

  const prompt = `You are a YouTube content strategist for a faceless channel called "${channel.name}".
Niche: ${channel.niche}
Tone: ${channel.tone}
Target video length: ${channel.target_length}
Tags: ${channel.tags_default.join(', ')}

Generate 5 trending video topic ideas that would perform well right now. For each topic:
- Title (under 60 chars, click-worthy)
- Hook (first 15 seconds of narration)
- Why it's trending (brief)
- Estimated appeal score (0-100)
- Source inspiration (Reddit, news, viral trend, etc.)

Return ONLY valid JSON (no trailing commas, no markdown): [{"title":"...","hook":"...","trending_reason":"...","score":85,"source":"..."}]`;

  const raw = await geminiGenerate(prompt, GEMINI_KEY);
  const topics = parseJSON(raw) as Array<{ title: string; hook: string; score: number; trending_reason: string; source: string }>;

  topics.sort((a, b) => b.score - a.score);

  await log(supabase, runId, 'scout', 'success', `Found ${topics.length} topics. Top: "${topics[0]?.title}"`, { topics });

  return topics;
}

/* ─── STAGE 2: RESEARCH ─── */
async function stageResearch(
  supabase: Supabase,
  runId: string,
  channel: Channel,
  topic: { title: string; hook: string }
) {
  await updateRun(supabase, runId, { current_stage: 'research', topic_title: topic.title });
  await log(supabase, runId, 'research', 'info', `Researching: "${topic.title}"...`);

  const prompt = `You are researching a YouTube video for the faceless channel "${channel.name}".
Niche: ${channel.niche}
Tone: ${channel.tone}
Video length: ${channel.target_length}

Topic: "${topic.title}"
Hook: "${topic.hook}"

Create a detailed research brief:
1. Story/narrative arc (beginning, middle, climax, resolution)
2. Key facts, dates, names, locations
3. Emotional beats (where to build tension, where to release)
4. B-roll suggestions (stock footage keywords for each section)
5. Music mood progression (ambient → tense → climax → reflective)
6. SEO keywords (10-15 terms)
7. Thumbnail concept (text overlay + visual description)

Return ONLY valid JSON (no trailing commas, no markdown): {"arc":{"setup":"...","rising":"...","climax":"...","resolution":"..."},"facts":["..."],"emotional_beats":["..."],"broll_keywords":["..."],"music_progression":["..."],"seo_keywords":["..."],"thumbnail":{"text":"...","visual":"..."}}`;

  const raw = await geminiGenerate(prompt, GEMINI_KEY);
  const research = parseJSON(raw) as Record<string, unknown>;

  await log(supabase, runId, 'research', 'success', 'Research complete', { research });

  return research;
}

/* ─── STAGE 3: SCRIPT ─── */
async function stageScript(
  supabase: Supabase,
  runId: string,
  channel: Channel,
  topic: { title: string; hook: string },
  research: Record<string, unknown>
) {
  await updateRun(supabase, runId, { current_stage: 'script' });
  await log(supabase, runId, 'script', 'info', 'Writing narration script...');

  const prompt = `You are writing a narration script for a faceless YouTube channel called "${channel.name}".
Niche: ${channel.niche}
Tone: ${channel.tone}
Target length: ${channel.target_length} (aim for ${channel.target_length.includes('8') ? '1500-2500' : '800-1500'} words)

Topic: "${topic.title}"
Hook: "${topic.hook}"

Research:
${JSON.stringify(research, null, 2)}

Write the FULL narration script. Use these markers:
[HOOK] — Opening 15 seconds, grab attention immediately
[INTRO] — Set the scene, introduce the story
[MAIN] — The core story with building tension
[CLIMAX] — Peak moment
[RESOLUTION] — Wrap up, leave them thinking
[CTA] — Subscribe call-to-action (brief, natural)

Also include:
[PAUSE] — dramatic pause moments
[SFX: description] — sound effect cues
[MUSIC: mood] — music shift cues
[BROLL: description] — visual cue for editor

The script should be conversational, immersive, and keep the viewer hooked. No filler.

Return ONLY valid JSON (no trailing commas, no markdown): {"title":"...","description":"YouTube description with SEO keywords","tags":["..."],"script":"full script text with markers","word_count":1500,"estimated_duration":"10:30"}`;

  const raw = await geminiGenerate(prompt, GEMINI_KEY);
  const script = parseJSON(raw) as Record<string, unknown>;

  await log(supabase, runId, 'script', 'success', `Script complete — ${script.word_count || '?'} words, ~${script.estimated_duration || '?'}`, { script });

  return script;
}

/* ─── STAGE 4: VOICE (ElevenLabs TTS) ─── */
async function stageVoice(
  supabase: Supabase,
  runId: string,
  channel: Channel,
  script: Record<string, unknown>,
  userId: string
) {
  await updateRun(supabase, runId, { current_stage: 'avatar' });
  await log(supabase, runId, 'avatar', 'info', 'Generating voice narration...');

  // Get ElevenLabs API key from user settings
  const elevenLabsKey = await getApiKey(supabase, userId, 'elevenlabs_api_key');
  if (!elevenLabsKey) {
    await log(supabase, runId, 'avatar', 'info', 'No ElevenLabs API key — skipping voice generation');
    return null;
  }

  const voiceId = channel.voice_id || 'pNInz6obpgDQGcFmaJgB'; // Default: Adam
  const voiceSettings = channel.voice_settings as {
    stability?: number;
    similarity_boost?: number;
    style?: number;
  } | null;

  // Strip markers from script for clean narration
  const rawScript = String(script.script || '');
  const cleanText = rawScript
    .replace(/\[(HOOK|INTRO|MAIN|CLIMAX|RESOLUTION|CTA|PAUSE)\]/g, '')
    .replace(/\[SFX:[^\]]*\]/g, '')
    .replace(/\[MUSIC:[^\]]*\]/g, '')
    .replace(/\[BROLL:[^\]]*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleanText || cleanText.length < 50) {
    await log(supabase, runId, 'avatar', 'error', 'Script text too short for voice generation');
    return null;
  }

  await log(supabase, runId, 'avatar', 'info', `Generating ${cleanText.length} chars with voice "${voiceId}"...`);

  // ElevenLabs has a 5000 char limit per request — split if needed
  const chunks: string[] = [];
  const MAX_CHARS = 4500;
  if (cleanText.length <= MAX_CHARS) {
    chunks.push(cleanText);
  } else {
    // Split on paragraph breaks
    const paragraphs = cleanText.split(/\n\n+/);
    let current = '';
    for (const p of paragraphs) {
      if ((current + '\n\n' + p).length > MAX_CHARS && current.length > 0) {
        chunks.push(current.trim());
        current = p;
      } else {
        current = current ? current + '\n\n' + p : p;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  await log(supabase, runId, 'avatar', 'info', `Generating ${chunks.length} audio chunk(s)...`);

  const audioBuffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const buffer = await elevenLabsTTS({
      text: chunks[i],
      voiceId,
      apiKey: elevenLabsKey,
      voiceSettings: voiceSettings ? {
        stability: voiceSettings.stability ?? 0.4,
        similarity_boost: voiceSettings.similarity_boost ?? 0.8,
        style: voiceSettings.style ?? 0.3,
      } : {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.3,
      },
    });
    audioBuffers.push(buffer);
    await log(supabase, runId, 'avatar', 'info', `Chunk ${i + 1}/${chunks.length} done (${buffer.length} bytes)`);
  }

  // Concatenate audio buffers (simple MP3 concat works for MP3 files)
  const fullAudio = Buffer.concat(audioBuffers);

  // Upload to Supabase Storage
  const audioPath = `pipeline/${runId}/narration.mp3`;
  const { error: uploadErr } = await supabase.storage
    .from('media')
    .upload(audioPath, fullAudio, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (uploadErr) {
    await log(supabase, runId, 'avatar', 'error', `Upload failed: ${uploadErr.message}`);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(audioPath);

  await updateRun(supabase, runId, { voice_url: publicUrl });
  await log(supabase, runId, 'avatar', 'success', `Voice narration complete — ${(fullAudio.length / 1024).toFixed(0)}KB`, { url: publicUrl, chunks: chunks.length });

  return publicUrl;
}

/* ─── STAGE 5: THUMBNAIL (Nano Banana 2) ─── */
async function stageThumbnail(
  supabase: Supabase,
  runId: string,
  channel: Channel,
  topic: { title: string },
  research: Record<string, unknown>
) {
  await updateRun(supabase, runId, { current_stage: 'editor' });
  await log(supabase, runId, 'editor', 'info', 'Generating thumbnail...');

  const thumbnail = research.thumbnail as { text?: string; visual?: string } | undefined;
  const thumbText = thumbnail?.text || topic.title;
  const thumbVisual = thumbnail?.visual || 'dark, dramatic, cinematic';

  const prompt = `Create a YouTube thumbnail for a ${channel.niche} video.
Title text on the thumbnail: "${thumbText}"
Visual style: ${thumbVisual}
Channel tone: ${channel.tone}
Make it eye-catching, high contrast, dramatic lighting. The text should be bold and readable.
Style: cinematic, dark atmosphere, 16:9 aspect ratio, YouTube thumbnail quality.`;

  try {
    const images = await geminiGenerateImage({
      prompt,
      apiKey: GEMINI_KEY,
      model: 'nano-banana-2',
      count: 1,
    });

    if (!images[0]) {
      await log(supabase, runId, 'editor', 'error', 'No thumbnail generated');
      return null;
    }

    // Convert base64 to buffer and upload
    const base64Data = images[0].split(',')[1];
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const thumbPath = `pipeline/${runId}/thumbnail.png`;

    const { error: uploadErr } = await supabase.storage
      .from('media')
      .upload(thumbPath, imgBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadErr) {
      await log(supabase, runId, 'editor', 'error', `Thumbnail upload failed: ${uploadErr.message}`);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(thumbPath);

    await updateRun(supabase, runId, { thumbnail_url: publicUrl });
    await log(supabase, runId, 'editor', 'success', `Thumbnail generated (${(imgBuffer.length / 1024).toFixed(0)}KB)`, { url: publicUrl });

    return publicUrl;
  } catch (err) {
    await log(supabase, runId, 'editor', 'error', `Thumbnail generation failed: ${(err as Error).message}`);
    return null;
  }
}

/* ─── STAGE 6: PUBLISH (Save to DB) ─── */
async function stagePublish(
  supabase: Supabase,
  runId: string,
  channel: Channel,
  data: {
    topics: Array<{ title: string; hook: string; score: number; trending_reason: string; source: string }>;
    research: Record<string, unknown>;
    script: Record<string, unknown>;
    voiceUrl: string | null;
    thumbnailUrl: string | null;
  }
) {
  await updateRun(supabase, runId, { current_stage: 'publisher' });
  await log(supabase, runId, 'publisher', 'info', 'Saving pipeline output...');

  const topTopic = data.topics[0];

  // Save all topics to scouted_topics
  for (const topic of data.topics) {
    await supabase.from('scouted_topics').upsert({
      channel_id: channel.id,
      run_id: runId,
      title: topic.title,
      source: topic.source,
      summary: topic.hook,
      total_score: topic.score,
      virality_score: Math.min(100, topic.score + Math.floor(Math.random() * 10) - 5),
      relevance_score: Math.min(100, topic.score + Math.floor(Math.random() * 10) - 5),
      novelty_score: Math.min(100, topic.score + Math.floor(Math.random() * 10) - 5),
      reasoning: topic.trending_reason,
      status: topic === topTopic ? 'approved' : 'pending',
      metadata: {},
    }, { onConflict: 'run_id,title' });
  }

  await log(supabase, runId, 'publisher', 'info', `Saved ${data.topics.length} topics to feed`);

  // Build output summary
  const output: Record<string, unknown> = {
    topics: data.topics,
    research: data.research,
    script: data.script,
    voice_url: data.voiceUrl,
    thumbnail_url: data.thumbnailUrl,
    generated_at: new Date().toISOString(),
  };

  const completedStages = ['scout', 'research', 'script'];
  if (data.voiceUrl) completedStages.push('avatar');
  completedStages.push('editor', 'publisher');

  await updateRun(supabase, runId, {
    status: 'completed',
    current_stage: 'publisher',
    topic_title: topTopic.title,
    completed_at: new Date().toISOString(),
    config: output,
  });

  await log(supabase, runId, 'publisher', 'success',
    `Pipeline complete! "${topTopic.title}" — ${completedStages.length} stages done.` +
    (data.voiceUrl ? ' Voice narration ready.' : '') +
    (data.thumbnailUrl ? ' Thumbnail generated.' : '')
  );

  return output;
}

/* ─── MAIN HANDLER ─── */
export async function POST(req: NextRequest) {
  const { runId } = await req.json();
  if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  const supabase = createAdminClient();

  // Fetch run + channel
  const { data: run, error: runErr } = await supabase
    .from('pipeline_runs')
    .select('*, pipeline_channels(*)')
    .eq('id', runId)
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  if (run.status !== 'pending') {
    return NextResponse.json({ error: `Run is ${run.status}, not pending` }, { status: 400 });
  }

  const channel = run.pipeline_channels as Channel;

  // Get the user_id from the channel for API key lookup
  const { data: channelData } = await supabase
    .from('pipeline_channels')
    .select('user_id')
    .eq('id', channel.id)
    .single();
  const userId = channelData?.user_id || run.user_id;

  // Mark as running
  await updateRun(supabase, runId, { status: 'running', started_at: new Date().toISOString() });

  try {
    // Stage 1: Scout
    const topics = await stageScout(supabase, runId, channel);
    const topTopic = topics[0];
    if (!topTopic) throw new Error('No topics generated');

    // Stage 2: Research
    const research = await stageResearch(supabase, runId, channel, topTopic);

    // Stage 3: Script
    const script = await stageScript(supabase, runId, channel, topTopic, research);

    // Stage 4: Voice (ElevenLabs)
    const voiceUrl = await stageVoice(supabase, runId, channel, script, userId);

    // Stage 5: Thumbnail
    const thumbnailUrl = await stageThumbnail(supabase, runId, channel, topTopic, research);

    // Stage 6: Publish (save everything)
    await stagePublish(supabase, runId, channel, {
      topics,
      research,
      script,
      voiceUrl,
      thumbnailUrl,
    });

    return NextResponse.json({
      success: true,
      topic: topTopic.title,
      stages: ['scout', 'research', 'script', 'avatar', 'editor', 'publisher'],
      voiceUrl,
      thumbnailUrl,
    });
  } catch (err) {
    const msg = (err as Error).message;
    await updateRun(supabase, runId, { status: 'failed', error: msg, completed_at: new Date().toISOString() });
    await log(supabase, runId, run.current_stage || 'unknown', 'error', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
