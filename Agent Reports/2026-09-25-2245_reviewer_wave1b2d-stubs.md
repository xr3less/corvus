# Review: reviewer-wave1b2d-stubs

## Verdict

PASS

## 1. Works (exact commands, exact exits)

All run by reviewer on disk, 2026-09-25 ~22:41-22:42 UTC:

- `cd apps/web && npx vitest run "app/dashboard/new/page.test.tsx" "app/dashboard/bots/[id]/page.test.tsx" "app/gallery/[slug]/page.test.tsx"` → `Test Files 3 passed (3) / Tests 128 passed (128)`, exit 0. Per-file reruns: new 58/58, detail 59/59, gallery 11/11 (58+59+11=128, matches the task's expected total).
- NOTE (instrument check, LESSONS §1): the same three paths run from the repo root fail with `Cannot find package '@/lib/bots'` / `@/components/ui/dashboard-rail` (3 failed, no tests) — an alias-resolution artifact of the wrong cwd, not a code defect. SPEC §5 mandates vitest inside the owning workspace; the apps/web invocation is the correct one.
- `npm run typecheck --workspace @corvus/web` from repo root → `tsc --noEmit`, exit 0.
- `npx eslint "apps/web/app/dashboard/new/page.test.tsx" "apps/web/app/dashboard/bots/[id]/page.test.tsx" "apps/web/app/gallery/[slug]/page.test.tsx" --max-warnings 0` from repo root → clean, exit 0.

## 2. Scope purity

`git diff --name-only` lists 15 files, of which exactly the 3 claimed test files belong to this wave. The remaining product-file modifications (thread.ts, use-chat-stream.ts, dashboard-rail.tsx, builder route.ts, globals.css, etc.) are pre-existing parallel-wave work — distinguished by content, not assumption:

- `git diff -- apps/web/lib/chat/thread.ts` hunk header reads `Persistence wiring (wave1b2a)` — a different wave's marker.
- `git diff` over all six product/css files greps 0 occurrences of `conversationStub|wave1b2d` — none of this wave's stub content leaked into any product file.
- `git diff --name-only -- package.json pnpm-lock.yaml package-lock.yaml apps/web/package.json` → empty. No manifest touched.

## 3. No vacuous assertions (quoted lines, one per file)

- new `second turn carries the completed first turn as history` (page.test.tsx:652-655): `await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));` then `expect(JSON.parse(String(secondInit.body))).toEqual({ botId: '...1111', message: 'Second question', history: [{ role: 'user', content: 'First question' }, { role: 'assistant', content: 'First answer.' }] });` — still fails if history is dropped or botId regresses.
- detail `second turn carries...` (page.test.tsx:443-455): `expect(chatCalls).toHaveLength(2);` + `expect(JSON.parse(...openCall body...)).toEqual({ botId: null });` + second-body history equality — botId coercion and history both pinned; URL-routed stub only re-slots the fetch queue, it does not bypass these pins.
- gallery `never fetches a malformed slug` (page.test.tsx:153-156): `expect(fetchStub.mock.calls.filter((call) => String(call[0]).startsWith('/api/templates/'))).toHaveLength(0);` + `expect(fetchStub.mock.calls.some((call) => String(call[0]).includes('BAD'))).toBe(false);` — template-scope is the test's stated intent; the stub throws `must not fetch template` on any non-conversations URL, so a template fetch would error, not pass silently. The M-9 `'Build failed'` → `'Build failed with error'` change matches `run-timeline.tsx:178` byte-exact (Testing Library exact-match semantics required it); the old string could never match, so this is a fix, not a weakening.

## 4. Freeze

- `VERDICT_HINT` byte-identical at new page.test.tsx:36-37 (`'Kurulum için onay gerekiyor — kısaca "evet" yaz ya da değiştirmek istediğin yeri yaz.'`); `git diff` over the new test file shows zero added/removed lines containing `VERDICT_HINT|Kurulum için onay|Botun bugün|Her değişiklik kredi` — no Turkish product copy altered.
- No `TURNS_MAX|boundedView|singletonKey` in any of the three test files — frozen motor untouched.
- Frozen product files (verdict/route.ts, start/route.ts, bounds.ts, persona-prompt.ts) carry no wave1b2d hunks (see §2 grep).

## 5. Quality

- No `any`: grep for `: any|<any>|as any` across all three files → no matches (exit 1). The only `any` substring hits are English words ("any assistant turn", "any color", "any bot status", "any request URL").
- No secrets: grep for `sk-|api_key|API_KEY|secret` → only a code comment about wording; nothing committed, printed, or embedded.
- No new dependencies, no manifest touched, no `pnpm-*` files. Read-only review: nothing modified, no git restore/stash/checkout/reset run.
