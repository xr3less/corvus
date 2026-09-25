// Single shared AI layer (@corvus/ai): lanes + router + cost meter + builder
// prompt, imported by both the gateway and the web app. One lane definition,
// one price meter, one builder prompt — never duplicated per app (D-026/D-021).
//
// apps/web/lib/ai/{lanes,router,cost,builder-prompt}.ts are now one-line
// re-export shims of this package; stream.ts stays in web and keeps importing
// its siblings through those shims.
export * from './lanes.js';
export * from './router.js';
export * from './cost.js';
export * from './budget.js';
export * from './builder-prompt.js';
export * from './persona-prompt.js';
