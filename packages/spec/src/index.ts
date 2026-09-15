import { z } from 'zod';

// Version of the behavior-spec contract. Gateway and web MUST agree on this
// value; bumping it is a cross-package breaking change (see SPEC §4).
export const SPEC_VERSION = 1 as const;

// V1-8 shape: behaviors are intentionally opaque. The gateway loads them
// without interpretation; the web editor + interpretation grow in V1-2.
// z.unknown() entries are accepted AND preserved verbatim (never stripped).
export const BehaviorSpecV0Schema = z.object({
  version: z.literal(1),
  behaviors: z.array(z.unknown()).default([]),
});

export type BehaviorSpecV0 = z.infer<typeof BehaviorSpecV0Schema>;

// Boundary validator: throws ZodError on invalid input, never returns partial.
export function parseSpec(input: unknown): BehaviorSpecV0 {
  return BehaviorSpecV0Schema.parse(input);
}

// Fresh versioned draft: the only sanctioned way to mint an empty spec.
export function createDraft(): BehaviorSpecV0 {
  return { version: SPEC_VERSION, behaviors: [] };
}

export * from './simulate.js';
export * from './explain.js';
