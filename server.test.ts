import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

// Mock firebase-admin first
vi.mock('firebase-admin', () => {
  const mAuth = {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-user' }),
  };
  const mFirestore = {
    doc: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ exists: true }),
    set: vi.fn().mockResolvedValue({}),
  };
  return {
    default: {
      auth: vi.fn(() => mAuth),
      firestore: vi.fn(() => mFirestore),
      apps: { length: 1 },
      credential: { cert: vi.fn() },
      initializeApp: vi.fn()
    }
  };
});

import app from './server.js';

describe('POST /api/upload', () => {
  const testFile = path.join(process.cwd(), 'test-upload.jpg');
  const invalidFile = path.join(process.cwd(), 'test-upload.exe');
  const uploadsDir = path.join(process.cwd(), 'uploads');

  beforeAll(() => {
    fs.writeFileSync(testFile, 'fake-jpeg-content');
    fs.writeFileSync(invalidFile, 'fake-exe-content');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
  });

  afterAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    if (fs.existsSync(invalidFile)) fs.unlinkSync(invalidFile);
  });

  it('should return 401 if no token is provided', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', testFile);

    expect(res.status).toBe(401);
  });

  it('should return 400 if no orgId is provided', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', 'Bearer fake-token')
      .attach('file', testFile);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing orgId');
  });

  it('should return 400 if no file is provided', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', 'Bearer fake-token')
      .field('orgId', 'org123');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file');
  });

  it('should return 400 for unsupported file types', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', 'Bearer fake-token')
      .field('orgId', 'org123')
      .attach('file', invalidFile, { contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unsupported file type');
  });

  it('should return 200 and filename/fileUrl for valid requests', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', 'Bearer fake-token')
      .field('orgId', 'org123')
      .attach('file', testFile, { contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('filename');
    expect(res.body).toHaveProperty('fileUrl');
  });
});
