process.env.NODE_ENV = 'test';
import request from 'supertest';
import app from './server';
import { describe, it, expect } from 'vitest';

describe('Healthcheck API', () => {
  it('should return status ok and environment', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('env', 'test');
  });
});
