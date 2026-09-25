# Task Report: F16-detection-fix

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/lib/demo/brain.ts
- MODIFIED: apps/web/lib/demo/brain.test.ts

Untouched (verified by `ls apps/web/lib/demo/` after probe deletion): `apps/web/app/api/demo/message/route.ts`, `apps/web/app/demo/page.tsx`. The temporary real-path probe (`lib/demo/f16detect-probe.test.ts`) was written, run green, then deleted — only `brain.ts` and `brain.test.ts` remain.

## Dependencies Added
None. No manifest edited, no install run.

## Assumptions Made
- **No web research needed.** This fix is pure local logic (regex + word-count rule); no versions, APIs, or current facts are involved.
- **OSS-first: no new library.** The fix narrows one regex and adds a counted-match rule with the existing `RegExp` — a dependency would add supply-chain surface for zero gain.
- **Pinned case updated to encode the new behavior (old behavior explicitly replaced):** `brain.test.ts` `detects Turkish from an accented letter alone` previously used `örnek bir şey` (o-umlaut as the sole Turkish signal). Under the fix, o-umlaut/u-umlaut alone are not Turkish evidence, so that input now correctly replies English. The test now uses `ışık açık` (dotless-ı + c-cedilla, folds to `isik acik` with no stem/word hit) as the diacritic-alone control, and the `never returns the English copy` pair list was updated the same way. This is the one existing case that encoded the old behavior.
- **`nedir`/`yok`/`hangi`-alone now reply English.** Per the brief, the word-list path requires a stem/diacritic hit OR at least two whole-word hits, so any single word-list hit alone (including longer entries like `nedir`) stays English. No existing test relied on a lone word-list hit.

## Open Questions for Orchestrator
- **D-004 (product, not technical).** Unchanged from the F16 reviewer finding (F3): `Docs/DECISIONS.md` still records D-004 as English-only with `Superseded by: none`. This fix only narrows *when* Turkish fires; it does not resolve the decision-log contradiction. Founder call only.
- **Wave-level `tsc` is red on other waves' files.** Full-tree `tsc --noEmit` fails only in files outside this scope (`app/api/builder/verdict/*`, `app/dashboard/new/*`, `lib/chat/thread*` — missing `lib/verdict/bounds` module, missing `stitchBrief`/`BRIEF_MAX_CHARS` exports). Zero errors mention `lib/demo`. Needs an owner before the wave closes; not fixable in this scope per SCOPE GUARD.

## Public Interface Exposed
Unchanged in shape — no consumer needs to change:

```ts
export interface DemoBrain {
  reply(text: string): Promise<string>;
}
export const scriptedBrain: DemoBrain;
```

`route.ts` line 84 still compiles against this interface untouched. Response shape `{ reply }` and the 20/hour limit are unchanged.

## Known Limitations
- o-umlaut/u-umlaut words that are genuinely Turkish (e.g. `örnek`, `ücret` bare) still route Turkish via the `ucret` stem or a second signal — but a hypothetical Turkish sentence whose *only* signal is ö/ü with no stem and fewer than two word hits now stays English. Accepted trade-off per the brief: ö/ü overlap German too much to count alone.
- Single word-list hits (`nedir`, `yok`, `hangi` alone) stay English by design; a real one-word Turkish question falls to the English fallback (same harmless sentence as before, in English).

## What Changed (maps to acceptance criteria)
1. **Detection uses only Turkish-specific letters** (`brain.ts:56`): `TURKISH_LETTERS` is now `/[çğışÇĞİŞ]/` — ö/ü/Ö/Ü dropped from detection. `toFold` is untouched, so `ücret`/`örnek`/`Motörhead` still fold correctly for matching.
2. **Weak-signal rule** (`isTurkishQuestion`, `brain.ts`): diacritic OR stem hit returns Turkish immediately; otherwise the whole-word regex (unchanged) must match **at least twice** (`(hits?.length ?? 0) >= 2`). Lone `var`/`ne`/`mi`/`mu`/`kac` stay English; `hangi bot var` (pair) and `sablon var mi` (stem + pair) stay Turkish.
3. **New pinned negative controls** (`brain.test.ts`): `keeps accented non-Turkish English in English` (`über templates` → English template, `Zürich trials cost` → English pricing, `Motörhead templates` → English template) and `keeps bare short ASCII words in English` (`var`, `const vs var`, `what does var do`, `ne`, `ne plus ultra`, `mi casa`, `mu`, `mu meson`, `kac` → English fallback). Plus a positive pin that two ASCII word hits without stem/diacritic (`hangi bot var`) stay Turkish.
4. **All existing Turkish cases stay Turkish** — full suite green (see Verification); the single exception is the deliberate `örnek bir şey` update listed under Assumptions.

## Verification

**Focused green (all re-run after the fix):**

| Gate | Command (cwd `apps/web`) | Result |
|---|---|---|
| Focused tests | `npx vitest run lib/demo/brain.test.ts app/api/demo/message/message.test.ts app/demo/page.test.tsx` | **3 files, 59 passed** (brain 39, route 14, page 6) |
| Typecheck (F16 files) | `npx tsc --noEmit` filtered to `lib/demo` | **0 errors**; tree-level errors only in other waves' files (see Open Questions) |
| Lint | `npx eslint lib/demo/brain.ts lib/demo/brain.test.ts --max-warnings 0` | exit 0 |
| Format | `npx prettier --check` on both files | "All matched files use Prettier code style!" |

**Real path exercised, not just the unit.** A temporary probe drove the actual `POST` handler in `app/api/demo/message/route.ts` (real umlaut characters, written/run/deleted — not committed): `über templates`, `Zürich trials cost`, `Motörhead templates`, bare `var`, `const vs var` → all 200, English reply, `Object.keys === ['reply']`; `fiyat nedir`, `hangi şablonlar var`, `merhaba` → all 200, Turkish reply. 8/8 passed. (First probe draft asserted Turkish replies contain `[çğış]` — the instrument was wrong, not the code: `TR_PRICING_REPLY` contains `ü`, which the narrowed class excludes. Fixed the assertion to match Turkish reply identity instead; lesson recorded per `LESSONS.md` §1.1.)
