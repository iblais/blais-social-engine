'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Hash } from 'lucide-react';
import type { HashtagGroup } from '@/types/database';

export default function HashtagsPage() {
  const [groups, setGroups] = useState<HashtagGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HashtagGroup | null>(null);
  const [name, setName] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase.from('hashtag_groups').select('*').order('created_at');
    setGroups(data || []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setName(''); setHashtagsText(''); setOpen(true); }
  function openEdit(g: HashtagGroup) {
    setEditing(g); setName(g.name); setHashtagsText(g.hashtags.join(' ')); setOpen(true);
  }

  function parseHashtags(text: string): string[] {
    return text.split(/[\s,]+/).filter(Boolean).map(h => h.startsWith('#') ? h : `#${h}`);
  }

  async function save() {
    if (!name.trim()) { toast.error('Name required'); return; }
    const hashtags = parseHashtags(hashtagsText);
    if (!hashtags.length) { toast.error('Add at least one hashtag'); return; }
    setLoading(true);
    const payload = { name, hashtags, is_active: true };
    const { error } = editing
      ? await supabase.from('hashtag_groups').update(payload).eq('id', editing.id)
      : await supabase.from('hashtag_groups').insert(payload);
    if (error) toast.error(error.message);
    else { toast.success(editing ? 'Updated!' : 'Created!'); setOpen(false); load(); }
    setLoading(false);
  }

  async function remove(id: string) {
    await supabase.from('hashtag_groups').delete().eq('id', id);
    toast.success('Deleted'); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hashtag Groups</h1>
          <p className="text-muted-foreground">Reusable sets of hashtags for your posts</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Group</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Hashtag Group</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Group Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Growth Hacking" />
              </div>
              <div className="space-y-2">
                <Label>Hashtags</Label>
                <Textarea value={hashtagsText} onChange={e => setHashtagsText(e.target.value)}
                  placeholder="#socialmedia #marketing #growth" className="min-h-[120px]" />
                <p className="text-xs text-muted-foreground">Separate with spaces or commas. # is added automatically.</p>
              </div>
              {hashtagsText && (
                <div className="flex flex-wrap gap-1">
                  {parseHashtags(hashtagsText).map((h, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{h}</Badge>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!groups.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No hashtag groups yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map(g => (
            <Card key={g.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" />
                    <p className="font-semibold">{g.name}</p>
                    <Badge variant="secondary" className="text-xs">{g.hashtags.length}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(g.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.hashtags.slice(0, 10).map((h, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{h}</Badge>
                  ))}
                  {g.hashtags.length > 10 && <Badge variant="secondary" className="text-xs">+{g.hashtags.length - 10}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
