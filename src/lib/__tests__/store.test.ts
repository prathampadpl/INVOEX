import { describe, it, expect, beforeEach } from 'vitest';
import { useAuth } from '../store';
import { User } from 'firebase/auth';

describe('useAuth store', () => {
  const initialState = useAuth.getState();

  beforeEach(() => {
    // Reset state before each test
    useAuth.setState(initialState, true);
  });

  it('should have correct initial state', () => {
    const state = useAuth.getState();
    expect(state.user).toBeNull();
    expect(state.orgId).toBeNull();
    expect(state.orgRole).toBeNull();
    expect(state.orgName).toBeNull();
    expect(state.isLoaded).toBe(false);
  });

  it('should set user correctly', () => {
    const mockUser = { uid: '123', email: 'test@example.com' } as User;

    useAuth.getState().setUser(mockUser);

    expect(useAuth.getState().user).toEqual(mockUser);

    useAuth.getState().setUser(null);
    expect(useAuth.getState().user).toBeNull();
  });

  it('should set org info correctly without orgName', () => {
    useAuth.getState().setOrgInfo('org-123', 'admin');

    const state = useAuth.getState();
    expect(state.orgId).toBe('org-123');
    expect(state.orgRole).toBe('admin');
    expect(state.orgName).toBeNull();
  });

  it('should set org info correctly with orgName', () => {
    useAuth.getState().setOrgInfo('org-456', 'member', 'Test Org');

    const state = useAuth.getState();
    expect(state.orgId).toBe('org-456');
    expect(state.orgRole).toBe('member');
    expect(state.orgName).toBe('Test Org');
  });

  it('should reset org info correctly', () => {
    useAuth.getState().setOrgInfo('org-456', 'member', 'Test Org');
    useAuth.getState().setOrgInfo(null, null, null);

    const state = useAuth.getState();
    expect(state.orgId).toBeNull();
    expect(state.orgRole).toBeNull();
    expect(state.orgName).toBeNull();
  });

  it('should set loaded state correctly', () => {
    useAuth.getState().setLoaded(true);
    expect(useAuth.getState().isLoaded).toBe(true);

    useAuth.getState().setLoaded(false);
    expect(useAuth.getState().isLoaded).toBe(false);
  });
});
