import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { createVaultPublicClient, isRecipientAllowed, readVaultState } from '../adapters/hedera';
import {
  kill,
  runLive,
  slash,
  verifyLive,
  LiveVerifyError,
  type DemoConfig,
  type DemoMode,
  type KillResult,
  type LiveSnapshot,
  type SlashResult,
} from '../demo';

const MAX_BODY_BYTES = 64 * 1024;

export interface MandatePayload {
  readonly status: string;
  readonly budgetCapTinybar: string;
  readonly deadlineUnixSeconds: string;
  readonly spentTinybar: string;
  readonly principalBalanceTinybar: string;
  readonly stakeBalanceTinybar: string;
  readonly recipient: string;
  readonly recipientAllowed: boolean;
}

export interface DemoActions {
  mandate(): Promise<MandatePayload>;
  run(mode: DemoMode): Promise<LiveSnapshot>;
  verify(correlationId: string): Promise<LiveSnapshot>;
  slash(correlationId: string): Promise<SlashResult>;
  kill(): Promise<KillResult>;
}

export function createDemoActions(config: DemoConfig): DemoActions {
  return {
    async mandate(): Promise<MandatePayload> {
      const publicClient = createVaultPublicClient(config.rpcUrl);
      const state = await readVaultState(publicClient, config.vaultAddress);
      let recipientAllowed: boolean;
      try {
        recipientAllowed = await isRecipientAllowed(
          publicClient,
          config.vaultAddress,
          config.recipient,
        );
      } catch {
        recipientAllowed = false;
      }
      return {
        status: state.status,
        budgetCapTinybar: state.budgetCapTinybar,
        deadlineUnixSeconds: state.deadlineUnixSeconds,
        spentTinybar: state.spentTinybar,
        principalBalanceTinybar: state.principalBalanceTinybar,
        stakeBalanceTinybar: state.stakeBalanceTinybar,
        recipient: config.recipient,
        recipientAllowed,
      };
    },

    async run(mode: DemoMode): Promise<LiveSnapshot> {
      const { correlationId } = await runLive(config, { mode });
      // The mirror node needs a few seconds to index the fresh HCS messages.
      const deadline = Date.now() + 30_000;
      let lastError: LiveVerifyError | undefined;
      while (Date.now() < deadline) {
        try {
          return await verifyLive(config, correlationId);
        } catch (error) {
          if (
            error instanceof LiveVerifyError &&
            error.code.startsWith('NO_EVIDENCE_FOR_CORRELATION')
          ) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          throw error;
        }
      }
      throw lastError ?? new LiveVerifyError('VERIFICATION_TIMEOUT');
    },

    async verify(correlationId: string): Promise<LiveSnapshot> {
      return verifyLive(config, correlationId);
    },

    async slash(correlationId: string): Promise<SlashResult> {
      return slash(config, correlationId);
    },

    async kill(): Promise<KillResult> {
      return kill(config);
    },
  };
}

export interface DemoControllerOptions {
  readonly actions: DemoActions;
  readonly port?: number;
  readonly host?: string;
  /** Absolute path to the built frontend directory (e.g. dist/web). */
  readonly staticDir?: string;
}

export interface RunningDemoController {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function readBody(request: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let overflow = false;
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        overflow = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(overflow ? undefined : Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => resolve(undefined));
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const raw = await readBody(request);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (!response.headersSent) {
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    });
  }
  response.end(JSON.stringify(body));
}

function errorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof LiveVerifyError) {
    const status = error.code.startsWith('NO_EVIDENCE_FOR_CORRELATION') ? 404 : 422;
    return { status, body: { error: error.code } };
  }
  if (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code;
    return { status: 422, body: { error: code } };
  }
  return { status: 500, body: { error: 'internal_error' } };
}

async function serveStatic(
  response: ServerResponse,
  staticDir: string,
  pathname: string,
): Promise<void> {
  const requested = normalize(pathname).replace(/^([/\\])+/, '');
  const filePath = join(staticDir, requested === '' ? 'index.html' : requested);
  const indexFallback = join(staticDir, 'index.html');

  let resolved = filePath;
  if (!filePath.startsWith(staticDir)) resolved = indexFallback;

  let content: Buffer;
  let contentType: string;
  try {
    content = await readFile(resolved);
    contentType = CONTENT_TYPES[extname(resolved)] ?? 'application/octet-stream';
  } catch {
    content = await readFile(indexFallback);
    contentType = CONTENT_TYPES['.html'] ?? 'text/html; charset=utf-8';
  }

  response.writeHead(200, { 'content-type': contentType });
  response.end(content);
}

export async function startDemoController(
  options: DemoControllerOptions,
): Promise<RunningDemoController> {
  const { actions } = options;
  const host = options.host ?? '127.0.0.1';
  const staticDir = options.staticDir ?? join(process.cwd(), 'dist', 'web');

  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      const pathname = url.pathname;

      if (pathname.startsWith('/api/')) {
        await handleApi(request, response, actions, pathname);
        return;
      }
      await serveStatic(response, staticDir, pathname);
    })().catch(() => {
      sendJson(response, 500, { error: 'internal_error' });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind demo controller');
  }

  return {
    port: address.port,
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  actions: DemoActions,
  pathname: string,
): Promise<void> {
  try {
    if (request.method === 'GET' && pathname === '/api/health') {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/mandate') {
      sendJson(response, 200, await actions.mandate());
      return;
    }
    if (request.method === 'POST' && pathname === '/api/run') {
      const body = (await readJsonBody(request)) as { mode?: string } | undefined;
      const mode: DemoMode = body?.mode === 'forged' ? 'forged' : 'normal';
      sendJson(response, 200, await actions.run(mode));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/verify') {
      const body = (await readJsonBody(request)) as { correlationId?: string } | undefined;
      if (typeof body?.correlationId !== 'string' || body.correlationId.trim().length === 0) {
        sendJson(response, 400, { error: 'missing_correlation_id' });
        return;
      }
      sendJson(response, 200, await actions.verify(body.correlationId));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/slash') {
      const body = (await readJsonBody(request)) as { correlationId?: string } | undefined;
      if (typeof body?.correlationId !== 'string' || body.correlationId.trim().length === 0) {
        sendJson(response, 400, { error: 'missing_correlation_id' });
        return;
      }
      sendJson(response, 200, await actions.slash(body.correlationId));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/kill') {
      sendJson(response, 200, await actions.kill());
      return;
    }
    sendJson(response, 404, { error: 'not_found' });
  } catch (error) {
    const mapped = errorResponse(error);
    sendJson(response, mapped.status, mapped.body);
  }
}
