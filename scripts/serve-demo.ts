import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { discoverHederaX402Support } from '../src/adapters/blocky402';
import { createDemoActions, startDemoController } from '../src/api/demo-controller';
import { loadDemoConfig } from '../src/demo';

loadEnvFile(resolve('.env'));

const baseConfig = loadDemoConfig(process.env);
const support = await discoverHederaX402Support(baseConfig.facilitatorBaseUrl);

const config = { ...baseConfig, feePayer: support.feePayer };
const actions = createDemoActions(config);

const port = Number(process.env.DEMO_PORT ?? '4021');
const host = '127.0.0.1';
const server = await startDemoController({
  actions,
  port,
  host,
  staticDir: resolve('dist', 'web'),
});

console.error(`[serve-demo] facilitator feePayer: ${support.feePayer}`);
console.log(JSON.stringify({ status: 'LISTENING', url: server.url, resource: config.resource }));
