import { ref } from "vue";
import { api } from "./api";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  orgId?: number | null;
}

const user = ref<AuthUser | null>(null);
const token = ref<string | null>(null);

try {
  const t = localStorage.getItem("token");
  if (t) token.value = t;
} catch {}

export function useAuth() {
  async function fetchMe() {
    try {
      const me = await api.me();
      user.value = me as any;
      return me;
    } catch {
      user.value = null;
      return null;
    }
  }

  async function login(username: string, password: string, orgSlug?: string) {
    const res = await api.login({ username, password, orgSlug: orgSlug || undefined });
    token.value = res.token;
    try {
      localStorage.setItem("token", res.token);
    } catch {}
    user.value = { id: res.id, username: res.username, displayName: res.displayName, role: res.role, orgId: (res as any).orgId } as any;
    return res;
  }

  function logout() {
    token.value = null;
    user.value = null;
    try {
      localStorage.removeItem("token");
    } catch {}
    api.logout().catch(() => {});
  }

  return { user, token, login, logout, fetchMe };
}
