// Package-entry tests (KI-022). A consumer importing '@corvus/gateway' only
// ever resolves './index.js' — never './gateway.js' — so every public runtime
// export and every public status/lifecycle type must be reachable from here.
//
// Reproduce-first note: the type imports below are the reproduction. Before
// LegacyBotStatus / LifecycleEvent / LifecycleEventName / LifecycleListener /
// StartAllFailure / StartAllResult were re-exported from index.ts, `tsc --noEmit`
// rejected this file with TS2305 ("Module './index.js' has no exported member
// ..."), which is the KI-022 symptom. The runtime assertions keep every binding
// live so the same test also fails loudly if a value export is dropped later.
import { describe, expect, it } from 'vitest';
import { createGateway, errorToReason, sanitizeReason } from './index.js';
import type {
  BotStatus,
  LegacyBotStatus,
  LifecycleEvent,
  LifecycleEventName,
  LifecycleListener,
  StartAllFailure,
  StartAllResult,
} from './index.js';

describe('package entry', () => {
  it('re-exports the runtime gateway surface', () => {
    expect(typeof createGateway).toBe('function');
    expect(typeof sanitizeReason).toBe('function');
    expect(typeof errorToReason).toBe('function');
  });

  it('exposes the status, lifecycle and startAll types from the entry point', () => {
    // BotStatus must be the fine-grained machine ('destroyed' is not part of
    // the legacy vocabulary) and LegacyBotStatus the retained coarse surface.
    const fine: BotStatus = 'destroyed';
    const legacy: LegacyBotStatus = 'unknown';
    const eventName: LifecycleEventName = 'ready';
    const event: LifecycleEvent = { botId: 'bot-a', event: eventName };
    const failure: StartAllFailure = { id: 'bot-a', reason: 'load_failed' };
    const result: StartAllResult = { started: ['bot-a'], failed: [failure] };
    const receivedBotIds: string[] = [];
    const listener: LifecycleListener = (received) => {
      receivedBotIds.push(received.botId);
    };
    listener(event);

    expect([fine, legacy, event.event, result.failed[0]?.id]).toEqual([
      'destroyed',
      'unknown',
      'ready',
      'bot-a',
    ]);
    expect(receivedBotIds).toEqual(['bot-a']);
  });
});
