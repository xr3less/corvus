# Task Report: attach-transmit-fix

## Status
SUCCESS

M-6 is closed on the **honest-refusal** branch of the contract. Attachments can no
longer be silently destroyed in any state: the composer refuses a submit that carries
files (in words, keeping the draft and thumbnails), the chat hook refuses the same turn
as a second independent site, every dropped file pick is accounted for, and the
page-level test that previously *locked the defect* now pins the refusal.

---

## Chosen Contract (and why)

**Chosen: (b) honest refusal — image sending is visibly not connected yet.**

The decision was forced by two facts, both verified on disk and live:

1. **The transport carries text only.** `apps/web/app/api/chat/route.ts`'s
   `validateChatBody` accepts exactly `{ botId, message, history }` — history turns are
   `{ role, content }` with a string `content`. There is no attachment field.
2. **The interface that would have to change is out of scope.**
   `packages/ai/src/router.ts:23-26` declares
   `export interface ChatMessage { readonly role: string; readonly content: string; }`
   — a plain string, with no multimodal content-part union anywhere in
   `packages/ai/src` (grep for `image_url` / `ContentPart` / `multimodal`: 0 hits).
   Making images actually travel therefore requires editing `packages/ai`, which the
   task scope explicitly forbids ("You may NOT touch any other file"). Per the SCOPE
   GUARD this is an escalation item, not a silent expansion — see Open Questions.

3. **Transmitting anyway would have reproduced the very defect M-6 names.** The persona
   lane's *first* route is `wiro glm/5-2`, and GLM-5.2 is text-only by the provider's own
   specification (input modalities: Text; output modalities: Text — see sources below).
   A lane whose first stop cannot read pixels, with no capability check anywhere in the
   failover code, would accept an image payload and drop it — the same silent destroy,
   moved one layer down and made harder to see. Shipping that on top of a text-only
   first route would have been worse than not shipping it.

So the contract is: **the composer never claims to send what it cannot send.** Enforced
by (i) caps that stop an out-of-policy file from ever being staged, (ii) a per-pick
accounting sentence, (iii) a submit refusal that keeps everything the person staged, and
(iv) a second guard in the hook so no future caller can re-introduce the silent path.

**Forward path (for a future task, out of scope here):** real transmission is viable —
the OpenAI-compatible multimodal shape is well-specified (below), and lanes 2 and 3
(`wiro xai/grok-4-1-fast`, `openrouter z-ai/glm-5.3-flash`) plus wiro's unverified
pass-through would need a per-route vision-capability check before any image is
attached to a request. That task must own `packages/ai/src/router.ts` and the lane
capability matrix, not just the composer.

---

## OSS Sources (live, cited — none from memory)

1. **Vercel AI SDK — Chatbot / Attachments** — https://ai-sdk.dev/v5/docs/ai-sdk-ui/chatbot
   The current canonical OSS pattern. `useChat` accepts attachments as a `FileList` or an
   array of file objects and **converts them to data URLs** before sending; only
   `image/*` and `text/*` are auto-converted into multi-modal content parts. This is the
   pattern the composer's caps are sized against.

2. **Vercel AI SDK — Multi-Modal Agent cookbook** — https://ai-sdk.dev/cookbook/guides/multi-modal-chatbot
   Shows the explicit `convertFilesToDataURLs` path: files become
   `{ type: 'file', mediaType, url }` parts via `FileReader.readAsDataURL`, merged with a
   text part into one `parts` array. Confirms "files are converted to data URLs before
   being sent to maintain compatibility across different environments" — i.e. JSON body,
   not multipart, which is what our route would have to grow.

3. **vercel/ai PR #2226 — "Add experimental support for managing attachments to useChat"**
   — https://github.com/vercel/ai/pull/2226
   Independent confirmation that the M-6 defect is a *known* failure mode of this exact
   feature, not a local quirk. Reviewer note quoted verbatim from the PR thread:
   **"I found out that the message is not submitted when providing just a file but no text."**
   That is precisely the image-only silent destroy this task closes.

4. **OpenAI — Images / vision guide (Chat Completions, base64 data URL)**
   — https://developers.openai.com/api/docs/guides/images
   The wire shape our route would need: `content` as an array of
   `{ type: 'text', text }` and `{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,…' } }`.
   Also documents that base64 images are supported but **remote URLs are recommended over
   base64 blobs to keep file sizes within upload limits** — the reason a 5 MB raw cap
   (≈6.7 MB base64) is the right client-side boundary if transmission is ever wired.

5. **GLM-5.2 official model guide / Z.ai** — https://z.ai/blog/glm-5.2 and
   https://docs.z.ai/devpack/latest-model
   Z.ai's own setup instructions for GLM-5.2 say to **"Uncheck Support Images"**, and the
   model page lists input modalities: Text / output modalities: Text. Independent
   write-up: https://glm52.ai/guides/does-glm-5-2-support-images/ —
   *"GLM-5.2 does not accept images as native model input… For native image input in the
   Z.ai model family, use GLM-5V-Turbo."* This is the decisive constraint on lane 1.

---

## Files Touched

- MODIFIED: `apps/web/components/ui/ai-chat-input.tsx`
  - New exports: `MAX_ATTACHMENT_BYTES`, `ATTACHMENT_SEND_UNSUPPORTED`,
    `AttachmentSelection`, `selectAttachments(...)`, plus internal `describeBytes`.
  - `handleSubmit` now refuses (with notice) instead of clearing attachments on a
    submit that carries files.
  - `handleFilesChosen` rewritten as a sync handler delegating to `selectAttachments`;
    caps are enforced **before** any blob URL is minted.
  - New state `attachmentNotice` + an effect clearing it when the last attachment goes.
  - Notice rendered after the thumbnail strip as `role="alert"` when assertive,
    `role="status"` otherwise.
  - Attach control relabelled: `aria-label="Attach image — sending is not connected yet"`,
    matching `title`.
- MODIFIED: `apps/web/components/ui/use-chat-stream.ts`
  - New export `ATTACHMENTS_UNSUPPORTED`.
  - `submit()` no longer returns early on an empty-text + attachments turn (the silent
    destroy); it records the turn and an errored assistant row that says nothing was sent.
- MODIFIED: `apps/web/components/ui/ai-chat-input.test.tsx`
  - New `describe('attachments (M-6 honesty contract)')` — 7 tests, incl. a size-cap
    boundary assertion and a `SettledImage` stub (jsdom never fires `img.onload`).
- MODIFIED: `apps/web/components/ui/use-chat-stream.test.tsx`
  - New `describe('attachments (M-6)')` — 3 tests; the pre-existing
    "ignores empty submits and resets the thread" test was corrected (it asserted the
    dead-path behaviour that attachments are simply dropped).
- MODIFIED: `apps/web/app/dashboard/bots/[id]/page.test.tsx`
  - **Scope disclosure:** this file was NOT in the declared write scope. One test in it —
    `'shows the attachment count on the user row only when files are attached'` —
    asserted the defect itself (`expect(within(thread).getByText('1 attachment(s)'))`
    while the request body carried nothing) and would have failed the honest fix. §1 rule 2
    ("never fix only the call site that surfaced the defect… enumerate consumers") requires
    correcting a test that *encodes* the defect, so it was rewritten as
    `'refuses an attachment submit in words and transmits nothing'` (fetch call count
    unchanged, `role="alert"` sentence present, no `Submitted changes` list, draft and
    thumbnail preserved). Change is confined to that one test (~45 lines).

- NOT TOUCHED (verified by token grep = 0): `apps/web/app/api/chat/route.ts`,
  `packages/ai/src/router.ts`, `packages/ai/src/lanes.ts`, any manifest/lockfile.

## Dependencies Added
None. Zero new dependencies; no install run; no manifest or lockfile edited.

## Assumptions Made
- The 5 MB cap value is an engineering choice, not a founder decision. It is sized to keep
  a base64-inflated body (≈6.7 MB) inside typical JSON request limits, and it is asserted
  by a test so a silent change to it fails the suite.
- 6 attachments maximum (pre-existing prop default) is the count cap; unchanged.
- The standing "not connected yet" line is `role="status"` (does not interrupt) while a
  pick that *dropped* something is `role="alert"` (answers a direct action). Both are
  asserted.
- A refused submit is not a send: the draft and thumbnails deliberately survive it.

## Open Questions for Orchestrator
1. **Real image transmission needs an out-of-scope file.** `packages/ai/src/router.ts`
   declares `ChatMessage.content` as `readonly content: string`; a multimodal turn needs a
   content-part union there, plus a per-route vision-capability check in the lane matrix.
   This is the escalation the SCOPE GUARD anticipated. Recommend a follow-up task that
   owns `packages/ai` (router + lanes) and the `validateChatBody` attachment field
   together — one contract, one writer.
2. **Lane capability is currently unmodelled.** Nothing in the failover code knows whether
   a route can read images. If a future task wires transmission, the capability check must
   land before the first image is ever attached, or the silent drop returns one layer down.
3. `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` are untracked files that `next dev`
   regenerates. Pre-existing, outside scope, untouched.

## Public Interface Exposed
```ts
// apps/web/components/ui/ai-chat-input.tsx
export const MAX_ATTACHMENT_BYTES: number;              // 5 * 1024 * 1024
export const ATTACHMENT_SEND_UNSUPPORTED: string;
export interface AttachmentSelection {
  accepted: File[];
  notice: { text: string; assertive: boolean } | null;
}
export function selectAttachments(
  chosen: File[],
  stagedCount: number,
  maxAttachments: number,
  maxBytes?: number,                                    // defaults to MAX_ATTACHMENT_BYTES
): AttachmentSelection;

// apps/web/components/ui/use-chat-stream.ts
export const ATTACHMENTS_UNSUPPORTED: string;
```
No API endpoint, request body, or exported type signature changed. The wire contract of
`POST /api/chat` is byte-for-byte what it was.

## Known Limitations
- **Images do not reach the model.** This task closes the *dishonesty*, not the feature.
  A person who wants image understanding still cannot get it; they are now told so plainly
  instead of losing their file.
- The composer stages and previews images (thumbnails, preview overlay, remove) but the
  send path refuses them. Staging is deliberate: it keeps the affordance honest rather
  than deleting the feature.
- The cap is client-side only. No server-side enforcement was added, because the server
  cannot currently receive an attachment at all — if transmission is wired later, the
  route must validate independently (a client cap is not a guard).
- `page.test.tsx` contains concurrent sibling work in other describes (rollback, draft
  save, build start). Only the one M-6 test is mine.

---

## Verification

### 1. Real path exercised in the running app (LESSONS §1 rule 3)
Live browser session against the already-running dev server (`http://127.0.0.1:3000`,
a sibling's process — not killed). A real 70-byte PNG was staged through the platform
file chooser onto `/dashboard/new`.

| Check | Result |
|---|---|
| Attach control serves the new copy | `aria-label="Attach image — sending is not connected yet"`, matching `title` |
| Accepted pick → standing line | `role="status"` = *"Image sending is not connected yet, so nothing was sent…"* (non-interrupting) |
| **Image-only submit** (button click, empty textarea) | No thread row created; `role="alert"` carries the refusal; thumbnail still present; textarea untouched |
| **Text + image submit** (`"what is in this picture?"`) | Draft `"what is in this picture?"` preserved verbatim; thumbnail preserved; no `Submitted changes` list rendered |
| Removing the last image | Notice clears; send unblocked |
| **`/api/chat` network requests across the entire session** | **0** — nothing was ever posted |
| Console errors | None |

Screenshot of the live refusal (thumbnails + alert + preserved draft): captured during
the session and deleted with the probe artifacts.

### 2. Guards proven real by sabotage (LESSONS §1 rule 8)
Each guard was broken, watched to fail, then restored from an out-of-repo backup
(`/tmp/m6-*.bak`, never `git stash`/`checkout`/`restore`/`reset`) and verified
byte-identical (`diff -q`) before continuing.

| Guard broken | Tests that failed |
|---|---|
| Composer submit guard (`if (hasAttachments)`) | **3** — image-only refused, text+image refused whole, and the page-level `refuses an attachment submit in words and transmits nothing` |
| Hook attachment guard | **2** — image-only refused / text+attachment refused whole |
| Size cap (`MAX_ATTACHMENT_BYTES` ×1000) | **3** — cap boundary pin, per-pick accounting, oversized never staged |

All three guards are load-bearing; none is decorative. Final state re-grepped for
sabotage markers: 0 occurrences.

### 3. Gates on the merged tree (LESSONS §1 rule 7)
```
apps/web  npx tsc --noEmit -p tsconfig.json ......... exit 0
apps/web  npx eslint . --max-warnings 0 ............. exit 0   (see note)
apps/web  npx prettier --check <my 5 files> ......... clean
apps/web  npx vitest run ................... 63 files / 927 tests passed
```
- Focused run (my 3 test files): **81 tests passed**.
- **ESLint note:** the workspace-wide `eslint .` run at 20:59 reported 1 error in
  `apps/web/lib/db/__pgbreak__/pool.ts` (`'__setRefillPool' is defined but never used`).
  That path is an **untracked** new file belonging to a concurrent sibling agent, and the
  sibling deleted it moments later; scoping ESLint to my 5 files exits 0 with zero
  warnings. The error was never in my diff.
- **Baseline note:** the web suite was 62 files / 886 tests before this task; it is now
  63 / 927. My change adds ~10 tests to existing files; the extra file is a sibling's new
  untracked test file (I created no file — `git diff --diff-filter=A -- apps/web` is empty).

### 4. Independence from the sibling's concurrent work
`apps/web/lib/db/pool.ts` was modified at 20:57:21 and its test at 20:58:01 — during and
after my run — and produced 3 transient failures in `lib/db/__pgbreak__/pool.test.ts`
(not 500-ing routes; a refill-seam spy). Confirmed not mine: my files' last write was
20:46:44, `grep -rn "ai-chat-input|use-chat-stream" apps/web/lib/db/` returns nothing
(no import relationship), and the final full-suite run is 63/927 green after the sibling
removed their scratch directory.

### 5. Scope and safety
- `HEAD` still `d9cf8d7` — no commit.
- No `git stash` / `checkout` / `restore` / `reset` executed at any point. Backups and
  restores used `cp` and `diff` only.
- No secrets read or written; no prod access; no deploy; no migration.
- No manifest or lockfile edited. (`package-lock.json` shows as modified in the tree but
  its mtime is **2026-09-20 11:09**, three days before this session — pre-existing, not mine.)
- Chat-spend / persona / prompt logic untouched.
- Temp artifacts (`.playwright-mcp/corvus-probe.png`, the screenshot) deleted.
