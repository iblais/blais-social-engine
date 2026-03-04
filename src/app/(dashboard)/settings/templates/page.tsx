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
import { Plus, Trash2, Pencil, FileText, Copy } from 'lucide-react';
import type { CaptionTemplate } from '@/types/database';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CaptionTemplate | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase.from('caption_templates').select('*').order('created_at');
    setTemplates(data || []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setName(''); setTemplate(''); setOpen(true); }
  function openEdit(t: CaptionTemplate) { setEditing(t); setName(t.name); setTemplate(t.template); setOpen(true); }

  function extractVars(text: string): string[] {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  }

  async function save() {
    if (!name.trim() || !template.trim()) { toast.error('Name and template required'); return; }
    setLoading(true);
    const variables = extractVars(template);
    const payload = { name, template, variables };
    const { error } = editing
      ? await supabase.from('caption_templates').update(payload).eq('id', editing.id)
      : await supabase.from('caption_templates').insert(payload);
    if (error) toast.error(error.message);
    else { toast.success(editing ? 'Updated!' : 'Created!'); setOpen(false); load(); }
    setLoading(false);
  }

  async function remove(id: string) {
    await supabase.from('caption_templates').delete().eq('id', id);
    toast.success('Deleted'); load();
  }

  function copyTemplate(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caption Templates</h1>
          <p className="text-muted-foreground">Reusable caption formats with {'{{variables}}'}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Template</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Template</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Product Launch" />
              </div>
              <div className="space-y-2">
                <Label>Template Body</Label>
                <Textarea value={template} onChange={e => setTemplate(e.target.value)} className="min-h-[150px]"
                  placeholder={'Introducing {{product_name}}!\n\n{{description}}\n\nLink in bio.\n\n{{hashtags}}'} />
                <p className="text-xs text-muted-foreground">Use {'{{variable_name}}'} for dynamic fields.</p>
              </div>
              {extractVars(template).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Detected variables:</p>
                  <div className="flex flex-wrap gap-1">
                    {extractVars(template).map(v => <Badge key={v} variant="secondary">{`{{${v}}}`}</Badge>)}
                  </div>
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

      {!templates.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No templates yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <p className="font-semibold">{t.name}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => copyTemplate(t.template)}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-md max-h-32 overflow-auto">{t.template}</pre>
                {t.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.variables.map(v => <Badge key={v} variant="secondary" className="text-xs">{`{{${v}}}`}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
