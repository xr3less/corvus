# Reviewer Report: review-F16

## Status
**FAIL** — two blocking findings. The build works and every gate the agent named reproduces, but the
language router answers English visitors in Turkish on a natural, cheap-to-trigger input class, the
test that is supposed to catch that class does not, and the report presents it as closed. A one-way
founder decision (D-004) is also reversed in shipped behaviour with no superseding entry.

- Reviewer: independent (`review-F16`), did not write the code.
- Tree: merged working tree, `master` @ `d9cf8d7`, reviewed 2026-09-24 02:13.
- Artifacts under review: `apps/web/lib/demo/brain.ts`,
  `apps/web/lib/demo/brain.test.ts`, report
  `Agent Reports/2026-09-24-0301_F16_MODIFY_demo-turkish.md`.
- md5 at review time: brain.ts `950a50c8da74415dfddd3e8bbc5da74e`,
  brain.test.ts `40d7d0efd4958b4d66f5f8fe848b04af`.
- No edits were made by this reviewer. No git restore/commit/push/deploy/migrate/secrets.

---

## F1 (BLOCKING) — an English question containing one non-Turkish accented letter gets a *fact-bearing* Turkish reply

`brain.ts:55` treats any of `[çğıöşüÇĞİÖŞÜ]` as proof of Turkish, at `brain.ts:110`. That alphabet
overlaps German/French/Spanish orthography (`ö`, `ü`, `ç`, `ı`, `ş` all appear in Western European
and loanword spellings), and once the Turkish table is selected the *English* triggers are still
matched against the folded text (`brain.ts:121-132`), so the visitor receives the Turkish **pricing
or template answer**, not the soft fallback.

Evidence — real `scriptedBrain.reply()`, 8-case probe, results written to file (not grep):

| Input (English, accented) | Reply language | Reply |
|---|---|---|
| `über templates` | **Turkish** | `v1'de 8 şablon var: welcome, …` |
| `Zürich trials cost` | **Turkish** | `Pro $10/ay, Studio $29/ay. Deneme 3 gün, 1 bot, 100 kredi, kart gerekmez` |
| `Motörhead templates` | **Turkish** | `v1'de 8 şablon var: …` |
| `café pricing` | English | (ASCII `é` folds to `e`, so it happens to be safe) |
| pure-ASCII control `what is the price` | English | correct |

The `Zürich trials cost` row is the worst of the three: prices and trial caps are read in the wrong
language by the wrong audience — and D-004's own premise (see F3) is that the audience is English.

Second, narrower instance of the same class — bare ASCII markers flip the fallback to Turkish:
`var`, `const vs var`, `what does var do`, `ne`, `mi`, `mu`, `kac`, `ne plus ultra`, `mi casa`,
`mu meson` all return `Ben senaryolu bir önizlemeyim …`. Most are harmless (the fallback says the
same thing as the English fallback), but `var` is plain English technical vocabulary and lands
without any accent at all.

**The guard that should have caught this has teeth but a blind spot.** I independently proved the
whole-word guard is not vacuous: a naive substring rule signals Turkish for all three controls the
test names (`minimum`, `one`, `various`), and the shipped code does not — so `brain.ts:94` genuinely
does the job it claims. But `brain.test.ts:203-213` pins only those three **ASCII** words, and the
18-sentence sweep at `brain.test.ts:215-251` is pure ASCII by construction. Neither exercises the
diacritic rule introduced by this change, and `var` is missing from the marker test even though the
test's own comment reasons about `various` being unsafe. `brain.test.ts:246` re-declares the same
`[çğıöşüÇĞİÖŞÜ]` regex as its detector, so the sweep can only ever agree with the implementation on
this class — it cannot see accented non-Turkish text as a false positive, because by definition the
implementation and the test use the same wrong definition of "Turkish".

**Report accuracy.** The agent's summary and its `Known Limitations` disclose the *opposite*
direction ("Unlisted Turkish with no diacritic stays English") and present the marker work as what
keeps English English. It never mentions that a single `ö`/`ü` flips an English question, and its
test title `no ordinary English question flips to Turkish` (`brain.test.ts:215`) is true only of its
own ASCII sample. This is the "instruction/report is the defect site" pattern: the green test reads
as a closed guarantee and is not one.

**Fix direction (for the fix agent, not written here).** Detection evidence should be letters that
are Turkish-*specific* rather than letters absent from English: `ç ğ ı ş` plus the genuinely
Turkish uppercase `Ç Ğ İ Ş`, dropping `ö`/`ü` from the detection set (they stay in `toFold` for
matching, so `'ücret'`, `'örnek'`, `'Motörhead'` still fold correctly). Every Turkish case in the
current suite survives that restriction; `über`, `Zürich`, `Motörhead` stop flipping. Also decide
explicitly about bare `var`/`ne`/`mi`/`mu`/`kac`, and add an accented-English negative-control test
that fails today.

---

## F2 (BLOCKING) — the 22-failure attribution is corroborated, but the count moved again; and the tree's only `tsc` error is another wave's untracked file

The agent's claim that the failures are not its own holds up under independent measurement:

- Importers of `lib/demo/brain` are exactly two, both green: `app/api/demo/message/route.ts:2` and
  `app/api/demo/message/message.test.ts`. No failing file imports it.
- My full run (02:03–02:05): **14 test files failed, 15 tests failed / 968 passed / 983 total**.
  `suite-final.log` (20:29) shows a *different* set — `app/page.test.tsx` with 2 failures, 907
  total, 1 failed file. The set and the total moved between the agent's run, that log and mine,
  which matches the agent's own observation of a concurrent writer and is not attributable to F16.
  Failure causes are foreign: Postgres-double fork (`app/api/templates`), live-binding/pause banner
  (`app/dashboard/bots`), DOM-role lookups.
- `tsc --noEmit` on the merged tree fails with exactly one error:
  `proxy.test.ts(33,10): error TS2305: Module '"next/dist/build/analysis/get-page-static-info.js" has no exported member 'getMiddlewareMatchers'`.
  `apps/web/proxy.test.ts` and `apps/web/proxy.ts` are untracked, mtime 02:04 / 02:07 — **after**
  brain.ts (01:56) / brain.test.ts (01:58). Zero errors mention `lib/demo`. So the "real typecheck
  zero warnings" step of my brief **cannot pass on this tree**, and it is not F16's fault; it needs
  an owner before the wave closes (`probe`/`proxy` wave). I did not touch it.

This finding is recorded as a wave-level gate failure, not as an F16 defect.

---

## F3 (BLOCKING, product) — D-004 is reversed in shipped behaviour and the decision log still says "Superseded by: none"

Confirmed on disk:

- `Docs/DECISIONS.md:118` — `### D-004 — Product language is English-only (no Turkish)`
- `Docs/DECISIONS.md:121` — door type: **one-way (irreversible — founder-approved)**
- `Docs/DECISIONS.md:132` — decision text: *"English-only product, docs, marketing, and support. No
  Turkish UI or docs until validated demand says otherwise."*
- `Docs/DECISIONS.md:138` — `**Superseded by:** none`
- No later entry supersedes it. The only later Turkish mention anywhere in DECISIONS is
  `D-146`'s **Result** line (2026-09-21, persona answered in Turkish on local dev) — a verification
  transcript, not a language decision.

F16 makes the public demo — a product surface, exempt from nothing — reply in Turkish by default to
any accented input. That is exactly what the agent escalated and correctly refused to close itself.
It stays open: only the founder can add a superseding entry, and per the decision file's own
append-only rule the old entry must not be edited. **This alone is not why the verdict is FAIL** —
the agent handled it correctly — but it must be closed before this wave is called done, which is
why it is recorded here rather than in the agent's file alone.

---

## Gates that reproduce (all independently re-run by me)

| Gate | Command | Result |
|---|---|---|
| Focused tests | `npx vitest run lib/demo/brain.test.ts app/api/demo/message/message.test.ts app/demo/page.test.tsx --reporter=json` | **56/56 pass** — brain 36, route 14, page 6 (JSON-report counts, not terminal grep) |
| Lint | `npx eslint lib/demo/brain.ts lib/demo/brain.test.ts --max-warnings 0` | exit 0, no output |
| Format | `npx prettier --check` (same two files) | "All matched files use Prettier code style!" |
| Typecheck (F16 files) | `npx tsc --noEmit` filtered to `lib/demo` | **0 errors**; tree-level error in untracked `proxy.test.ts:33` only (F2) |
| Report on disk | `ls "Agent Reports/2026-09-24-0301_F16_MODIFY_demo-turkish.md"` | exists, 7,410 B, content matches the summary |

**Real path exercised, by me, through the actual `POST` handler** (`f16-review-probe.test.ts`,
written to disk, run, deleted — resolved `route.ts` directly, not the unit):

1. `fiyat nedir` → 200, Turkish pricing reply, `Object.keys === ['reply']` — pass
2. `what is the price` → 200, English pricing reply, `Object.keys === ['reply']` — pass
3. English controls (`minimum`, `one`, `various`, `what templates exist`, `hi there`) → none reply in
   Turkish — pass
4. Contract: `''`→422, `42`→422, 21 requests on one IP → 20×200 then 429 with `Retry-After` — pass

Probe deleted; `apps/web/lib/demo/` contains only `brain.ts` and `brain.test.ts` at review end
(`ls` verified). No `scratch-probe*` file exists under `apps/web` — the probe residue the agent
mentioned (and `suite-final.log`, `.vitest/json/output.json`) sits elsewhere in the tree and is not
F16's.

## Scope and content checks

- `git status --porcelain -- apps/web/lib/demo apps/web/app/api/demo apps/web/app/demo` → exactly
  ` M brain.test.ts` / ` M brain.ts`. `route.ts` and `app/demo/page.tsx` untouched, as declared.
- English copy is byte-identical to `HEAD` except the pricing line, which changed from
  `Trials run 3 days, full Pro, no card` to `Trials run 3 days, 1 bot, 100 credits, no card` — that
  is the KI-033/F15 trial-cap correction, not an F16 change; it is pinned two-sided at
  `brain.test.ts:297-299`.
- Turkish facts are accurate: `$10/ay`, `$29/ay`, `3 gün`, `1 bot`, `100 kredi`, `kart gerekmez`
  match `apps/web/lib/auth/session.ts:102` (`TRIAL_GRANT_CREDITS = 100`), `session.ts:198`
  (`interval '3 days'`), `apps/web/lib/bots.ts:55` (`TRIAL_DEAL`).
- Gallery vocabulary: the eight names and order match `apps/gateway/src/db/seed-templates.ts` rows.
  Minor, pre-existing nit F16 inherited: `brain.test.ts:53` uses `'reaction roles'` where the seed's
  `LOCKED_CATEGORIES` uses `'reaction-roles'`, so the "duplication is the drift net" comment
  (`brain.test.ts:39-43`) overstates — the test can detect re-wording inside the reply but not a
  seed change, which is a deliberate trade-off the comment half-acknowledges.
- Voice/length: all five Turkish replies 72–147 chars (≤280), no `!`, no emoji, no secrets, no
  persistence calls — verified independently of the agent's own test assertions.

## What I could not verify

- The agent's "three guards deliberately broken and watched to fail" claim is self-reported and its
  artifacts were deleted (by design). I independently re-proved the *whole-word* guard's teeth (a
  naive substring rule signals all three controls; the shipped code does not) and read the Turkish
  provenance parser (`brain.test.ts:80-86`) — its anchors are load-bearing and the suite is green,
  so it is not vacuous. I did **not** re-break the language-routing or Turkish-provenance guards.
- The full-suite failure set is a moving target while another agent writes this tree; my 14-file /
  15-test figure is a snapshot at 02:03, not a stable baseline.

## Verdict
**FAIL.** Two defects block: the accented-English false positive reaches fact-bearing replies with
no guard that can see it and a report that reads as though it were closed (F1), and the wave's own
typecheck gate is red on a file F16 cannot fix (F2, needs an owner). F3 (D-004) is a founder
decision the agent correctly escalated and must not be silently resolved. Everything the agent
claimed about its own scope, contract and file set checks out — the failures are at the edges of
what it declared, not in the code it wrote.
