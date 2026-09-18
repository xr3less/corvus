// Self-healing supervised runtime (V1-9).
//
// The gateway already owns a per-bot error boundary and a quarantine() that
// disconnects exactly one bot. This module is the missing policy layer: it
// watches each bot's consecutive crashes in a sliding window, schedules an
// exponential-backoff restart for a bot that is merely flapping, and — only
// once a bot crosses the crash-loop threshold — hands it to the gateway's
// existing quarantine() plus one append-only audit row.
//
// Design notes:
// - Per-bot state only. Nothing here iterates siblings, so a crash loop on one
//   bot can never touch another (the multiplexed guarantee).
// - The supervisor NEVER disconnects clients itself; it calls the injected
//   quarantine() (the gateway's own). This keeps one owner for teardown.
// - User-facing reason strings are always the plain-language constant below.
//   Technical error text goes to logs/audit only, sanitized by the gateway's
//   errorToReason before it reaches us, and a stack trace never does.
// - Clock, random and the restart scheduler are injected so the crash window
//   and the backoff sequence are deterministic under test.
// - No untrusted-code execution primitives: no eval / new Function / vm /
//   dynamic import / child_process (TRIGGER-SANDBOX-1).

import type { NewAuditEvent } from '../db/audit-events.js';
import {
  computeBackoffDelay,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  type BackoffOptions,
} from './retry.js';

export const DEFAULT_CRASH_THRESHOLD = 5;
export const DEFAULT_WINDOW_MS = 5 * 60_000;

// The only string that may ever reach a user. Plain language, no error name,
// no stack, no code.
export const QUARANTINE_USER_REASON =
  'I hit a repeated error and paused this bot so the others keep running';

export interface SupervisorLogRecord {
  level: 'info' | 'error';
  event: string;
  botId: string;
  reason?: string;
}

export interface SupervisorLogger {
  info(record: SupervisorLogRecord): void;
  error(record: SupervisorLogRecord): void;
}

export interface SupervisorPolicy extends BackoffOptions {
  /** Consecutive crashes within the window that trip quarantine. */
  crashThreshold: number;
  /** Sliding window, in milliseconds. */
  windowMs: number;
}

/** Cancels a previously scheduled restart. Idempotent by convention. */
export type CancelHandle = () => void;

export interface SupervisorDeps {
  logger: SupervisorLogger;
  /** Quarantines through the gateway's existing quarantine(). */
  quarantine(botId: string, reason: string): Promise<void> | void;
  /** Append-only audit writer (audit_events). Injected so this module is DB-free. */
  audit(event: NewAuditEvent): Promise<void> | void;
  /** Optional automatic restart; when present, a sub-threshold crash schedules it. */
  restart?(botId: string): Promise<void> | void;
  policy?: Partial<SupervisorPolicy>;
  clock?(): number;
  random?(): number;
  scheduleRestart?(task: () => void, delayMs: number): CancelHandle;
}

export type CrashOutcome =
  | { action: 'retry'; attempt: number; delayMs: number }
  | { action: 'quarantined'; crashes: number }
  | { action: 'ignored' };

export interface Supervisor {
  /** Marks a bot as tracked; a later addBot of the same id re-arms it. */
  registerBot(botId: string): void;
  /** Drops per-bot state (removeBot/shutdown). A late crash is then ignored. */
  forget(botId: string): void;
  /**
   * Re-arms a quarantined bot after a successful external recovery (a
   * gateway.relogin). Clears the quarantine flag without resetting the crash
   * window, so a live bot is supervised again instead of silently ignored.
   * No-op when the bot is not quarantined.
   */
  clearQuarantine(botId: string): void;
  /** Records one crash and decides: retry with backoff, or quarantine. */
  handleCrash(botId: string, reason: string): Promise<CrashOutcome>;
  /** A successful tick clears the consecutive-crash counter. */
  handleHealthy(botId: string): void;
  /** Immediate quarantine (e.g. a failed startup) with the plain user reason. */
  quarantineBot(botId: string, reason: string): Promise<void>;
  consecutiveCrashes(botId: string): number;
  isQuarantined(botId: string): boolean;
  nextBackoffMs(botId: string): number | null;
}

interface BotState {
  crashes: number[];
  quarantined: boolean;
  timer: CancelHandle | null;
}

export function createSupervisor(deps: SupervisorDeps): Supervisor {
  const crashThreshold = deps.policy?.crashThreshold ?? DEFAULT_CRASH_THRESHOLD;
  const windowMs = deps.policy?.windowMs ?? DEFAULT_WINDOW_MS;
  const backoff: BackoffOptions = {
    baseDelayMs: deps.policy?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    maxDelayMs: deps.policy?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    jitterRatio: deps.policy?.jitterRatio ?? 0,
  };
  const clock = deps.clock ?? (() => Date.now());
  const random = deps.random ?? Math.random;
  const scheduleRestart =
    deps.scheduleRestart ??
    ((task: () => void, delayMs: number): CancelHandle => {
      const handle = setTimeout(task, delayMs);
      return () => clearTimeout(handle);
    });

  const states = new Map<string, BotState>();
  // Bots that were explicitly removed. A late error from their old client must
  // not resurrect supervision, but a later re-add clears the flag.
  const forgotten = new Set<string>();

  function stateFor(botId: string): BotState {
    const existing = states.get(botId);
    if (existing !== undefined) {
      return existing;
    }
    const created: BotState = { crashes: [], quarantined: false, timer: null };
    states.set(botId, created);
    return created;
  }

  function recentCrashes(state: BotState, now: number): number[] {
    return state.crashes.filter((timestamp) => now - timestamp < windowMs);
  }

  function cancelTimer(state: BotState): void {
    if (state.timer !== null) {
      state.timer();
      state.timer = null;
    }
  }

  function registerBot(botId: string): void {
    forgotten.delete(botId);
    stateFor(botId);
  }

  function forget(botId: string): void {
    const state = states.get(botId);
    if (state !== undefined) {
      cancelTimer(state);
      states.delete(botId);
    }
    forgotten.add(botId);
  }

  function handleHealthy(botId: string): void {
    const state = states.get(botId);
    if (state === undefined) {
      return;
    }
    cancelTimer(state);
    state.crashes = [];
  }

  async function quarantineNow(
    botId: string,
    detail: { reason: string; crashes: number },
  ): Promise<void> {
    const state = states.get(botId);
    if (state === undefined || state.quarantined) {
      return;
    }
    state.quarantined = true;
    cancelTimer(state);
    state.crashes = [];
    try {
      await deps.quarantine(botId, QUARANTINE_USER_REASON);
    } finally {
      // The audit row is written even if the quarantine call throws — the
      // decision to quarantine is the fact worth recording.
      await deps.audit({
        botId,
        actor: 'system',
        action: 'quarantine',
        detail: { ...detail, windowMs },
      });
    }
  }

  async function quarantineBot(botId: string, reason: string): Promise<void> {
    deps.logger.error({
      level: 'error',
      event: 'bot-quarantine-requested',
      botId,
      reason,
    });
    await quarantineNow(botId, { reason: 'explicit', crashes: 0 });
  }

  async function attemptRestart(botId: string): Promise<void> {
    const state = states.get(botId);
    if (state === undefined || state.quarantined || deps.restart === undefined) {
      return;
    }
    state.timer = null;
    try {
      await deps.restart(botId);
    } catch {
      // A restart that fails is another crash. Only a fixed code is recorded:
      // restart errors are third-party text and never reach a user surface.
      await handleCrash(botId, 'restart-failed');
      return;
    }
    handleHealthy(botId);
  }

  async function handleCrash(botId: string, reason: string): Promise<CrashOutcome> {
    if (forgotten.has(botId)) {
      return { action: 'ignored' };
    }
    const state = stateFor(botId);
    if (state.quarantined) {
      return { action: 'ignored' };
    }
    const now = clock();
    state.crashes = recentCrashes(state, now);
    state.crashes.push(now);
    const crashes = state.crashes.length;
    if (crashes >= crashThreshold) {
      await quarantineNow(botId, { reason: 'crash_loop', crashes });
      return { action: 'quarantined', crashes };
    }
    const delayMs = computeBackoffDelay(crashes, backoff, random);
    deps.logger.error({
      level: 'error',
      event: 'bot-crash',
      botId,
      reason: `${reason} | retry in ${delayMs}ms (attempt ${crashes})`,
    });
    if (deps.restart !== undefined) {
      cancelTimer(state);
      state.timer = scheduleRestart(() => {
        void attemptRestart(botId);
      }, delayMs);
    }
    return { action: 'retry', attempt: crashes, delayMs };
  }

  function consecutiveCrashes(botId: string): number {
    const state = states.get(botId);
    if (state === undefined) {
      return 0;
    }
    state.crashes = recentCrashes(state, clock());
    return state.crashes.length;
  }

  function isQuarantined(botId: string): boolean {
    return states.get(botId)?.quarantined ?? false;
  }

  function clearQuarantine(botId: string): void {
    const state = states.get(botId);
    if (state === undefined || !state.quarantined) {
      return;
    }
    state.quarantined = false;
    deps.logger.info({ level: 'info', event: 'bot-quarantine-cleared', botId });
  }

  function nextBackoffMs(botId: string): number | null {
    const state = states.get(botId);
    if (state === undefined || state.quarantined) {
      return null;
    }
    state.crashes = recentCrashes(state, clock());
    return computeBackoffDelay(state.crashes.length + 1, backoff, random);
  }

  return {
    registerBot,
    forget,
    clearQuarantine,
    handleCrash,
    handleHealthy,
    quarantineBot,
    consecutiveCrashes,
    isQuarantined,
    nextBackoffMs,
  };
}
