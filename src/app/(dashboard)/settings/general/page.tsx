'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Key } from 'lucide-react';

export default function GeneralSettingsPage() {
  const [geminiKey, setGeminiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'gemini_api_key').single();
    if (data?.value) setGeminiKey(data.value);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function saveKey() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); setLoading(false); return; }

    const { data: existing } = await supabase.from('app_settings').select('id').eq('key', 'gemini_api_key').single();

    const { error } = existing
      ? await supabase.from('app_settings').update({ value: geminiKey }).eq('key', 'gemini_api_key')
      : await supabase.from('app_settings').insert({ user_id: user.id, key: 'gemini_api_key', value: geminiKey });

    if (error) toast.error(error.message);
    else toast.success('API key saved!');
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">General Settings</h1>
        <p className="text-muted-foreground">Configure API keys and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-4 w-4" />Google Gemini API Key</CardTitle>
          <CardDescription>Required for AI captions, image generation, and content ideas. Get your key from Google AI Studio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
              placeholder="AIza..." />
          </div>
          <Button onClick={saveKey} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />{loading ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
