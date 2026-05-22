import { create } from 'zustand';
import { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  workspaceId: string | null;
  workspaceRole: string | null;
  workspaceName: string | null;
  isLoaded: boolean;
  setUser: (user: User | null) => void;
  setWorkspaceInfo: (workspaceId: string | null, workspaceRole: string | null, workspaceName?: string | null) => void;
  setLoaded: (loaded: boolean) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  workspaceId: null,
  workspaceRole: null,
  workspaceName: null,
  isLoaded: false,
  setUser: (user) => set({ user }),
  setWorkspaceInfo: (workspaceId, workspaceRole, workspaceName = null) => set({ workspaceId, workspaceRole, workspaceName }),
  setLoaded: (isLoaded) => set({ isLoaded }),
}));
