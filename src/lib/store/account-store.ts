import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AccountStore {
  activeBrandId: string | null; // null = all brands
  setActiveBrand: (id: string | null) => void;
}

export const useAccountStore = create<AccountStore>()(
  persist(
    (set) => ({
      activeBrandId: null,
      setActiveBrand: (id) => set({ activeBrandId: id }),
    }),
    { name: 'blais-active-brand' }
  )
);
