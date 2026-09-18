// Package entry for @corvus/gateway. This is the ONLY surface a consumer of
// the package resolves (package.json "exports" points at dist/index.js); a
// consumer never imports './gateway.js' directly, so the whole public type
// surface must be re-exported here (KI-022).
//
// Status vocabulary (two surfaces, deliberate): BotStatus is the fine-grained
// lifecycle machine, LegacyBotStatus is the retained coarse surface kept for
// pre-existing callers. They diverge after removeBot()/shutdown() BY DESIGN —
// see the status()/getStatus() contract on the Gateway interface in
// gateway.ts. Shutdown-throw semantics are documented once, on
// Gateway.shutdown in the same file, and referenced by start.ts.
export { createGateway, sanitizeReason, errorToReason } from './gateway.js';
export type {
  BotConfig,
  BotStatus,
  LegacyBotStatus,
  Gateway,
  GatewayClient,
  GatewayClientFactory,
  GatewayLogger,
  GatewayOptions,
  GatewayStore,
  LifecycleEvent,
  LifecycleEventName,
  LifecycleListener,
  LogRecord,
  StartAllFailure,
  StartAllResult,
} from './gateway.js';
