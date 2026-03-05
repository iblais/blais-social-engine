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
import { toast } from 'sonner';
import { Plus, Trash2, CheckCircle, XCircle, RefreshCw, AlertTriangle, Shield } from 'lucide-react';
import type { SocialAccount, Platform } from '@/types/database';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitter', label: 'Twitter/X' },
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [username, setUsername] = useState('');
  const [platformUserId, setPlatformUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const supabase = createClient();

  const loadAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('social_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    setAccounts(data || []);
  }, [supabase]);

  useEffect(() => {
    loadAccounts();

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
  }, [loadAccounts]);

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
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Account added!');
      setDialogOpen(false);
      setUsername('');
      setPlatformUserId('');
      setAccessToken('');
      loadAccounts();
    }
    setLoading(false);
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
      loadAccounts();
    } catch (err) {
      toast.error(`Refresh failed: ${(err as Error).message}`);
    } finally {
      setRefreshingId(null);
    }
  }

  async function toggleAccount(id: string, isActive: boolean) {
    await supabase.from('social_accounts').update({ is_active: !isActive }).eq('id', id);
    loadAccounts();
  }

  async function deleteAccount(id: string) {
    const { error } = await supabase.from('social_accounts').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete account');
    } else {
      toast.success('Account removed');
      loadAccounts();
    }
  }

  const isMetaPlatform = (p: string) => ['instagram', 'facebook'].includes(p);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connected Accounts</h1>
          <p className="text-muted-foreground">Manage your social media accounts</p>
        </div>
        <div className="flex gap-2">
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    placeholder="@yourhandle"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Platform User ID</Label>
                  <Input
                    placeholder="e.g. 17841400000000"
                    value={platformUserId}
                    onChange={(e) => setPlatformUserId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    For Instagram/Facebook, this is your IG User ID or Page ID.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Access Token</Label>
                  <Input
                    type="password"
                    placeholder="Your API access token"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={loading}>
                  {loading ? 'Adding...' : 'Add Account'}
                </Button>
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

      {!accounts.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No accounts connected yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use the OAuth buttons above to connect your accounts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => {
            const tokenStatus = isMetaPlatform(account.platform)
              ? getTokenStatus(account.token_expires_at)
              : null;
            const TokenIcon = tokenStatus?.icon;

            return (
              <Card key={account.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold uppercase">
                      {account.avatar_url ? (
                        <img src={account.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        account.platform[0]
                      )}
                    </div>
                    <div>
                      <p className="font-medium">@{account.username}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground capitalize">{account.platform}</span>
                        {tokenStatus && TokenIcon && (
                          <Badge variant={tokenStatus.variant} className="text-[10px] h-5">
                            <TokenIcon className="h-3 w-3 mr-1" />
                            {tokenStatus.label}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isMetaPlatform(account.platform) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => refreshToken(account.id)}
                        disabled={refreshingId === account.id}
                        title="Refresh token"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshingId === account.id ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                    <Badge
                      variant={account.is_active ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleAccount(account.id, account.is_active)}
                    >
                      {account.is_active ? (
                        <><CheckCircle className="h-3 w-3 mr-1" /> Active</>
                      ) : (
                        <><XCircle className="h-3 w-3 mr-1" /> Inactive</>
                      )}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAccount(account.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
