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
import { Plus, Trash2, CheckCircle, XCircle } from 'lucide-react';
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [username, setUsername] = useState('');
  const [platformUserId, setPlatformUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const loadAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('social_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    setAccounts(data || []);
  }, [supabase]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connected Accounts</h1>
          <p className="text-muted-foreground">Manage your social media accounts</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
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

      {!accounts.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No accounts connected yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click &ldquo;Add Account&rdquo; to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold uppercase">
                    {account.platform[0]}
                  </div>
                  <div>
                    <p className="font-medium">@{account.username}</p>
                    <p className="text-sm text-muted-foreground capitalize">{account.platform}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
          ))}
        </div>
      )}
    </div>
  );
}
