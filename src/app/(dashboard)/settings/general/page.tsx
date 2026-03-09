'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Key, CheckCircle2, Circle } from 'lucide-react';

interface ApiKeyConfig {
  dbKey: string;
  label: string;
  description: string;
  placeholder: string;
}

const API_KEYS: ApiKeyConfig[] = [
  {
    dbKey: 'gemini_api_key',
    label: 'Google Gemini',
    description: 'AI captions, image/video generation, content ideas, pipeline scripts, topic scoring.',
    placeholder: 'AIza...',
  },
  {
    dbKey: 'elevenlabs_api_key',
    label: 'ElevenLabs',
    description: 'AI voice narration for pipeline videos. Get your key from elevenlabs.io/app/settings.',
    placeholder: 'sk_...',
  },
  {
    dbKey: 'heygen_api_key',
    label: 'HeyGen',
    description: 'AI avatar video narration (talking head). Only needed if you want visible avatars, not faceless.',
    placeholder: '',
  },
  {
    dbKey: 'assemblyai_api_key',
    label: 'AssemblyAI',
    description: 'Speech-to-text for auto-generated captions/subtitles on pipeline videos.',
    placeholder: '',
  },
  {
    dbKey: 'openai_api_key',
    label: 'OpenAI',
    description: 'GPT models for fallback AI generation, embeddings, or advanced reasoning.',
    placeholder: 'sk-...',
  },
  {
    dbKey: 'anthropic_api_key',
    label: 'Anthropic (Claude)',
    description: 'Claude models for fallback AI generation or advanced script writing.',
    placeholder: 'sk-ant-...',
  },
  {
    dbKey: 'reddit_client_id',
    label: 'Reddit Client ID',
    description: 'Reddit API for pipeline topic scouting from subreddits. Create app at reddit.com/prefs/apps.',
    placeholder: '',
  },
  {
    dbKey: 'reddit_client_secret',
    label: 'Reddit Client Secret',
    description: 'Reddit API secret — paired with the Client ID above.',
    placeholder: '',
  },
  {
    dbKey: 'twitter_bearer_token',
    label: 'X / Twitter Bearer Token',
    description: 'Twitter API v2 for pipeline topic scouting from accounts and hashtags.',
    placeholder: 'AAAA...',
  },
  {
    dbKey: 'replicate_api_key',
    label: 'Replicate',
    description: 'Run open-source AI models (image gen, video gen, audio). replicate.com/account/api-tokens.',
    placeholder: 'r8_...',
  },
  {
    dbKey: 'stability_api_key',
    label: 'Stability AI',
    description: 'Stable Diffusion image generation for thumbnails and visual content.',
    placeholder: 'sk-...',
  },
];

// Each card manages its own input state to avoid re-rendering all cards on every keystroke
const ApiKeyCard = memo(function ApiKeyCard({ config, initialValue }: { config: ApiKeyConfig; initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const hasKey = value.length > 0;
  const supabase = createClient();

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  async function save() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); setSaving(false); return; }

    const { data: existing } = await supabase.from('app_settings').select('id').eq('key', config.dbKey).single();

    const { error } = existing
      ? await supabase.from('app_settings').update({ value }).eq('key', config.dbKey)
      : await supabase.from('app_settings').insert({ user_id: user.id, key: config.dbKey, value });

    if (error) toast.error(error.message);
    else toast.success(`${config.label} key saved`);
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {hasKey ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <Circle className="h-4 w-4 text-zinc-400" />
          )}
          <Key className="h-4 w-4" />
          {config.label}
        </CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={config.placeholder}
            className="flex-1"
          />
          <Button onClick={save} disabled={saving} size="sm">
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

export default function GeneralSettingsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', API_KEYS.map(k => k.dbKey));
    if (data) {
      const map: Record<string, string> = {};
      for (const row of data) map[row.key] = row.value;
      setKeys(map);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-muted-foreground">Configure API keys for AI features and the content pipeline.</p>
      </div>

      {API_KEYS.map(config => (
        <ApiKeyCard key={config.dbKey} config={config} initialValue={keys[config.dbKey] || ''} />
      ))}
    </div>
  );
}
