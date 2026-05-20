import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import path from 'path';

// --- Mocks ---
process.env.GEMINI_API_KEY = 'test-api-key';

vi.mock('file-type', () => ({
  fromFile: vi.fn().mockResolvedValue({ mime: 'text/plain' }),
  fromBuffer: vi.fn().mockResolvedValue({ mime: 'text/plain' })
}));

vi.mock('firebase-admin', () => {
  const getMock = vi.fn();
  const setMock = vi.fn();
  const docMock = vi.fn(() => ({ get: getMock, set: setMock }));

  const collectionMock = vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            empty: true,
            docs: [],
            forEach: vi.fn(),
          }),
        })),
      })),
    })),
    get: vi.fn().mockResolvedValue({
      empty: true,
      docs: [],
      forEach: vi.fn(),
    }),
  }));

  const firestoreMock = () => ({
    doc: docMock,
    collection: collectionMock,
  });

  const verifyIdTokenMock = vi.fn();
  const authMock = () => ({
    verifyIdToken: verifyIdTokenMock,
  });

  return {
    default: {
      apps: [],
      initializeApp: vi.fn(),
      credential: { cert: vi.fn() },
      firestore: firestoreMock,
      auth: authMock,
    },
  };
});

vi.mock('@google/genai', () => {
  const generateContentMock = vi.fn();
  class MockGoogleGenAI {
    models = {
      generateContent: generateContentMock,
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      ARRAY: 'ARRAY',
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      INTEGER: 'INTEGER',
    },
  };
});

// Import the app AFTER mocking
import app from '../server.js';

describe('POST /api/extract E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if no authorization header is provided', async () => {
    const response = await request(app)
      .post('/api/extract')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized. Missing token.');
  });

  it('should return 400 if no file or filename is provided', async () => {
    // Mock valid token
    const authMock = admin.auth() as unknown as { verifyIdToken: any };
    authMock.verifyIdToken.mockResolvedValue({ uid: 'test-user-123' });

    const response = await request(app)
      .post('/api/extract')
      .set('Authorization', 'Bearer fake-token-123')
      .send({ orgId: 'org-123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No file uploaded and no filename provided');
  });

  it('should process a file successfully (happy path)', async () => {
    const authMock = admin.auth() as unknown as { verifyIdToken: any };
    authMock.verifyIdToken.mockResolvedValue({ uid: 'test-user-123' });

    // Mock org membership
    const firestoreMock = admin.firestore() as unknown as { doc: any };
    firestoreMock.doc.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ orgId: 'org-123' }),
      }),
    });

    // Mock GenAI response
    const genAIInstance = new GoogleGenAI({ apiKey: 'fake' });
    const generateContentMock = genAIInstance.models.generateContent as unknown as import('vitest').Mock;

    generateContentMock.mockResolvedValue({
      text: JSON.stringify([{
        vendorName: 'Acme Corp',
        invoiceNumber: 'INV-001',
        grandTotal: 150.0,
      }])
    });

    // Send a real multipart/form-data request with a dummy file
    const response = await request(app)
      .post('/api/extract')
      .set('Authorization', 'Bearer fake-token-123')
      .field('orgId', 'org-123')
      .attach('file', Buffer.from('dummy file content for txt extraction simulation'), 'invoice.txt');

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body[0].vendorName).toBe('Acme Corp');
    expect(response.body[0].invoiceNumber).toBe('INV-001');
  });
});
