// Provider-agnostic model lanes for the AI router (D-026/D-021).
//
// Shape borrowed from LiteLLM's Router model-group + fallbacks table and
// Vercel AI Gateway's ordered `models` fallback chain (links + licenses in
// the task report): an ordered route table per lane, tried top to bottom,
// first healthy response wins. Hand-rolled fetch only — no provider SDKs.
//
// Locked order (orchestrator contract): builder starts on wiro `glm/5-2`
// ($1.40/$4.40 per 1M in/out, live 2026-09-09), persona starts on wiro
// `xai/grok-4-1-fast` ($0.20/$0.50). Off-wiro prices are config, not code.

export type LaneName = 'builder' | 'persona';

export type RouterKeyEnv =
  'WIRO_API_KEY' | 'OPENROUTER_API_KEY' | 'ZAI_API_KEY' | 'DEEPSEEK_API_KEY' | 'ANTHROPIC_API_KEY';

export interface ProviderRoute {
  /** Route origin without the `/chat/completions` suffix. */
  readonly baseURL: string;
  /** Provider-side model id, sent verbatim as `model`. */
  readonly model: string;
  /** Env var holding the bearer key, read at call time (never logged). */
  readonly keyEnv: RouterKeyEnv;
  /** Stable, secret-free label used in attempt records and errors. */
  readonly label: string;
  /** When true, the router sends `reasoning_effort: 'low'` (SPEC R1). */
  readonly reasoningLow?: boolean;
  /** When false, the router skips the route (no OpenAI-compat path known). */
  readonly compatible?: boolean;
  /** When set, this env var overrides `baseURL` at call time (dev use). */
  readonly baseURLEnv?: 'WIRO_BASE_URL';
}

export const WIRO_DEFAULT_BASE_URL = 'https://llm.wiro.ai/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

const WIRO_ENV = 'WIRO_BASE_URL' as const;

export const LANES: Record<LaneName, ProviderRoute[]> = {
  builder: [
    {
      baseURL: WIRO_DEFAULT_BASE_URL,
      model: 'glm/5-2',
      keyEnv: 'WIRO_API_KEY',
      label: 'wiro-glm-5-2',
      reasoningLow: true,
      baseURLEnv: WIRO_ENV,
    },
    {
      baseURL: WIRO_DEFAULT_BASE_URL,
      model: 'xai/grok-4-1-fast',
      keyEnv: 'WIRO_API_KEY',
      label: 'wiro-grok-4-1-fast',
      reasoningLow: true,
      baseURLEnv: WIRO_ENV,
    },
    {
      baseURL: WIRO_DEFAULT_BASE_URL,
      model: 'sonnet-5',
      keyEnv: 'WIRO_API_KEY',
      label: 'wiro-sonnet-5',
      reasoningLow: true,
      baseURLEnv: WIRO_ENV,
    },
    {
      baseURL: OPENROUTER_BASE_URL,
      model: 'z-ai/glm-5.3-flash',
      keyEnv: 'OPENROUTER_API_KEY',
      label: 'openrouter-glm-5.3-flash',
      reasoningLow: true,
    },
    {
      baseURL: ZAI_BASE_URL,
      model: 'glm-5.3-flash',
      keyEnv: 'ZAI_API_KEY',
      label: 'zai-glm-5.3-flash',
      reasoningLow: true,
    },
    {
      baseURL: DEEPSEEK_BASE_URL,
      model: 'deepseek-chat',
      keyEnv: 'DEEPSEEK_API_KEY',
      label: 'deepseek-chat',
      reasoningLow: true,
    },
    {
      baseURL: ANTHROPIC_BASE_URL,
      model: 'sonnet-5',
      keyEnv: 'ANTHROPIC_API_KEY',
      label: 'anthropic-sonnet-direct',
      // No OpenAI-compat chat path is known on the Anthropic origin, so the
      // router skips this route at runtime instead of breaking the loop.
      compatible: false,
    },
  ],
  persona: [
    {
      baseURL: WIRO_DEFAULT_BASE_URL,
      model: 'xai/grok-4-1-fast',
      keyEnv: 'WIRO_API_KEY',
      label: 'wiro-grok-4-1-fast',
      // D-114: grok streams no reasoning deltas without this flag, which left
      // the chat trace permanently on "Starting…". Probed live 2026-09-13.
      reasoningLow: true,
      baseURLEnv: WIRO_ENV,
    },
    {
      baseURL: WIRO_DEFAULT_BASE_URL,
      model: 'glm/5-2',
      keyEnv: 'WIRO_API_KEY',
      label: 'wiro-glm-5-2',
      reasoningLow: true,
      baseURLEnv: WIRO_ENV,
    },
    {
      baseURL: OPENROUTER_BASE_URL,
      model: 'z-ai/glm-5.3-flash',
      keyEnv: 'OPENROUTER_API_KEY',
      label: 'openrouter-glm-5.3-flash',
      reasoningLow: true,
    },
  ],
};
