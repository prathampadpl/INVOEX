import { create } from 'zustand';
import { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  orgId: string | null;
  orgRole: string | null;
  orgName: string | null;
  isLoaded: boolean;
  setUser: (user: User | null) => void;
  setOrgInfo: (orgId: string | null, orgRole: string | null, orgName?: string | null) => void;
  setLoaded: (loaded: boolean) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  orgId: null,
  orgRole: null,
  orgName: null,
  isLoaded: false,
  setUser: (user) => set({ user }),
  setOrgInfo: (orgId, orgRole, orgName = null) => set({ orgId, orgRole, orgName }),
  setLoaded: (isLoaded) => set({ isLoaded }),
}));
