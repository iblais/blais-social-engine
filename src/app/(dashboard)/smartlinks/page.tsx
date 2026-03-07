'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAccountStore } from '@/lib/store/account-store';
import {
  Link2,
  Plus,
  Loader2,
  Trash2,
  Eye,
  ArrowLeft,
  GripVertical,
  ExternalLink,
  MousePointerClick,
  Copy,
  BarChart3,
} from 'lucide-react';

interface Smartlink {
  id: string;
  user_id: string;
  brand_id: string | null;
  slug: string;
  title: string;
  bio: string | null;
  avatar_url: string | null;
  theme: Record<string, unknown> | null;
  is_active: boolean;
  total_views: number;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

interface SmartlinkItem {
  id: string;
  smartlink_id: string;
  type: string;
  title: string;
  url: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  clicks: number;
  created_at: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const PUBLIC_BASE = 'blais-social-engine.vercel.app/l';

export default function SmartLinksPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeBrandId } = useAccountStore();

  // List view state
  const [smartlinks, setSmartlinks] = useState<Smartlink[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected smartlink (detail view)
  const [selected, setSelected] = useState<Smartlink | null>(null);
  const [items, setItems] = useState<SmartlinkItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Create smartlink dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createBio, setCreateBio] = useState('');
  const [creating, setCreating] = useState(false);

  // Add item dialog
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemTitle, setItemTitle] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  const [itemIcon, setItemIcon] = useState('');
  const [itemType, setItemType] = useState('link');
  const [addingItem, setAddingItem] = useState(false);

  // Drag reorder state
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Load all smartlinks
  const loadSmartlinks = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('smartlinks')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeBrandId) {
      query = query.eq('brand_id', activeBrandId);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load SmartLinks');
      setLoading(false);
      return;
    }

    // Get item counts
    const links = data || [];
    if (links.length > 0) {
      const { data: countData } = await supabase
        .from('smartlink_items')
        .select('smartlink_id')
        .in('smartlink_id', links.map((l) => l.id));

      const counts: Record<string, number> = {};
      (countData || []).forEach((row: { smartlink_id: string }) => {
        counts[row.smartlink_id] = (counts[row.smartlink_id] || 0) + 1;
      });

      links.forEach((l) => {
        l.item_count = counts[l.id] || 0;
      });
    }

    setSmartlinks(links);
    setLoading(false);
  }, [supabase, activeBrandId]);

  // Load items for selected smartlink
  const loadItems = useCallback(
    async (smartlinkId: string) => {
      setItemsLoading(true);
      const { data, error } = await supabase
        .from('smartlink_items')
        .select('*')
        .eq('smartlink_id', smartlinkId)
        .order('sort_order', { ascending: true });

      if (error) {
        toast.error('Failed to load items');
      } else {
        setItems(data || []);
      }
      setItemsLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    loadSmartlinks();
  }, [loadSmartlinks]);

  // Auto-slug from title
  useEffect(() => {
    setCreateSlug(slugify(createTitle));
  }, [createTitle]);

  // Create smartlink
  async function handleCreate() {
    if (!createTitle.trim() || !createSlug.trim()) {
      toast.error('Title and slug are required');
      return;
    }
    setCreating(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Not authenticated');
      setCreating(false);
      return;
    }

    const { error } = await supabase.from('smartlinks').insert({
      user_id: user.id,
      brand_id: activeBrandId || null,
      slug: createSlug.trim(),
      title: createTitle.trim(),
      bio: createBio.trim() || null,
      is_active: true,
      total_views: 0,
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('That slug is already taken');
      } else {
        toast.error('Failed to create SmartLink');
      }
      setCreating(false);
      return;
    }

    toast.success('SmartLink created');
    setShowCreate(false);
    setCreateTitle('');
    setCreateSlug('');
    setCreateBio('');
    setCreating(false);
    loadSmartlinks();
  }

  // Delete smartlink
  async function handleDelete(id: string) {
    if (!confirm('Delete this SmartLink and all its items?')) return;
    const { error } = await supabase.from('smartlinks').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
      return;
    }
    toast.success('SmartLink deleted');
    if (selected?.id === id) {
      setSelected(null);
      setItems([]);
    }
    loadSmartlinks();
  }

  // Toggle smartlink active
  async function toggleSmartlink(link: Smartlink) {
    const { error } = await supabase
      .from('smartlinks')
      .update({ is_active: !link.is_active })
      .eq('id', link.id);
    if (error) {
      toast.error('Failed to update');
      return;
    }
    if (selected?.id === link.id) {
      setSelected({ ...selected, is_active: !link.is_active });
    }
    loadSmartlinks();
  }

  // Select smartlink to view items
  function openSmartlink(link: Smartlink) {
    setSelected(link);
    loadItems(link.id);
  }

  // Add item
  async function handleAddItem() {
    if (!selected) return;
    if (!itemTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    if (itemType !== 'header' && !itemUrl.trim()) {
      toast.error('URL is required for links and socials');
      return;
    }
    setAddingItem(true);

    const maxOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;

    const { error } = await supabase.from('smartlink_items').insert({
      smartlink_id: selected.id,
      type: itemType,
      title: itemTitle.trim(),
      url: itemType === 'header' ? null : itemUrl.trim(),
      icon: itemIcon.trim() || null,
      sort_order: maxOrder,
      is_active: true,
      clicks: 0,
    });

    if (error) {
      toast.error('Failed to add item');
      setAddingItem(false);
      return;
    }

    toast.success('Item added');
    setShowAddItem(false);
    setItemTitle('');
    setItemUrl('');
    setItemIcon('');
    setItemType('link');
    setAddingItem(false);
    loadItems(selected.id);
  }

  // Toggle item active
  async function toggleItem(item: SmartlinkItem) {
    const { error } = await supabase
      .from('smartlink_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);
    if (error) {
      toast.error('Failed to update item');
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)));
  }

  // Delete item
  async function deleteItem(itemId: string) {
    const { error } = await supabase.from('smartlink_items').delete().eq('id', itemId);
    if (error) {
      toast.error('Failed to delete item');
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    toast.success('Item removed');
  }

  // Drag reorder handlers
  function handleDragStart(index: number) {
    dragItem.current = index;
  }

  function handleDragEnter(index: number) {
    dragOverItem.current = index;
  }

  async function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    const reordered = [...items];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);

    // Update sort_order locally
    const updated = reordered.map((item, idx) => ({ ...item, sort_order: idx }));
    setItems(updated);

    dragItem.current = null;
    dragOverItem.current = null;

    // Persist to DB
    const updates = updated.map((item) =>
      supabase.from('smartlink_items').update({ sort_order: item.sort_order }).eq('id', item.id)
    );
    await Promise.all(updates);
  }

  // Copy public URL
  function copyUrl(slug: string) {
    navigator.clipboard.writeText(`https://${PUBLIC_BASE}/${slug}`);
    toast.success('URL copied to clipboard');
  }

  // --- Detail view (selected smartlink) ---
  if (selected) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(null);
              setItems([]);
            }}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{selected.title}</h1>
            {selected.bio && <p className="text-sm text-muted-foreground mt-1">{selected.bio}</p>}
          </div>
          <Badge variant={selected.is_active ? 'default' : 'secondary'}>
            {selected.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {/* Public URL */}
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="text-sm flex-1 truncate">
              https://{PUBLIC_BASE}/{selected.slug}
            </code>
            <Button variant="outline" size="sm" onClick={() => copyUrl(selected.slug)}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy
            </Button>
          </CardContent>
        </Card>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Eye className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{selected.total_views}</p>
                <p className="text-xs text-muted-foreground">Page Views</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <MousePointerClick className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{items.reduce((sum, i) => sum + (i.clicks || 0), 0)}</p>
                <p className="text-xs text-muted-foreground">Total Clicks</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Items */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Items</h2>
          <Button size="sm" onClick={() => setShowAddItem(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Item
          </Button>
        </div>

        {itemsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No items yet. Add your first link above.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <Card
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className={`cursor-grab active:cursor-grabbing transition-opacity ${
                  !item.is_active ? 'opacity-50' : ''
                }`}
              >
                <CardContent className="flex items-center gap-3 py-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{item.title}</p>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {item.type}
                      </Badge>
                    </div>
                    {item.url && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.url}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    {item.clicks}
                  </div>

                  <Switch
                    checked={item.is_active}
                    onCheckedChange={() => toggleItem(item)}
                    size="sm"
                  />

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Item Dialog */}
        <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Item</DialogTitle>
              <DialogDescription>Add a new link, header, or social to your SmartLink page.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={itemType} onValueChange={setItemType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">Link</SelectItem>
                    <SelectItem value="header">Header</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder={itemType === 'header' ? 'Section title' : 'My Website'}
                />
              </div>
              {itemType !== 'header' && (
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={itemUrl}
                    onChange={(e) => setItemUrl(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Icon (optional)</Label>
                <Input
                  value={itemIcon}
                  onChange={(e) => setItemIcon(e.target.value)}
                  placeholder="e.g. instagram, youtube, globe"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddItem(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddItem} disabled={addingItem}>
                {addingItem && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- List view ---
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SmartLinks</h1>
          <p className="text-sm text-muted-foreground">Manage your link-in-bio pages</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New SmartLink
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : smartlinks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Link2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No SmartLinks yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create your first link-in-bio page to get started.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Create SmartLink
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {smartlinks.map((link) => (
            <Card
              key={link.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openSmartlink(link)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{link.title}</CardTitle>
                  <Badge variant={link.is_active ? 'default' : 'secondary'} className="shrink-0">
                    {link.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <code className="block text-xs text-muted-foreground truncate">
                  {PUBLIC_BASE}/{link.slug}
                </code>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {link.total_views} views
                    </span>
                    <span className="flex items-center gap-1">
                      <Link2 className="h-3.5 w-3.5" />
                      {link.item_count || 0} items
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => copyUrl(link.slug)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy URL
                  </Button>
                  <Switch
                    checked={link.is_active}
                    onCheckedChange={() => toggleSmartlink(link)}
                    size="sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(link.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create SmartLink Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New SmartLink</DialogTitle>
            <DialogDescription>Create a new link-in-bio page for your brand.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="My Link Page"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">{PUBLIC_BASE}/</span>
                <Input
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  placeholder="my-link-page"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bio (optional)</Label>
              <Textarea
                value={createBio}
                onChange={(e) => setCreateBio(e.target.value)}
                placeholder="A short description for your page"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
