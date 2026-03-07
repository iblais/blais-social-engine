'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import {
  Plus,
  Loader2,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Calendar,
  RotateCcw,
} from 'lucide-react';

interface Autolist {
  id: string;
  user_id: string;
  brand_id: string | null;
  name: string;
  description: string | null;
  account_ids: string[];
  schedule_cron: string | null;
  repeat_interval_days: number | null;
  is_active: boolean;
  last_posted_at: string | null;
  next_post_at: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

interface AutolistItem {
  id: string;
  autolist_id: string;
  caption: string;
  media_urls: string[];
  sort_order: number;
  times_posted: number;
  last_posted_at: string | null;
  is_active: boolean;
  created_at: string;
}

const SCHEDULE_PRESETS: { label: string; cron: string; interval: number }[] = [
  { label: 'Daily at noon', cron: '0 12 * * *', interval: 1 },
  { label: 'Every 2 days', cron: '0 12 */2 * *', interval: 2 },
  { label: 'Every 3 days', cron: '0 12 */3 * *', interval: 3 },
  { label: 'Weekly (Monday)', cron: '0 12 * * 1', interval: 7 },
  { label: 'Weekly (Friday)', cron: '0 12 * * 5', interval: 7 },
  { label: 'Twice a week (Mon/Thu)', cron: '0 12 * * 1,4', interval: 3 },
  { label: 'Every 2 weeks', cron: '0 12 1,15 * *', interval: 14 },
];

function formatSchedule(cron: string | null, interval: number | null): string {
  if (!cron) return 'No schedule';
  const preset = SCHEDULE_PRESETS.find((p) => p.cron === cron);
  if (preset) return preset.label;
  if (interval) return `Every ${interval} day${interval > 1 ? 's' : ''}`;
  return cron;
}

export default function AutolistsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accounts, activeBrandId } = useBrandAccounts();

  const [autolists, setAutolists] = useState<Autolist[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSchedulePreset, setFormSchedulePreset] = useState('0');
  const [formAccountIds, setFormAccountIds] = useState<string[]>([]);

  // Expanded autolist (items view)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<AutolistItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Add item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemCaption, setItemCaption] = useState('');
  const [itemMediaUrls, setItemMediaUrls] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const loadAutolists = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    let query = supabase
      .from('autolists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (activeBrandId) {
      query = query.eq('brand_id', activeBrandId);
    }

    const { data, error } = await query;
    if (error) { toast.error(error.message); setLoading(false); return; }

    // Fetch item counts
    const lists = data || [];
    if (lists.length) {
      const { data: counts } = await supabase
        .from('autolist_items')
        .select('autolist_id')
        .in('autolist_id', lists.map((l) => l.id));

      const countMap: Record<string, number> = {};
      (counts || []).forEach((c) => {
        countMap[c.autolist_id] = (countMap[c.autolist_id] || 0) + 1;
      });
      lists.forEach((l) => { l.item_count = countMap[l.id] || 0; });
    }

    setAutolists(lists);
    setLoading(false);
  }, [supabase, activeBrandId]);

  useEffect(() => { loadAutolists(); }, [loadAutolists]);

  const loadItems = useCallback(async (autolistId: string) => {
    setLoadingItems(true);
    const { data, error } = await supabase
      .from('autolist_items')
      .select('*')
      .eq('autolist_id', autolistId)
      .order('sort_order', { ascending: true });

    if (error) toast.error(error.message);
    setItems(data || []);
    setLoadingItems(false);
  }, [supabase]);

  function openCreate() {
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormSchedulePreset('0');
    setFormAccountIds([]);
    setShowDialog(true);
  }

  function openEdit(list: Autolist) {
    setEditingId(list.id);
    setFormName(list.name);
    setFormDescription(list.description || '');
    const presetIdx = SCHEDULE_PRESETS.findIndex((p) => p.cron === list.schedule_cron);
    setFormSchedulePreset(presetIdx >= 0 ? String(presetIdx) : '0');
    setFormAccountIds(list.account_ids || []);
    setShowDialog(true);
  }

  async function saveAutolist() {
    if (!formName.trim()) { toast.error('Name is required'); return; }
    if (!formAccountIds.length) { toast.error('Select at least one account'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); setSaving(false); return; }

    const preset = SCHEDULE_PRESETS[Number(formSchedulePreset)];
    const payload = {
      user_id: user.id,
      brand_id: activeBrandId || null,
      name: formName.trim(),
      description: formDescription.trim() || null,
      account_ids: formAccountIds,
      schedule_cron: preset.cron,
      repeat_interval_days: preset.interval,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('autolists').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('autolists').insert(payload));
    }

    if (error) { toast.error(error.message); }
    else {
      toast.success(editingId ? 'Autolist updated' : 'Autolist created');
      setShowDialog(false);
      loadAutolists();
    }
    setSaving(false);
  }

  async function toggleActive(list: Autolist) {
    const { error } = await supabase
      .from('autolists')
      .update({ is_active: !list.is_active })
      .eq('id', list.id);

    if (error) toast.error(error.message);
    else {
      setAutolists((prev) =>
        prev.map((l) => l.id === list.id ? { ...l, is_active: !l.is_active } : l)
      );
      toast.success(list.is_active ? 'Autolist paused' : 'Autolist activated');
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    // Delete items first, then the autolist
    await supabase.from('autolist_items').delete().eq('autolist_id', deleteId);
    const { error } = await supabase.from('autolists').delete().eq('id', deleteId);
    if (error) toast.error(error.message);
    else {
      toast.success('Autolist deleted');
      if (expandedId === deleteId) setExpandedId(null);
      loadAutolists();
    }
    setDeleteId(null);
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setShowAddItem(false);
    } else {
      setExpandedId(id);
      setShowAddItem(false);
      loadItems(id);
    }
  }

  async function addItem() {
    if (!expandedId || !itemCaption.trim()) { toast.error('Caption is required'); return; }
    setAddingItem(true);

    const mediaUrls = itemMediaUrls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    const nextOrder = items.length;

    const { error } = await supabase.from('autolist_items').insert({
      autolist_id: expandedId,
      caption: itemCaption.trim(),
      media_urls: mediaUrls,
      sort_order: nextOrder,
    });

    if (error) toast.error(error.message);
    else {
      toast.success('Item added');
      setItemCaption('');
      setItemMediaUrls('');
      setShowAddItem(false);
      loadItems(expandedId);
      loadAutolists(); // refresh count
    }
    setAddingItem(false);
  }

  async function deleteItem(itemId: string) {
    const { error } = await supabase.from('autolist_items').delete().eq('id', itemId);
    if (error) toast.error(error.message);
    else {
      toast.success('Item removed');
      if (expandedId) loadItems(expandedId);
      loadAutolists();
    }
  }

  async function toggleItemActive(item: AutolistItem) {
    const { error } = await supabase
      .from('autolist_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);

    if (error) toast.error(error.message);
    else {
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, is_active: !i.is_active } : i)
      );
    }
  }

  // Drag and drop reorder
  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    setItems(reordered);
    setDragIndex(index);
  }

  async function handleDragEnd() {
    setDragIndex(null);
    // Persist new sort_order
    const updates = items.map((item, i) => ({ id: item.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from('autolist_items').update({ sort_order: u.sort_order }).eq('id', u.id);
    }
  }

  function toggleAccountSelection(accountId: string) {
    setFormAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  }

  function getAccountLabel(accountId: string): string {
    const acc = accounts.find((a) => a.id === accountId);
    return acc ? `${acc.username} (${acc.platform})` : accountId.slice(0, 8);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Autolists</h1>
          <p className="text-muted-foreground">
            Evergreen rotation — auto-post content on a repeating schedule
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Autolist
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !autolists.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No autolists yet</p>
            <p className="text-sm mt-1">Create one to start rotating evergreen content automatically.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {autolists.map((list) => (
            <Card key={list.id} className={!list.is_active ? 'opacity-60' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => toggleExpand(list.id)}
                  >
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base truncate">{list.name}</CardTitle>
                      <Badge variant={list.is_active ? 'default' : 'secondary'}>
                        {list.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    {list.description && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{list.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={list.is_active}
                      onCheckedChange={() => toggleActive(list)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(list)}>
                      <Calendar className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(list.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleExpand(list.id)}>
                      {expandedId === list.id
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ListChecks className="h-3.5 w-3.5" />
                    {list.item_count || 0} item{(list.item_count || 0) !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatSchedule(list.schedule_cron, list.repeat_interval_days)}
                  </span>
                  {list.last_posted_at && (
                    <span className="flex items-center gap-1">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Last: {new Date(list.last_posted_at).toLocaleDateString()}
                    </span>
                  )}
                  {list.account_ids?.length > 0 && (
                    <span className="flex items-center gap-1 flex-wrap">
                      {list.account_ids.map((aid) => (
                        <Badge key={aid} variant="outline" className="text-[10px] px-1.5 py-0">
                          {getAccountLabel(aid)}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>

                {/* Expanded items section */}
                {expandedId === list.id && (
                  <div className="mt-4 border-t pt-4 space-y-3">
                    {loadingItems ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !items.length ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No items yet. Add content to start the rotation.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((item, idx) => (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center gap-3 p-3 rounded-md border bg-card transition-colors ${
                              dragIndex === idx ? 'opacity-50 border-primary' : ''
                            } ${!item.is_active ? 'opacity-50' : ''}`}
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{item.caption}</p>
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                <span>Posted {item.times_posted}x</span>
                                {item.media_urls?.length > 0 && (
                                  <span>{item.media_urls.length} media</span>
                                )}
                                {item.last_posted_at && (
                                  <span>Last: {new Date(item.last_posted_at).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Switch
                                size="sm"
                                checked={item.is_active}
                                onCheckedChange={() => toggleItemActive(item)}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => deleteItem(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add item form */}
                    {showAddItem ? (
                      <div className="space-y-3 p-3 rounded-md border bg-muted/30">
                        <div className="space-y-2">
                          <Label>Caption</Label>
                          <Textarea
                            value={itemCaption}
                            onChange={(e) => setItemCaption(e.target.value)}
                            placeholder="Write the caption for this rotation item..."
                            rows={3}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Media URLs (one per line, optional)</Label>
                          <Textarea
                            value={itemMediaUrls}
                            onChange={(e) => setItemMediaUrls(e.target.value)}
                            placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={addItem} disabled={addingItem}>
                            {addingItem ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                            Add Item
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setShowAddItem(false); setItemCaption(''); setItemMediaUrls(''); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowAddItem(true)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Item
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Autolist Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Autolist' : 'New Autolist'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update this autolist\'s settings.'
                : 'Create a new evergreen content rotation.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="al-name">Name</Label>
              <Input
                id="al-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Daily Tips Rotation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="al-desc">Description (optional)</Label>
              <Textarea
                id="al-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What kind of content goes in this list?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select value={formSchedulePreset} onValueChange={setFormSchedulePreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a schedule" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_PRESETS.map((p, i) => (
                    <SelectItem key={i} value={String(i)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Accounts</Label>
              {!accounts.length ? (
                <p className="text-sm text-muted-foreground">No accounts found for this brand.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => toggleAccountSelection(acc.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        formAccountIds.includes(acc.id)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      <span className="capitalize">{acc.platform}</span>
                      <span className="text-xs opacity-70">@{acc.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveAutolist} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Save Changes' : 'Create Autolist'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Autolist</DialogTitle>
            <DialogDescription>
              This will permanently delete this autolist and all its items. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
