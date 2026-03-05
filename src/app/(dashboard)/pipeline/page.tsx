'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, ArrowRight, Sparkles, Trash2 } from 'lucide-react';

interface PipelineItem {
  id: string;
  title: string;
  description: string;
  stage: string;
  score: number | null;
  created_at: string;
}

const STAGES = ['idea', 'scored', 'approved', 'scheduled'] as const;
const stageColors: Record<string, string> = {
  idea: 'bg-gray-500/20 text-gray-400',
  scored: 'bg-blue-500/20 text-blue-400',
  approved: 'bg-green-500/20 text-green-400',
  scheduled: 'bg-primary/20 text-primary',
};

export default function PipelinePage() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('content_pipeline')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setItems(data || []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function addIdea() {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('content_pipeline').insert({
      title: newTitle,
      description: '',
      stage: 'idea',
      score: null,
    });
    if (error) toast.error(error.message);
    else { setNewTitle(''); load(); }
  }

  async function moveStage(id: string, currentStage: string) {
    const idx = STAGES.indexOf(currentStage as typeof STAGES[number]);
    if (idx >= STAGES.length - 1) return;
    const nextStage = STAGES[idx + 1];
    await supabase.from('content_pipeline').update({ stage: nextStage }).eq('id', id);
    load();
  }

  async function remove(id: string) {
    await supabase.from('content_pipeline').delete().eq('id', id);
    load();
  }

  async function aiScore(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    toast.info('Scoring with AI...');
    try {
      const res = await fetch('/api/ai/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Score failed');

      await supabase.from('content_pipeline').update({ score: data.score, stage: 'scored' }).eq('id', id);
      toast.success(`Scored: ${data.score}/100${data.reason ? ' — ' + data.reason : ''}`);
      load();
    } catch (err) {
      toast.error(`Score failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Pipeline</h1>
        <p className="text-muted-foreground">Kanban board: ideas &rarr; scored &rarr; approved &rarr; scheduled</p>
      </div>

      <div className="flex gap-2">
        <Input value={newTitle} onChange={e => setNewTitle(e.target.value)}
          placeholder="Add a content idea..." onKeyDown={e => e.key === 'Enter' && addIdea()} />
        <Button onClick={addIdea}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {STAGES.map(stage => (
          <div key={stage}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold capitalize">{stage}</h3>
              <Badge variant="secondary" className="text-xs">
                {items.filter(i => i.stage === stage).length}
              </Badge>
            </div>
            <div className="space-y-2">
              {items.filter(i => i.stage === stage).map(item => (
                <Card key={item.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(item.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    {item.score && (
                      <Badge variant="secondary" className="text-xs mb-2">Score: {item.score}/100</Badge>
                    )}
                    <div className="flex gap-1">
                      {stage === 'idea' && (
                        <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => aiScore(item.id)}>
                          <Sparkles className="h-3 w-3 mr-1" />Score
                        </Button>
                      )}
                      {stage !== 'scheduled' && (
                        <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => moveStage(item.id, stage)}>
                          <ArrowRight className="h-3 w-3 mr-1" />Move
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
