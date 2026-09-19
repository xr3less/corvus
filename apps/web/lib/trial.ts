// KI-033 trial clock predicate — runtime-agnostic, dependency-free.
//
// Lives in its own module so any runtime (the Next.js web app, a gateway-side
// follow-up, a script) can import the ONE definition of "expired" without
// pulling in `pg` or the whole session module. session.ts re-exports it, so
// consumers that already hold a session keep importing from there; this file is
// the definition site, session.ts is the door.
//
// Fail-open is deliberate and locked by the KI-033 SPEC: a null / undefined
// clock means "no clock was ever set" (a row that predates the 0010 migration
// whose backfill did not reach it, or a memory-store row that never carried
// one) and resolves to NOT expired. The alternative — treating an absent clock
// as expired — would lock out exactly the accounts the grandfathering rule
// exists to protect.
//
// An unparseable value (garbage string) is ALSO treated as not expired, for the
// same reason: a corrupt value must never become a lockout. `true` is returned
// only when the value parses AND lies at or before `now`.
export function isTrialExpired(
  account: { trial_ends_at?: Date | string | null } | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  const clock = account?.trial_ends_at ?? null;
  if (clock === null || clock === undefined || clock === '') {
    return false;
  }
  // pg hands back a Date for timestamptz; JSON and other paths hand back an ISO
  // string. Both are first-class here — no caller needs its own conversion.
  const endsMs = clock instanceof Date ? clock.getTime() : Date.parse(clock);
  if (!Number.isFinite(endsMs)) {
    return false;
  }
  const nowMs = now instanceof Date ? now.getTime() : now;
  return endsMs <= nowMs;
}
