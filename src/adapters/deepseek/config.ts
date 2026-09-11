import { z } from 'zod';

const DeepSeekEnvironmentSchema = z.object({
  DEEPSEEK_API_KEY: z.string().trim().min(1),
  DEEPSEEK_BASE_URL: z
    .url()
    .refine((value) => value.startsWith('https://'))
    .optional(),
  DEEPSEEK_MODEL: z.string().trim().min(1).optional(),
  DEEPSEEK_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).optional(),
});

export interface DeepSeekConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
}

export class DeepSeekConfigError extends Error {
  constructor() {
    super('DeepSeek configuration is missing or invalid');
    this.name = 'DeepSeekConfigError';
  }
}

export function loadDeepSeekConfig(
  environment: Readonly<Record<string, string | undefined>>,
): DeepSeekConfig {
  const parsed = DeepSeekEnvironmentSchema.safeParse(environment);
  if (!parsed.success) throw new DeepSeekConfigError();

  return {
    apiKey: parsed.data.DEEPSEEK_API_KEY,
    baseUrl: (parsed.data.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, ''),
    model: parsed.data.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
    timeoutMs: parsed.data.DEEPSEEK_TIMEOUT_MS ?? 15_000,
  };
}
