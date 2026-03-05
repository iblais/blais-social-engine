import { create } from 'zustand';

interface AccountStore {
  activeAccountId: string | null; // null = all accounts
  setActiveAccount: (id: string | null) => void;
}

export const useAccountStore = create<AccountStore>((set) => ({
  activeAccountId: null,
  setActiveAccount: (id) => set({ activeAccountId: id }),
}));
