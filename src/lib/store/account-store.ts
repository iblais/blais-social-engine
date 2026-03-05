import { create } from 'zustand';

interface AccountStore {
  activeBrandId: string | null; // null = all brands
  setActiveBrand: (id: string | null) => void;
}

export const useAccountStore = create<AccountStore>((set) => ({
  activeBrandId: null,
  setActiveBrand: (id) => set({ activeBrandId: id }),
}));
