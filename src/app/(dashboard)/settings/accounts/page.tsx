'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Plus, Trash2, CheckCircle, XCircle, RefreshCw, AlertTriangle, Shield, ChevronDown, Palette } from 'lucide-react';
import type { SocialAccount, Platform, Brand } from '@/types/database';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'linkedin', label: 'LinkedIn' },
];

const BRAND_COLORS = [
  '#D72638', '#3498DB', '#2ECC71', '#9B59B6',
  '#F39C12', '#1ABC9C', '#E67E22', '#E74C3C',
  '#8E44AD', '#2C3E50',
];

function getTokenStatus(expiresAt: string | null): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle } {
  if (!expiresAt) return { label: 'Unknown', variant: 'secondary', icon: AlertTriangle };
  const expires = new Date(expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) return { label: 'Expired', variant: 'destructive', icon: XCircle };
  if (daysLeft <= 7) return { label: `Expires in ${daysLeft}d`, variant: 'destructive', icon: AlertTriangle };
  if (daysLeft <= 30) return { label: `Expires in ${daysLeft}d`, variant: 'outline', icon: AlertTriangle };
  return { label: `Valid (${daysLeft}d)`, variant: 'default', icon: Shield };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [username, setUsername] = useState('');
  const [platformUserId, setPlatformUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Brand creation form
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandColor, setNewBrandColor] = useState('#3498DB');

  const supabase = createClient();

  const loadData = useCallback(async () => {
    const [{ data: accts }, { data: brandRows }] = await Promise.all([
      supabase.from('social_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('brands').select('*').order('name'),
    ]);
    setAccounts(accts || []);
    setBrands(brandRows || []);
  }, [supabase]);

  useEffect(() => {
    loadData();

    // Check URL params for OAuth results
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    const connected = params.get('connected');

    if (success === 'instagram' && connected) {
      toast.success(`Connected: ${decodeURIComponent(connected)}`);
      window.history.replaceState({}, '', '/settings/accounts');
    } else if (success === 'youtube') {
      toast.success('YouTube channel connected!');
      window.history.replaceState({}, '', '/settings/accounts');
    } else if (error) {
      toast.error(`Connection failed: ${decodeURIComponent(error)}`);
      window.history.replaceState({}, '', '/settings/accounts');
    }
  }, [loadData]);

  async function handleAddBrand() {
    if (!newBrandName.trim()) { toast.error('Brand name is required'); return; }
    setLoading(true);
    const slug = newBrandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { error } = await supabase.from('brands').insert({
      name: newBrandName.trim(),
      slug,
      color: newBrandColor,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Brand "${newBrandName.trim()}" created!`);
      setBrandDialogOpen(false);
      setNewBrandName('');
      loadData();
    }
    setLoading(false);
  }

  async function deleteBrand(id: string) {
    // Unlink accounts first (SET NULL), then delete brand
    const { error } = await supabase.from('brands').delete().eq('id', id);
    if (error) { toast.error('Failed to delete brand'); return; }
    toast.success('Brand deleted');
    loadData();
  }

  async function handleAdd() {
    if (!username || !accessToken || !platformUserId) {
      toast.error('All fields are required');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('social_accounts').insert({
      platform,
      username,
      platform_user_id: platformUserId,
      access_token: accessToken,
      display_name: username,
      brand_id: selectedBrandId || null,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Account added!');
      setDialogOpen(false);
      setUsername('');
      setPlatformUserId('');
      setAccessToken('');
      setSelectedBrandId('');
      loadData();
    }
    setLoading(false);
  }

  async function assignBrand(accountId: string, brandId: string | null) {
    await supabase.from('social_accounts').update({ brand_id: brandId }).eq('id', accountId);
    loadData();
  }

  async function refreshToken(accountId: string) {
    setRefreshingId(accountId);
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message);
      loadData();
    } catch (err) {
      toast.error(`Refresh failed: ${(err as Error).message}`);
    } finally {
      setRefreshingId(null);
    }
  }

  async function toggleAccount(id: string, isActive: boolean) {
    await supabase.from('social_accounts').update({ is_active: !isActive }).eq('id', id);
    loadData();
  }

  async function deleteAccount(id: string) {
    const { error } = await supabase.from('social_accounts').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete account');
    } else {
      toast.success('Account removed');
      loadData();
    }
  }

  const isMetaPlatform = (p: string) => ['instagram', 'facebook'].includes(p);

  // Group accounts by brand
  const brandAccountMap = new Map<string | null, SocialAccount[]>();
  for (const acc of accounts) {
    const key = acc.brand_id ?? null;
    if (!brandAccountMap.has(key)) brandAccountMap.set(key, []);
    brandAccountMap.get(key)!.push(acc);
  }

  function AccountCard({ account }: { account: SocialAccount }) {
    const tokenStatus = isMetaPlatform(account.platform)
      ? getTokenStatus(account.token_expires_at)
      : null;
    const TokenIcon = tokenStatus?.icon;

    return (
      <div className="flex items-center justify-between py-3 px-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-bold uppercase shrink-0">
            {account.avatar_url ? (
              <img src={account.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              account.platform[0]
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{account.username.startsWith('@') ? account.username : `@${account.username}`}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground capitalize">{account.platform}</span>
              {tokenStatus && TokenIcon && (
                <Badge variant={tokenStatus.variant} className="text-[10px] h-5">
                  <TokenIcon className="h-3 w-3 mr-1" />
                  {tokenStatus.label}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Brand assignment */}
          <Select
            value={account.brand_id || 'none'}
            onValueChange={(v) => assignBrand(account.id, v === 'none' ? null : v)}
          >
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Brand</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                    {b.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isMetaPlatform(account.platform) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => refreshToken(account.id)}
              disabled={refreshingId === account.id}
              title="Refresh token"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingId === account.id ? 'animate-spin' : ''}`} />
            </Button>
          )}
          <Badge
            variant={account.is_active ? 'default' : 'secondary'}
            className="cursor-pointer text-[10px] h-6"
            onClick={() => toggleAccount(account.id, account.is_active)}
          >
            {account.is_active ? 'Active' : 'Off'}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => deleteAccount(account.id)}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connected Accounts</h1>
          <p className="text-muted-foreground">Manage your social media accounts and brands</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Palette className="h-4 w-4 mr-2" />
                Add Brand
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Brand</DialogTitle>
                <DialogDescription>Group your social accounts under a brand name.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Brand Name</Label>
                  <Input placeholder="e.g. Blais Lab" value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2 flex-wrap">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`w-8 h-8 rounded-full transition-all ${newBrandColor === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setNewBrandColor(c)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBrandDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddBrand} disabled={loading}>{loading ? 'Creating...' : 'Create Brand'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Manual
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Social Account</DialogTitle>
                <DialogDescription>
                  Connect a social media account with an API access token.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Select value={selectedBrandId || 'none'} onValueChange={(v) => setSelectedBrandId(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Brand</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input placeholder="@yourhandle" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Platform User ID</Label>
                  <Input placeholder="e.g. 17841400000000" value={platformUserId} onChange={(e) => setPlatformUserId(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Access Token</Label>
                  <Input type="password" placeholder="Your API access token" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={loading}>{loading ? 'Adding...' : 'Add Account'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* OAuth Connect Buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Connect with OAuth</CardTitle>
          <CardDescription>
            Recommended: auto-connects your accounts with token refresh support
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={() => window.location.href = '/api/auth/instagram'}
            className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:from-purple-600 hover:via-pink-600 hover:to-orange-600 text-white"
          >
            Connect Instagram & Facebook
          </Button>
          <Button
            onClick={() => window.location.href = '/api/auth/youtube'}
            variant="outline"
            className="border-red-500 text-red-500 hover:bg-red-50"
          >
            Connect YouTube
          </Button>
        </CardContent>
      </Card>

      {/* Accounts grouped by brand */}
      {brands.map((brand) => {
        const brandAccounts = brandAccountMap.get(brand.id) || [];
        return (
          <Collapsible key={brand.id} defaultOpen>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-8 w-8 flex items-center justify-center rounded-full font-bold text-white text-sm"
                        style={{ backgroundColor: brand.color || '#3498DB' }}
                      >
                        {brand.name[0].toUpperCase()}
                      </span>
                      <div>
                        <CardTitle className="text-base">{brand.name}</CardTitle>
                        <CardDescription>{brandAccounts.length} account{brandAccounts.length !== 1 ? 's' : ''}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); deleteBrand(brand.id); }}
                        title="Delete brand"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-2">
                  {brandAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No accounts assigned to this brand yet.</p>
                  ) : (
                    brandAccounts.map((acc) => <AccountCard key={acc.id} account={acc} />)
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {/* Unassigned accounts */}
      {(brandAccountMap.get(null) || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unassigned Accounts</CardTitle>
            <CardDescription>These accounts are not assigned to any brand</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(brandAccountMap.get(null) || []).map((acc) => (
              <AccountCard key={acc.id} account={acc} />
            ))}
          </CardContent>
        </Card>
      )}

      {!accounts.length && !brands.length && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No accounts connected yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a brand first, then use the OAuth buttons above to connect your accounts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
