import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { geminiGenerate } from '@/lib/ai/gemini';

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
}

async function log(
  supabase: ReturnType<typeof createAdminClient>,
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

async function updateRun(
  supabase: ReturnType<typeof createAdminClient>,
  runId: string,
  fields: Record<string, unknown>
) {
  await supabase.from('pipeline_runs').update(fields).eq('id', runId);
}

function parseJSON(raw: string): unknown {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.indexOf('[') !== -1 ? cleaned.indexOf('[') : cleaned.indexOf('{');
  const end = cleaned.lastIndexOf(']') !== -1 ? cleaned.lastIndexOf(']') + 1 : cleaned.lastIndexOf('}') + 1;
  if (start === -1 || end <= 0) throw new Error('No JSON found in AI response');
  return JSON.parse(cleaned.slice(start, end));
}

/* ─── STAGE 1: SCOUT ─── */
async function stageScout(supabase: ReturnType<typeof createAdminClient>, runId: string, channel: Channel) {
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

Return ONLY a JSON array: [{"title":"...","hook":"...","trending_reason":"...","score":85,"source":"..."}]`;

  const raw = await geminiGenerate(prompt, GEMINI_KEY);
  const topics = parseJSON(raw) as Array<{ title: string; hook: string; score: number; trending_reason: string; source: string }>;

  // Sort by score, pick the best
  topics.sort((a, b) => b.score - a.score);

  await log(supabase, runId, 'scout', 'success', `Found ${topics.length} topics. Top: "${topics[0]?.title}"`, { topics });

  return topics;
}

/* ─── STAGE 2: RESEARCH ─── */
async function stageResearch(
  supabase: ReturnType<typeof createAdminClient>,
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

Return as JSON: {"arc":{"setup":"...","rising":"...","climax":"...","resolution":"..."},"facts":["..."],"emotional_beats":["..."],"broll_keywords":["..."],"music_progression":["..."],"seo_keywords":["..."],"thumbnail":{"text":"...","visual":"..."}}`;

  const raw = await geminiGenerate(prompt, GEMINI_KEY);
  const research = parseJSON(raw) as Record<string, unknown>;

  await log(supabase, runId, 'research', 'success', 'Research complete', { research });

  return research;
}

/* ─── STAGE 3: SCRIPT ─── */
async function stageScript(
  supabase: ReturnType<typeof createAdminClient>,
  runId: string,
  channel: Channel,
  topic: { title: string; hook: string },
  research: Record<string, unknown>
) {
  await updateRun(supabase, runId, { current_stage: 'script' });
  await log(supabase, runId, 'script', 'info', 'Writing narration script...');

  const prompt = `You are writing a narration script for a faceless YouTube horror/storytelling channel called "${channel.name}".
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

Return as JSON: {"title":"...","description":"YouTube description with SEO keywords","tags":["..."],"script":"full script text with markers","word_count":1500,"estimated_duration":"10:30"}`;

  const raw = await geminiGenerate(prompt, GEMINI_KEY);
  const script = parseJSON(raw) as Record<string, unknown>;

  await log(supabase, runId, 'script', 'success', `Script complete — ${script.word_count || '?'} words, ~${script.estimated_duration || '?'}`, { script });

  return script;
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

    // Mark complete
    await updateRun(supabase, runId, {
      status: 'completed',
      current_stage: 'script',
      topic_title: topTopic.title,
      completed_at: new Date().toISOString(),
      config: { topics, research, script },
    });

    await log(supabase, runId, 'script', 'success', `Pipeline complete! "${topTopic.title}" ready for production.`);

    return NextResponse.json({ success: true, topic: topTopic.title, stages: ['scout', 'research', 'script'] });
  } catch (err) {
    const msg = (err as Error).message;
    await updateRun(supabase, runId, { status: 'failed', error: msg, completed_at: new Date().toISOString() });
    await log(supabase, runId, run.current_stage || 'unknown', 'error', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
