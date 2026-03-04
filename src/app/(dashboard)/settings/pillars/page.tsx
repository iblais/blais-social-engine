'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil } from 'lucide-react';
import type { ContentPillar } from '@/types/database';

const COLORS = ['#f97316','#ef4444','#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#06b6d4'];

export default function PillarsPage() {
  const [pillars, setPillars] = useState<ContentPillar[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentPillar | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState(3);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase.from('content_pillars').select('*').order('created_at');
    setPillars(data || []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null); setName(''); setColor(COLORS[0]); setDescription(''); setFrequency(3); setOpen(true);
  }
  function openEdit(p: ContentPillar) {
    setEditing(p); setName(p.name); setColor(p.color); setDescription(p.description || ''); setFrequency(p.post_frequency); setOpen(true);
  }

  async function save() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setLoading(true);
    const payload = { name, color, description: description || null, post_frequency: frequency, is_active: true };
    const { error } = editing
      ? await supabase.from('content_pillars').update(payload).eq('id', editing.id)
      : await supabase.from('content_pillars').insert(payload);
    if (error) toast.error(error.message);
    else { toast.success(editing ? 'Updated!' : 'Created!'); setOpen(false); load(); }
    setLoading(false);
  }

  async function remove(id: string) {
    await supabase.from('content_pillars').delete().eq('id', id);
    toast.success('Deleted'); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Pillars</h1>
          <p className="text-muted-foreground">Organize your content into themes</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Pillar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Pillar</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tips & Tricks" />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What kind of content fits this pillar?" />
              </div>
              <div className="space-y-2">
                <Label>Posts per week</Label>
                <Input type="number" min={1} max={21} value={frequency} onChange={e => setFrequency(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!pillars.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No pillars yet. Create your first content pillar!</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map(p => (
            <Card key={p.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ background: p.color }} />
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.post_frequency}x / week</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>
                {p.description && <p className="text-sm text-muted-foreground mt-2">{p.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
