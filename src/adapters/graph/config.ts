import { z } from 'zod';

const DEFAULT_GRAPH_GATEWAY_URL = 'https://gateway.thegraph.com';

const GraphEnvironmentSchema = z.object({
  GRAPH_API_KEY: z.string().trim().min(1),
  GRAPH_GATEWAY_URL: z
    .url()
    .refine((value) => value.startsWith('https://'))
    .optional(),
  GRAPH_DEPLOYMENT_ID: z.string().regex(/^[A-Za-z0-9]+$/),
  GRAPH_FINAL_BLOCK_NUMBER: z.coerce.number().int().positive(),
});

export interface GraphProbeConfig {
  readonly apiKey: string;
  readonly deploymentId: string;
  readonly endpoint: string;
  readonly finalBlockNumber: number;
}

export function loadGraphProbeConfig(
  environment: Readonly<Record<string, string | undefined>>,
): GraphProbeConfig {
  const parsed = GraphEnvironmentSchema.parse(environment);
  const gatewayUrl = (parsed.GRAPH_GATEWAY_URL ?? DEFAULT_GRAPH_GATEWAY_URL).replace(/\/$/, '');

  return {
    apiKey: parsed.GRAPH_API_KEY,
    deploymentId: parsed.GRAPH_DEPLOYMENT_ID,
    endpoint: `${gatewayUrl}/api/deployments/id/${parsed.GRAPH_DEPLOYMENT_ID}`,
    finalBlockNumber: parsed.GRAPH_FINAL_BLOCK_NUMBER,
  };
}
