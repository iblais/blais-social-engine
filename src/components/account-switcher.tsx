'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAccountStore } from '@/lib/store/account-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SocialAccount } from '@/types/database';

const platformIcons: Record<string, string> = {
  instagram: 'IG',
  facebook: 'FB',
  tiktok: 'TK',
  twitter: 'X',
  youtube: 'YT',
  bluesky: 'BS',
  pinterest: 'PN',
};

export function AccountSwitcher() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const { activeAccountId, setActiveAccount } = useAccountStore();
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('social_accounts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .then(({ data }) => setAccounts(data || []));
  }, [supabase]);

  function handleChange(value: string) {
    setActiveAccount(value === 'all' ? null : value);
  }

  if (!accounts.length) return null;

  return (
    <div className="px-3 py-2">
      <Select value={activeAccountId ?? 'all'} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="All Accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <span className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                *
              </span>
              All Accounts
            </span>
          </SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {platformIcons[a.platform] || a.platform[0].toUpperCase()}
                </span>
                @{a.username}
                <span className="text-muted-foreground text-xs capitalize">
                  {a.platform}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
