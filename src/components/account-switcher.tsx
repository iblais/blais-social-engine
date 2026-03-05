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
import type { Brand } from '@/types/database';

export function AccountSwitcher() {
  const [brands, setBrands] = useState<(Brand & { account_count: number })[]>([]);
  const { activeBrandId, setActiveBrand } = useAccountStore();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: brandRows } = await supabase
        .from('brands')
        .select('*')
        .order('name');

      if (!brandRows?.length) {
        setBrands([]);
        return;
      }

      // Get account counts per brand
      const { data: accounts } = await supabase
        .from('social_accounts')
        .select('brand_id')
        .eq('is_active', true);

      const countMap: Record<string, number> = {};
      for (const a of accounts || []) {
        if (a.brand_id) countMap[a.brand_id] = (countMap[a.brand_id] || 0) + 1;
      }

      setBrands(
        brandRows.map((b) => ({ ...b, account_count: countMap[b.id] || 0 }))
      );
    })();
  }, [supabase]);

  function handleChange(value: string) {
    setActiveBrand(value === 'all' ? null : value);
  }

  if (!brands.length) return null;

  const activeBrand = brands.find((b) => b.id === activeBrandId);
  const totalAccounts = brands.reduce((sum, b) => sum + b.account_count, 0);

  return (
    <div className="px-3 py-2">
      <Select value={activeBrandId ?? 'all'} onValueChange={handleChange}>
        <SelectTrigger className="w-full h-auto py-2">
          <SelectValue>
            {activeBrand ? (
              <span className="flex items-center gap-2.5">
                <span
                  className="h-7 w-7 flex items-center justify-center rounded-full font-bold text-white text-xs shrink-0"
                  style={{ backgroundColor: activeBrand.color || '#3498DB' }}
                >
                  {activeBrand.name[0].toUpperCase()}
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-semibold">{activeBrand.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {activeBrand.account_count} account{activeBrand.account_count !== 1 ? 's' : ''}
                  </span>
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-semibold">All Brands</span>
                  <span className="text-[10px] text-muted-foreground">{totalAccounts} account{totalAccounts !== 1 ? 's' : ''}</span>
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
                <span className="text-sm font-medium">All Brands</span>
                <span className="text-[10px] text-muted-foreground">{totalAccounts} account{totalAccounts !== 1 ? 's' : ''}</span>
              </span>
            </span>
          </SelectItem>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              <span className="flex items-center gap-2.5 py-0.5">
                <span
                  className={`h-7 w-7 flex items-center justify-center rounded-full font-bold text-white text-xs shrink-0 ${
                    b.id === activeBrandId ? 'ring-2 ring-offset-1 ring-offset-background' : ''
                  }`}
                  style={{
                    backgroundColor: b.color || '#3498DB',
                    ...(b.id === activeBrandId ? { ['--tw-ring-color' as string]: b.color || '#3498DB' } : {}),
                  }}
                >
                  {b.name[0].toUpperCase()}
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-medium">{b.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {b.account_count} account{b.account_count !== 1 ? 's' : ''}
                  </span>
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
