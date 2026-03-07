'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import {
  Plus,
  Loader2,
  Trash2,
  ArrowLeft,
  Users,
  TrendingUp,
  Eye,
  AlertCircle,
} from 'lucide-react';

type Platform = 'instagram' | 'facebook' | 'youtube' | 'bluesky';

const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  youtube: '#FF0000',
  bluesky: '#0085FF',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  bluesky: 'Bluesky',
};

const PLATFORMS: Platform[] = ['instagram', 'facebook', 'youtube', 'bluesky'];

type FilterTab = 'all' | Platform;

interface Competitor {
  id: string;
  user_id: string;
  brand_id: string | null;
  platform: Platform;
  username: string;
  platform_user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers: number | null;
  following: number | null;
  post_count: number | null;
  engagement_rate: number | null;
  last_fetched_at: string | null;
  created_at: string;
}

interface Snapshot {
  id: string;
  competitor_id: string;
  followers: number | null;
  following: number | null;
  post_count: number | null;
  engagement_rate: number | null;
  captured_at: string;
}

export default function CompetitorsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeBrandId } = useBrandAccounts();

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Add dialog
  const [showAdd, setShowAdd] = useState(false);
  const [addPlatform, setAddPlatform] = useState<Platform>('instagram');
  const [addUsername, setAddUsername] = useState('');
  const [saving, setSaving] = useState(false);

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Competitor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCompetitors = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('competitors')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeBrandId) {
      query = query.eq('brand_id', activeBrandId);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load competitors');
    } else {
      setCompetitors(data || []);
    }
    setLoading(false);
  }, [supabase, activeBrandId]);

  useEffect(() => {
    loadCompetitors();
  }, [loadCompetitors]);

  const loadSnapshots = useCallback(
    async (competitorId: string) => {
      setLoadingSnapshots(true);
      const { data, error } = await supabase
        .from('competitor_snapshots')
        .select('*')
        .eq('competitor_id', competitorId)
        .order('captured_at', { ascending: false })
        .limit(50);

      if (error) {
        toast.error('Failed to load snapshots');
      } else {
        setSnapshots(data || []);
      }
      setLoadingSnapshots(false);
    },
    [supabase]
  );

  const handleAdd = async () => {
    if (!addUsername.trim()) {
      toast.error('Username is required');
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Not authenticated');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('competitors').insert({
      user_id: user.id,
      brand_id: activeBrandId || null,
      platform: addPlatform,
      username: addUsername.trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, ''),
    });

    if (error) {
      toast.error('Failed to add competitor: ' + error.message);
    } else {
      toast.success('Competitor added');
      setShowAdd(false);
      setAddUsername('');
      setAddPlatform('instagram');
      loadCompetitors();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    // Delete snapshots first (FK)
    await supabase
      .from('competitor_snapshots')
      .delete()
      .eq('competitor_id', deleteTarget.id);

    const { error } = await supabase
      .from('competitors')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error('Failed to delete competitor');
    } else {
      toast.success('Competitor deleted');
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setSnapshots([]);
      }
      loadCompetitors();
    }
    setDeleteTarget(null);
    setDeleting(false);
  };

  const openDetail = (comp: Competitor) => {
    setSelectedId(comp.id);
    loadSnapshots(comp.id);
  };

  const filtered =
    filterTab === 'all'
      ? competitors
      : competitors.filter((c) => c.platform === filterTab);

  const selected = competitors.find((c) => c.id === selectedId);

  // Summary stats
  const totalCompetitors = competitors.length;
  const avgFollowers =
    totalCompetitors > 0
      ? Math.round(
          competitors.reduce((sum, c) => sum + (c.followers || 0), 0) /
            totalCompetitors
        )
      : 0;
  const competitorsWithRate = competitors.filter(
    (c) => c.engagement_rate !== null
  );
  const avgEngagement =
    competitorsWithRate.length > 0
      ? (
          competitorsWithRate.reduce(
            (sum, c) => sum + (c.engagement_rate || 0),
            0
          ) / competitorsWithRate.length
        ).toFixed(2)
      : '0.00';

  const formatNumber = (n: number | null) => {
    if (n === null || n === undefined) return '--';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  const getInitial = (comp: Competitor) => {
    return (comp.display_name || comp.username || '?')[0].toUpperCase();
  };

  // ---- Detail View ----
  if (selected) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedId(null);
            setSnapshots([]);
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
            style={{ backgroundColor: PLATFORM_COLORS[selected.platform] }}
          >
            {getInitial(selected)}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">
              {selected.display_name || selected.username}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                style={{
                  backgroundColor: PLATFORM_COLORS[selected.platform],
                  color: '#fff',
                }}
              >
                {PLATFORM_LABELS[selected.platform]}
              </Badge>
              <span className="text-sm text-muted-foreground">
                @{selected.username}
              </span>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => setDeleteTarget(selected)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Followers</p>
              <p className="text-xl font-bold">
                {formatNumber(selected.followers)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Following</p>
              <p className="text-xl font-bold">
                {formatNumber(selected.following)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Posts</p>
              <p className="text-xl font-bold">
                {formatNumber(selected.post_count)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Engagement</p>
              <p className="text-xl font-bold">
                {selected.engagement_rate !== null
                  ? selected.engagement_rate + '%'
                  : '--'}
              </p>
            </CardContent>
          </Card>
        </div>

        {selected.last_fetched_at && (
          <p className="text-xs text-muted-foreground">
            Last fetched:{' '}
            {new Date(selected.last_fetched_at).toLocaleString()}
          </p>
        )}

        {/* Snapshots table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historical Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSnapshots ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No snapshots recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium text-right">
                        Followers
                      </th>
                      <th className="py-2 pr-4 font-medium text-right">
                        Following
                      </th>
                      <th className="py-2 pr-4 font-medium text-right">
                        Posts
                      </th>
                      <th className="py-2 font-medium text-right">
                        Engagement
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {new Date(s.captured_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {formatNumber(s.followers)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {formatNumber(s.following)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {formatNumber(s.post_count)}
                        </td>
                        <td className="py-2 text-right">
                          {s.engagement_rate !== null
                            ? s.engagement_rate + '%'
                            : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete confirmation */}
        <Dialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Competitor</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete @{deleteTarget?.username}? All
                historical snapshots will be removed. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ---- List View ----
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Competitor Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and analyze your competitors across platforms
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Competitor
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Total Competitors
              </p>
              <p className="text-xl font-bold">{totalCompetitors}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Followers</p>
              <p className="text-xl font-bold">{formatNumber(avgFollowers)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Avg Engagement Rate
              </p>
              <p className="text-xl font-bold">{avgEngagement}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info banner — show if no competitors have data */}
      {competitors.length > 0 && competitors.every(c => !c.followers) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">Competitor data requires setup</p>
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              To track Instagram competitors, link your Facebook Page to your Instagram account in{' '}
              <a href="https://business.facebook.com/settings" target="_blank" rel="noopener noreferrer" className="underline">
                Meta Business Suite
              </a>
              . This enables the Business Discovery API to fetch competitor follower data.
              YouTube competitors work automatically.
            </p>
          </div>
        </div>
      )}

      {/* Platform filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', ...PLATFORMS] as FilterTab[]).map((tab) => (
          <Button
            key={tab}
            variant={filterTab === tab ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterTab(tab)}
            style={
              filterTab === tab && tab !== 'all'
                ? { backgroundColor: PLATFORM_COLORS[tab as Platform] }
                : undefined
            }
          >
            {tab === 'all' ? 'All' : PLATFORM_LABELS[tab as Platform]}
          </Button>
        ))}
      </div>

      {/* Competitor cards */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              {competitors.length === 0
                ? 'No competitors tracked yet. Add one to get started.'
                : 'No competitors match this filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((comp) => (
            <Card
              key={comp.id}
              className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow"
              onClick={() => openDetail(comp)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="h-11 w-11 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{
                      backgroundColor: PLATFORM_COLORS[comp.platform],
                    }}
                  >
                    {getInitial(comp)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {comp.display_name || comp.username}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{comp.username}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(comp);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Badge
                    variant="secondary"
                    style={{
                      backgroundColor: PLATFORM_COLORS[comp.platform] + '18',
                      color: PLATFORM_COLORS[comp.platform],
                      borderColor: PLATFORM_COLORS[comp.platform] + '40',
                    }}
                    className="border text-xs"
                  >
                    {PLATFORM_LABELS[comp.platform]}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Followers</p>
                    <p className="font-semibold">
                      {formatNumber(comp.followers)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Engagement</p>
                    <p className="font-semibold">
                      {comp.engagement_rate !== null
                        ? comp.engagement_rate + '%'
                        : '--'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Competitor Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Competitor</DialogTitle>
            <DialogDescription>
              Track a new competitor on any platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-platform">Platform</Label>
              <Select
                value={addPlatform}
                onValueChange={(v) => setAddPlatform(v as Platform)}
              >
                <SelectTrigger className="w-full" id="add-platform">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: PLATFORM_COLORS[p] }}
                        />
                        {PLATFORM_LABELS[p]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-username">Username</Label>
              <Input
                id="add-username"
                placeholder="e.g. garyvee"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAdd(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || !addUsername.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Competitor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete @{deleteTarget?.username}? All
              historical snapshots will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
