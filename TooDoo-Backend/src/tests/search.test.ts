import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '../app';

describe('GET /search/tips', () => {

  it('returns search tips without auth', async () => {
    const res = await request(app).get('/search/tips');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tips)).toBe(true);
    expect(res.body.tips.length).toBeGreaterThan(0);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.take).toBe(8);
  });

  it('filters tips by q', async () => {
    const res = await request(app).get('/search/tips').query({ q: 'piz', take: 5 });

    expect(res.status).toBe(200);
    expect(res.body.tips.every((tip: string) => tip.toLowerCase().includes('piz'))).toBe(true);
  });

  it('rejects invalid take', async () => {
    const res = await request(app).get('/search/tips').query({ take: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });
});
