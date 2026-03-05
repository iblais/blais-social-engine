'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, FlaskConical, Trophy, Trash2 } from 'lucide-react';

interface ABTest {
  id: string;
  name: string;
  variant_a: string;
  variant_b: string;
  status: string;
  winner: string | null;
  metrics_a: Record<string, number> | null;
  metrics_b: Record<string, number> | null;
  created_at: string;
}

export default function ABTestingPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [variantA, setVariantA] = useState('');
  const [variantB, setVariantB] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase.from('ab_tests').select('*').order('created_at', { ascending: false });
    setTests(data || []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim() || !variantA.trim() || !variantB.trim()) {
      toast.error('Fill in all fields'); return;
    }
    setLoading(true);
    const { error } = await supabase.from('ab_tests').insert({
      name, variant_a: variantA, variant_b: variantB, status: 'active',
    });
    if (error) toast.error(error.message);
    else { toast.success('Test created!'); setOpen(false); setName(''); setVariantA(''); setVariantB(''); load(); }
    setLoading(false);
  }

  async function remove(id: string) {
    await supabase.from('ab_tests').delete().eq('id', id);
    toast.success('Deleted'); load();
  }

  async function pickWinner(id: string, winner: 'A' | 'B') {
    const { error } = await supabase
      .from('ab_tests')
      .update({ winner, status: 'completed' })
      .eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success(`Variant ${winner} wins!`); load(); }
  }

  const statusColors: Record<string, string> = {
    active: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    cancelled: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A/B Testing</h1>
          <p className="text-muted-foreground">Test caption variants and find what performs best</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Test</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create A/B Test</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Test Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CTA placement test" />
              </div>
              <div className="space-y-2">
                <Label>Variant A (Caption)</Label>
                <Textarea value={variantA} onChange={e => setVariantA(e.target.value)} placeholder="First version..." className="min-h-[80px]" />
              </div>
              <div className="space-y-2">
                <Label>Variant B (Caption)</Label>
                <Textarea value={variantB} onChange={e => setVariantB(e.target.value)} placeholder="Second version..." className="min-h-[80px]" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create} disabled={loading}>{loading ? 'Creating...' : 'Create Test'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!tests.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FlaskConical className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          No A/B tests yet. Create one to start optimizing your captions.
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {tests.map(test => (
            <Card key={test.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{test.name}</p>
                      <Badge variant="secondary" className={statusColors[test.status] || ''}>{test.status}</Badge>
                      {test.winner && <Badge className="bg-primary/20 text-primary"><Trophy className="h-3 w-3 mr-1" />Winner: {test.winner}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(test.created_at).toLocaleDateString()}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(test.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-3 rounded-lg border ${test.winner === 'A' ? 'border-primary ring-2 ring-primary/30' : ''}`}>
                    <p className="text-xs font-medium mb-1">Variant A</p>
                    <p className="text-sm text-muted-foreground">{test.variant_a?.substring(0, 120)}...</p>
                    {test.status === 'active' && (
                      <Button size="sm" variant="outline" className="mt-2 text-xs h-7" onClick={() => pickWinner(test.id, 'A')}>
                        <Trophy className="h-3 w-3 mr-1" />Pick A
                      </Button>
                    )}
                  </div>
                  <div className={`p-3 rounded-lg border ${test.winner === 'B' ? 'border-primary ring-2 ring-primary/30' : ''}`}>
                    <p className="text-xs font-medium mb-1">Variant B</p>
                    <p className="text-sm text-muted-foreground">{test.variant_b?.substring(0, 120)}...</p>
                    {test.status === 'active' && (
                      <Button size="sm" variant="outline" className="mt-2 text-xs h-7" onClick={() => pickWinner(test.id, 'B')}>
                        <Trophy className="h-3 w-3 mr-1" />Pick B
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
