import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the console.error to avoid noise in test output
vi.spyOn(console, 'error').mockImplementation(() => {});

// We mock firebase/auth so we can set up different states
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

describe('handleFirestoreError', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should throw a generic error message', async () => {
    // Reset module to re-evaluate initialization with the mock
    vi.mocked(await import('firebase/auth')).getAuth.mockReturnValue({
      currentUser: null,
    } as any);

    // Re-import to pickup mock changes
    const { handleFirestoreError, OperationType } = await import('./firebase');

    expect(() => {
      handleFirestoreError(new Error('Actual db error'), OperationType.CREATE, 'users/1');
    }).toThrow(Error);
  });

  it('should log detailed error information for unauthenticated users', async () => {
    vi.mocked(await import('firebase/auth')).getAuth.mockReturnValue({
      currentUser: null,
    } as any);

    const { handleFirestoreError, OperationType } = await import('./firebase');

    try {
      handleFirestoreError('String error message', OperationType.UPDATE, 'items/2');
    } catch (e) {
      // Ignored
    }

    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      error: 'String error message',
      authInfo: {
        userId: undefined,
        email: undefined,
        emailVerified: undefined,
      },
      operationType: OperationType.UPDATE,
      path: 'items/2',
    }));
  });

  it('should log detailed error information for authenticated users', async () => {
    vi.mocked(await import('firebase/auth')).getAuth.mockReturnValue({
      currentUser: {
        uid: 'user-123',
        email: 'test@example.com',
        emailVerified: true
      }
    } as any);

    const { handleFirestoreError, OperationType } = await import('./firebase');

    const testError = new Error('Database connection failed');
    try {
      handleFirestoreError(testError, OperationType.DELETE, 'logs/3');
    } catch (e) {
      // Ignored
    }

    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      error: 'Database connection failed',
      authInfo: {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      },
      operationType: OperationType.DELETE,
      path: 'logs/3',
    }));
  });
});
