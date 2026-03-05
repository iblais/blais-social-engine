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
import { Globe } from 'lucide-react';
import type { SocialAccount } from '@/types/database';

const BRAND_COLORS = [
  '#D72638', '#3498DB', '#2ECC71', '#9B59B6',
  '#F39C12', '#1ABC9C', '#E67E22', '#E74C3C',
];

const platformLabels: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  twitter: 'Twitter / X',
  youtube: 'YouTube',
  bluesky: 'Bluesky',
  pinterest: 'Pinterest',
};

function AccountAvatar({ account, index, size = 'md' }: { account: SocialAccount; index: number; size?: 'md' | 'lg' }) {
  const color = BRAND_COLORS[index % BRAND_COLORS.length];
  const dim = size === 'lg' ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-xs';
  const letter = (account.display_name || account.username || '?')[0].toUpperCase();
  return (
    <span
      className={`${dim} flex items-center justify-center rounded-full font-bold text-white shrink-0`}
      style={{ backgroundColor: color }}
    >
      {letter}
    </span>
  );
}

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

  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const activeIndex = activeAccount ? accounts.indexOf(activeAccount) : -1;

  return (
    <div className="px-3 py-2">
      <Select value={activeAccountId ?? 'all'} onValueChange={handleChange}>
        <SelectTrigger className="w-full h-auto py-2">
          <SelectValue>
            {activeAccount ? (
              <span className="flex items-center gap-2.5">
                <span className="relative">
                  <AccountAvatar account={activeAccount} index={activeIndex} />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                    style={{ backgroundColor: BRAND_COLORS[activeIndex % BRAND_COLORS.length] }}
                  />
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-semibold">@{activeAccount.username}</span>
                  <span className="text-[10px] text-muted-foreground">{platformLabels[activeAccount.platform] || activeAccount.platform}</span>
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-semibold">All Accounts</span>
                  <span className="text-[10px] text-muted-foreground">{accounts.length} connected</span>
                </span>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <span className="flex items-center gap-2.5 py-0.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm font-medium">All Accounts</span>
                <span className="text-[10px] text-muted-foreground">{accounts.length} connected</span>
              </span>
            </span>
          </SelectItem>
          {accounts.map((a, i) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2.5 py-0.5">
                <span
                  className={`relative rounded-full ${a.id === activeAccountId ? 'ring-2 ring-offset-1 ring-offset-background' : ''}`}
                  style={a.id === activeAccountId ? { ['--tw-ring-color' as string]: BRAND_COLORS[i % BRAND_COLORS.length] } : undefined}
                >
                  <AccountAvatar account={a} index={i} />
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-medium">@{a.username}</span>
                  <span className="text-[10px] text-muted-foreground">{platformLabels[a.platform] || a.platform}</span>
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
