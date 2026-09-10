import { createServer, type IncomingMessage, type Server } from 'node:http';

import { createVerifyQueryHandler, type VerifyQueryConfig } from './verify-query';

const MAX_BODY_BYTES = 64 * 1024;

export interface VerifyQueryServerOptions {
  readonly config: VerifyQueryConfig;
  /** Defaults to an ephemeral loopback port. */
  readonly port?: number;
  readonly host?: string;
}

export interface RunningVerifyQueryServer {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

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

export async function startVerifyQueryServer(
  options: VerifyQueryServerOptions,
): Promise<RunningVerifyQueryServer> {
  const handleVerifyQuery = createVerifyQueryHandler(options.config);
  const host = options.host ?? '127.0.0.1';

  const server: Server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'POST' || request.url !== '/verify-query') {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }

      const rawBody = await readBody(request);
      let parsedBody: unknown;
      try {
        parsedBody = rawBody === undefined ? undefined : JSON.parse(rawBody);
      } catch {
        parsedBody = undefined;
      }

      const result = await handleVerifyQuery({
        headers: request.headers as Readonly<Record<string, string>>,
        body: parsedBody,
      });
      response.writeHead(result.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result.body));
    })().catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' });
      }
      response.end(JSON.stringify({ error: 'internal_error' }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind verify-query server');
  }

  return {
    port: address.port,
    url: `http://${host}:${address.port}/verify-query`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}
