'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAccountStore } from '@/lib/store/account-store';
import type { SocialAccount } from '@/types/database';

/**
 * Returns the social accounts that belong to the active brand.
 * If no brand is selected (activeBrandId = null), returns all accounts.
 */
export function useBrandAccounts() {
  const { activeBrandId } = useAccountStore();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      let query = supabase
        .from('social_accounts')
        .select('*')
        .eq('is_active', true)
        .order('platform');

      if (activeBrandId) {
        query = query.eq('brand_id', activeBrandId);
      }

      const { data } = await query;
      const accts = data || [];
      setAccounts(accts);
      setAccountIds(accts.map((a) => a.id));
    })();
  }, [supabase, activeBrandId]);

  return { accounts, accountIds, activeBrandId };
}
