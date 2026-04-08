'use strict';

const request = require('supertest');
const app = require('../src/app');

describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('uptime');
  });
});

describe('Agents API', () => {
  it('GET /agents - lists all agents', async () => {
    const res = await request(app).get('/agents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agents');
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(res.body.agents.length).toBeGreaterThan(0);
  });

  it('GET /agents/:id - returns a known agent', async () => {
    const res = await request(app).get('/agents/openclaw');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'openclaw', name: 'OpenClaw' });
  });

  it('GET /agents/:id - returns 404 for unknown agent', async () => {
    const res = await request(app).get('/agents/unknown-agent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /agents/:id/run - starts an idle agent', async () => {
    // Ensure agent is idle first
    await request(app).delete('/agents/ant/stop').catch(() => {});
    const res = await request(app).post('/agents/ant/run');
    expect([200, 409]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.agent.status).toBe('running');
    }
  });

  it('POST /agents/:id/run - returns 409 when already running', async () => {
    // Make sure ant is running
    await request(app).post('/agents/ant/run');
    const res = await request(app).post('/agents/ant/run');
    expect(res.status).toBe(409);
  });

  it('DELETE /agents/:id/stop - stops a running agent', async () => {
    // Ensure openclaw is running
    await request(app).post('/agents/openclaw/run');
    const res = await request(app).delete('/agents/openclaw/stop');
    expect(res.status).toBe(200);
    expect(res.body.agent.status).toBe('idle');
  });

  it('DELETE /agents/:id/stop - returns 409 when agent is not running', async () => {
    // Ensure openclaw is idle
    await request(app).delete('/agents/openclaw/stop').catch(() => {});
    const res = await request(app).delete('/agents/openclaw/stop');
    expect(res.status).toBe(409);
  });

  it('POST /agents/:id/run - returns 404 for unknown agent', async () => {
    const res = await request(app).post('/agents/ghost/run');
    expect(res.status).toBe(404);
  });

  it('DELETE /agents/:id/stop - returns 404 for unknown agent', async () => {
    const res = await request(app).delete('/agents/ghost/stop');
    expect(res.status).toBe(404);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not found');
  });
});
