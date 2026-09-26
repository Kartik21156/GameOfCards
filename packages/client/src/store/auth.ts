import { create } from 'zustand';
import type { Me } from '@goc/shared';
import { api } from '../api.ts';

interface AuthState {
  me: Me | null;
  loading: boolean;
  load(): Promise<void>;
  login(login: string, password: string): Promise<void>;
  register(input: { username: string; email: string; password: string; displayName?: string }): Promise<void>;
  logout(): Promise<void>;
  update(patch: Partial<Pick<Me, 'displayName' | 'avatar' | 'cardBack'>>): Promise<void>;
  claimDaily(): Promise<void>;
  setChips(chips: number): void;
}

export const useAuth = create<AuthState>((set) => ({
  me: null,
  loading: true,
  async load() {
    try {
      set({ me: await api<Me>('/me'), loading: false });
    } catch {
      set({ me: null, loading: false });
    }
  },
  async login(login, password) {
    set({ me: await api<Me>('/auth/login', { body: { login, password } }) });
  },
  async register(input) {
    set({ me: await api<Me>('/auth/register', { body: input }) });
  },
  async logout() {
    await api('/auth/logout', { body: {} });
    set({ me: null });
  },
  async update(patch) {
    set({ me: await api<Me>('/me', { method: 'PATCH', body: patch }) });
  },
  async claimDaily() {
    set({ me: await api<Me>('/chips/daily', { body: {} }) });
  },
  setChips(chips) {
    set((s) => (s.me ? { me: { ...s.me, chips } } : s));
  },
}));
