import { defineStore } from 'pinia';
import { api } from '../api/client';

export interface AuthUser {
  id: number;
  username: string;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: null as string | null,
    user: null as AuthUser | null,
  }),
  getters: {
    isLoggedIn: (state): boolean => !!state.token,
  },
  actions: {
    setSession(token: string, user: AuthUser) {
      this.token = token;
      this.user = user;
    },
    clear() {
      this.token = null;
      this.user = null;
    },
    async login(username: string, password: string) {
      const res = await api.login(username, password);
      this.setSession(res.token, res.user);
    },
    async logout() {
      try {
        await api.logout();
      } finally {
        this.clear();
      }
    },
    async fetchMe() {
      if (!this.token) return;
      const res = await api.me();
      this.user = res.user;
    },
  },
});
