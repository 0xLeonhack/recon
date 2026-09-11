import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  startDemoController,
  type DemoActions,
  type RunningDemoController,
} from '../../../src/api/demo-controller';
import { RunLiveError } from '../../../src/demo';

const actions = {
  mandate: vi.fn(),
  run: vi.fn(),
  verify: vi.fn(),
  slash: vi.fn(),
  kill: vi.fn(),
  progress: vi.fn(),
};

let server: RunningDemoController;
let staticDir: string;

beforeEach(async () => {
  staticDir = await mkdtemp(join(tmpdir(), 'recon-demo-'));
  await writeFile(join(staticDir, 'index.html'), '<html>ok</html>', 'utf8');

  actions.mandate.mockResolvedValue({ status: 'Active', recipient: '0xabc' });
  actions.run.mockResolvedValue({ correlationId: 'live-1', report: { status: 'VERIFIED' } });
  actions.verify.mockResolvedValue({ correlationId: 'live-1', report: { status: 'VERIFIED' } });
  actions.slash.mockResolvedValue({ correlationId: 'live-1', stakeAfter: '0' });
  actions.kill.mockResolvedValue({ vaultStateAfter: { status: 'Frozen' } });
  actions.progress.mockReturnValue(null);

  server = await startDemoController({
    actions: actions as unknown as DemoActions,
    host: '127.0.0.1',
    staticDir,
  });
});

afterEach(async () => {
  await server.close();
  await rm(staticDir, { recursive: true, force: true });
});

describe('startDemoController', () => {
  it('answers the health probe', async () => {
    const response = await fetch(`${server.url}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('delegates the mandate read', async () => {
    const response = await fetch(`${server.url}/api/mandate`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'Active', recipient: '0xabc' });
    expect(actions.mandate).toHaveBeenCalledTimes(1);
  });

  it('maps a normal run mode to the action', async () => {
    const response = await fetch(`${server.url}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'normal' }),
    });
    expect(response.status).toBe(200);
    expect(actions.run).toHaveBeenCalledWith('normal');
  });

  it('maps a forged run mode to the action', async () => {
    const response = await fetch(`${server.url}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'forged' }),
    });
    expect(response.status).toBe(200);
    expect(actions.run).toHaveBeenCalledWith('forged');
  });

  it('rejects a verify request without a correlation id', async () => {
    const response = await fetch(`${server.url}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'missing_correlation_id' });
    expect(actions.verify).not.toHaveBeenCalled();
  });

  it('delegates verify with a correlation id', async () => {
    const response = await fetch(`${server.url}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ correlationId: 'live-1' }),
    });
    expect(response.status).toBe(200);
    expect(actions.verify).toHaveBeenCalledWith('live-1');
  });

  it('rejects a slash request without a correlation id', async () => {
    const response = await fetch(`${server.url}/api/slash`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    expect(actions.slash).not.toHaveBeenCalled();
  });

  it('delegates the kill switch', async () => {
    const response = await fetch(`${server.url}/api/kill`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(actions.kill).toHaveBeenCalledTimes(1);
  });

  it('surfaces run rejection codes instead of a generic 500', async () => {
    actions.run.mockRejectedValueOnce(new RunLiveError('VAULT_REJECTED_NotActive'));
    const response = await fetch(`${server.url}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'normal' }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'VAULT_REJECTED_NotActive' });
  });

  it('reports null run progress before a run', async () => {
    const response = await fetch(`${server.url}/api/run/progress`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stage: null });
  });

  it('reports the current run progress', async () => {
    actions.progress.mockReturnValue({ stage: 'RATIONALE' });
    const response = await fetch(`${server.url}/api/run/progress`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stage: 'RATIONALE' });
  });

  it('returns 404 for unknown API routes', async () => {
    const response = await fetch(`${server.url}/api/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('serves the built frontend with SPA fallback', async () => {
    const response = await fetch(`${server.url}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('<html>ok</html>');
  });
});
