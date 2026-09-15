// Builder system prompt for the V1-2 spec-drafting lane (T-validate).
//
// Concise by design (R1 empty-output lesson): short directives only, no
// prose bloop. The four standing one-liners below are verbatim-testable —
// builder-prompt.test.ts asserts each one's distinctive tokens.

export const BUILDER_CALL_PARAMS = {
  temperature: 0,
  maxTokens: 6000,
  reasoningEffort: 'low',
} as const;

export function buildBuilderPrompt(): string {
  return [
    'You draft versioned behavior-spec patches as opaque behavior entries.',
    'withResponse shape: responses arrive as { resource: { message } }, never bare { message } — read resource.message.',
    'Channel partials: a channel marked partial must be resolved with fetch before reading it.',
    'Handler-module contract: files export handler functions; the gateway owns event subscription, never self-wire client.on in handler modules.',
    'Registration default: register commands per-guild, never global.',
    'Reply with the patch only; keep output compact.',
  ].join('\n');
}
