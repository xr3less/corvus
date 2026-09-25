# 04 — Design Language

## Status: LIVE SNAPSHOT — trued 2026-09-20 (D-062…D-072 + D-120, KI-031 leg closed)

> Every value in this file was re-measured against the shipped CSS on 2026-09-20, not carried over from the historical `/pryzm` snapshot. `apps/web/app/landing.module.css:6-15` is the live token source for `/`; `apps/web/app/dashboard/layout.module.css:6-13` for the dashboard shell. If this doc and a live stylesheet disagree, **the stylesheet wins** — re-measure and true this file in the same task.
>
> Superseded: the 2026-09-11 snapshot measured off the `/pryzm` route. `/pryzm` is a parked dev-only route (KI-034) — it guards itself with `notFound()` in production (`apps/web/app/pryzm/page.tsx:275-277`), so direct URLs 404; it is not the live homepage and its tokens are not these tokens. The method it produced still stands: **D-068 — the founder curates pixels**, and the Reviewer gate compares built UI against this doc (plus any screenshots in `Screenshots/`). Detail: `Teknik_Borc/KI-031_docs-stale.md`, `Teknik_Borc/KI-034_parked-routes.md`.

> The visual and tonal system: colors, type, spacing, components, voice. Per `GLOBAL_RULES.md §3.4`, the design direction must be settled before the build starts.

---

## 1. Design direction & mood

> LOCKED feeling (founder, 2026-09-07): CLEAN AND TRUSTWORTHY. Server owners hand us elevated permissions + bot tokens — every pixel must say "safe hands." Colors/typography delegated to build agent; FOUNDER TESTS all UI before it ships (taste gate).
>
> DARK-FIRST (founder, 2026-09-10, D-045): V1 ships dark. Refs: Strix.ai + illustration.app (landing: black hero, centered message, one CTA, logo/product strip) + Linear.app (dashboard: dense left-nav + center content + subtle borders). Light theme deferred to V2.
>
> ANTI-SLOP RULE (founder directive, non-negotiable): never ship generic AI aesthetics — no purple-blue gradient blobs, no glassmorphism-everywhere, no ✨-emoji marketing voice, no identical-Inter-everywhere, no lorem-style filler copy. Every screen must look hand-decided. Reviewer gate checks this against real renders.
>
> The anti-slop rule stays attached to every UI task brief. The live homepage is the Antigravity port (D-120) at `/`; the lead-route token snapshot (D-062…D-072) that used to open this section is retired — its values were replaced by the measured ones below.

---

## 2. Color palette

Three token sets are live. They share the same field and the same two accent roles; they are **not** interchangeable, and a port must not re-copy one into another (D-123: one rail, one chat kit — ports reuse the shared kit, never re-copy it).

### 2.1 Landing `/` — `apps/web/app/landing.module.css:6-15` (authoritative for the homepage)

| Token           | Value                        | Use                                                              |
| --------------- | ---------------------------- | ---------------------------------------------------------------- |
| `--bg`          | `#000000`                    | Page + all section bands (single field, D-045 + D-071)           |
| `--surface`     | `#0b0b0d`                    | Raised cards (`.card`, `:70-74`)                                 |
| `--surface2`    | `#141417`                    | Secondary surfaces, demo/tile chips                              |
| `--surface3`    | `#18181c`                    | Tertiary surface — deepest raised step (do not collapse with `--surface2`) |
| `--line`        | `rgba(255, 255, 255, 0.09)`  | Hairlines, card/panel edges                                      |
| `--line-bright` | `rgba(255, 255, 255, 0.2)`   | Strong borders — badge shells, hover borders, dividers           |
| `--fg`          | `#fafafa`                    | Headings, primary text                                           |
| `--muted`       | `#a1a1aa`                    | Sub copy, hero sub, captions, chips                              |
| `--faint`       | `#71717a`                    | Panel labels, faintest captions                                  |

**Accent (live): `#34d399`** — emerald, the dominant accent on `/`. Used as text, dot fills and glyph fills (11 uses: `:584`, `:676`, `:735`, `:923`, `:987`, `:1025`, `:1059`, `:1247`, `:1535`, `:1593`, `:1932` — e.g. play glyph, live dots, check/ok marks, "AI" speaker label, price checks, footer status dot). Its tag variants pair it with an emerald wash: `rgba(16 185 129 / 0.1)` fill + `rgba(16 185 129 / 0.2)` border (`:1246-1250`, `:1534-1539`).

**Focus ring on `/` is neutral, not teal:** `2px solid rgba(255, 255, 255, 0.4)`, offset `3px`, radius `6px` (`landing.module.css:35-39`).

**Honest note on token usage:** of the nine tokens declared at `:7-15`, only four are ever read through `var()` — `--bg` (`:16`), `--surface` (`:71`), `--line` (`:72`, `:115`), `--fg` (`:17`, `:99`, `:117`); a tenth token, `--landing-mono`, is defined in `page.tsx:25` and read at `:66`, making five `var()` reads in total. `--surface2`, `--surface3`, `--line-bright`, `--muted` and `--faint` are declared but **bypassed** — the sections that should use them write the literal hex/rgba instead (e.g. `#141417` at `:563`, `rgba(255 255 255 / 0.2)` at `:1079`, `#a1a1aa` at `:492`, `#71717a` at `:965`). Values are in sync today; treat the token block as the naming source of truth and prefer the `var()` when editing. New literal hex that duplicates a token is a defect.

Literal values that appear in the landing CSS without a token — treat these as the same palette, not new colors: `#0c0c0e` (inner mock panels, `:947`, `:1176`, `:1466`), `#d4d4d8` (secondary body text), `#ffffff` (H1, price values, emphasized lines), `#f4f4f5` (list titles), `#1c1c1f` / `#1c1c21` / `#26262b` (dark-button fill, hover, hover-fill), `#27272a` / `#3f3f46` (selection + scrollbar thumb), `#e4e4e7` (white-button hover).

### 2.2 Dashboard — `apps/web/app/dashboard/layout.module.css`

| Value                            | Use                                                              |
| -------------------------------- | ---------------------------------------------------------------- |
| `#000000` field, `#fafafa` text  | Shell base (`:4-5`), content column (`:43`)                       |
| `radial-gradient(rgb(255 255 255 / 0.07) → transparent)` | Ambient glow, top-left (`:63`)          |
| `radial-gradient(rgb(255 255 255 / 0.03) → transparent)` | Ambient glow, bottom-right (`:73`)      |
| `2px solid #2dd4bf`, offset `3px` | Focus ring for `button`/`input`/`select`/`a` in the shell (`:81`) |
| `#1c1c1f` fill, `rgb(255 255 255 / 0.15)` border | Dark pill button; hover `#26262b` / border `.3` (`dashboard/page.module.css:3-24`) |

Dashboard glow is **static, white-only, decorative** — never colored, never animated. `color-scheme: dark` is declared on the shell.

### 2.3 Route shell pages — `terms`, `privacy`, `gallery`

Legal (`terms/page.module.css:17-20`, `privacy/page.module.css:17-20`) and gallery (`gallery/page.module.css:18-21`) focus rings are `2px solid #2dd4bf`, offset `3px`. These shells use the `Inter` stack (see §3). `gallery` also carries one live emerald accent at `:265`; `terms`/`privacy` link color uses `#2dd4bf` (`terms:148`, `privacy:160`).

### 2.4 Accent role split — read this before adding color

- **`#34d399` — emerald: the surface accent.** Success states, live/online dots, check marks, positive tags, price confirmations, the "AI" speaker label. It carries most of the live color on `/`. Add state color here.
- **`#2dd4bf` — teal: the narrow focus/progress accent.** Live only as (a) explicit focus rings — `dashboard/layout.module.css:81`, `gallery/page.module.css:19` and `:452`, `terms:18`, `privacy:18` — plus the Tailwind `ring-ring` utility on the chat input's mic button (`components/ui/ai-chat-input.tsx:892`, fed by `--color-ring: #2DD4BF` at `globals.css:140`), and (b) progress fill — `components/ui/builder-progress.module.css:62`. It is **not** the general-purpose accent. Do not reach for it to color a new icon, badge or heading.
- **The shared kit's *default* focus ring is NOT teal — it resolves to sky `#0ea5e9`.** `Button.module.css:47`, `Input.module.css:40`, `Modal.module.css:29`/`:72` and `globals.css:89` all paint `2px solid var(--color-accent)`, and `--color-accent` resolves to `#0ea5e9` (`globals.css:12`, an unlayered `:root`) — not `#1C1C21` (`globals.css:134`, inside `@theme inline`, i.e. `@layer theme`, which an unlayered rule always beats) and not teal. Verified in a browser against the built stylesheet on 2026-09-20. If you want teal rings in the kit, change the code, not this line.

Legacy teal that is *not* the live system and should not be extended: `apps/web/app/pick/pick.css:30` (`--pick-accent`) is the dev-only local component picker (never linked from prod nav, never shipped), and `apps/web/app/pryzm/pryzm.module.css` belongs to the parked route.

Status colors, by surface — do not mix these up when extending:

- **Landing `/`:** success `#34d399`; error/destructive `#f87171` (`:994`, `:1001`, struck-through denied rows).
- **Dashboard route CSS:** success `#22c55e`, warning `#f59e0b` (`dashboard/page.module.css:443`/`:447` pre-flight dots; `dashboard/bots/page.module.css:352`/`:360` online/trial pills).
- **Shared kit:** driven by tokens, not literals — `--color-success: #16a34a`, `--color-warning: #d97706`, `--color-error: #dc2626` (`globals.css:13-15`), consumed as `var()` in `components/ui/Pills.module.css:26`/`:59`. The kit's inline error *text* color is `#fca5a5` (`builder-progress.module.css:81`, `chat-thread.module.css:27`). There is no `#ff7b72` in the kit — that hex exists only as `--pick-error` in the dev-only picker (`pick/pick.css:31`).

Tag accents that already exist on `/`: sky `#38bdf8`, rose `#fb7185` (`:1252-1262`) — both in the `0.1` fill / `0.2` border pattern.

Forbidden: neon, purple-blue gradients, heavy glassmorphism, light themes (V1). Allowed and live on `/`: white radial panel glow at low alpha (`heroGlow` `rgba(255,255,255,0.06)` via inline style at `page.tsx:190-193`), an **emerald** gradient wash on the product frame (`frameGlow`: `rgba(16, 185, 129, 0.1)` → transparent → `0.05`, `filter: blur(40px)`, `landing.module.css:602-612`) and on the footer (`footerGlow`: `rgba(16, 185, 129, 0.16)` → `rgba(255,255,255,0.03)` → transparent, `blur(12px)`, `opacity 0.4`, `:1776-1787`, veiled by `rgba(0,0,0,0.55)` at `:1789-1793`). These CSS glows are static — but see §3: the hero also carries an *animated* WebGL canvas, so "`/` is static" is false as a blanket statement. Plus a bottom mask fade on previews. Glass is limited to four `backdrop-filter` sites on `/` — the product frame (`blur(12px)`, `rgba(9 9 11 / 0.9)` fill, `landing.module.css:616-625`), the mobile nav drawer (`blur(24px)`, `rgba(0 0 0 / 0.95)` fill, `:342-353`), and the two template-tile overlays: `.tilePill` (`rgba(0 0 0 / 0.7)` fill, `:1219-1232`) and `.tileTag` (tonal `0.1`-fill tag shell, `:1234-1262`), both `blur(12px)`. The tile overlays are small chips riding on top of a thumbnail, which is why they read as glass without becoming a surface treatment. None of the four is a general-purpose surface treatment.

---

## 3. Typography

Three stacks are live, one per surface. They are intentionally different — the anti-slop rule forbids identical-Inter-everywhere.

| Surface                    | Stack                                                                        | Source                              |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| Landing `/`                | `'Plus Jakarta Sans'`, `-apple-system`, `BlinkMacSystemFont`, `'Segoe UI'`, `Roboto`, `sans-serif` | `landing.module.css:18-24`; loaded via `Plus_Jakarta_Sans` (weights 300–800, latin, `display: swap`) — `apps/web/app/page.tsx:16-20` |
| Landing mono               | `var(--landing-mono)` → `Geist_Mono` (400/500), fallback `ui-monospace`, `monospace` | `landing.module.css:65-67`; `page.tsx:21-26` |
| Dashboard                  | `'Geist'`, `-apple-system`, `BlinkMacSystemFont`, `'Segoe UI'`, `ui-sans-serif`, `system-ui`, `sans-serif` | `dashboard/layout.module.css:6-13`; `Geist` 400/500/600 latin — `dashboard/layout.tsx:8` |
| `terms` / `privacy` / `gallery` shells | `'Inter'`, `-apple-system`, …                                     | `terms/page.module.css:6-14`, `privacy/page.module.css:6-14`, `gallery/page.module.css:7-15` |
| Shared `components/ui/` primitives | `var(--font-sans)` = `'Public Sans'`, … (set by the root layout) / `var(--font-mono)` = `ui-monospace`, `'Cascadia Mono'`, `Menlo`, `Consolas`, `monospace` | `globals.css:23-26`; `apps/web/app/layout.tsx:3-10` |

Weights: 500 for buttons/labels, 600 for headings and panel titles on `/` (the two dominant steps — 22 and 10 declarations respectively). 700 appears seven times in the app's own `*.css`: four on one tiny-glyph role — the 9px `Discord`/`BOT` badge (`landing.module.css:1292-1298`, `gallery/page.module.css:313-318`) and the 16px icon-circle glyph (`dashboard/bots/[id]/page.module.css:65-77`; the same rule at `dashboard/page.module.css:302-315` has no consumer) — plus three bare-element fallbacks (`globals.css:49`/`:56`/`:63` = `h1`/`h2`/`h3`) that land only where a heading sets no weight of its own (the bare `h1`/`h2` on `/interview`; `Card`'s `<h3>` on `/demo`, which `/` links to). Every classed heading on `/`, the dashboard and the gallery/terms/privacy shells declares 500/600 itself, so on the measured surfaces 700+ stays reserved for that glyph role — never for headings or body. (Two further 700s sit outside `*.css`: the checkout receipt's inline `<style> h1` — `api/checkout/success/route.ts:203` — and Tailwind `font-bold` in the dev-only `/demo/stats-bento`.)

Scale (measured off `landing.module.css`):

- **H1** `2.25rem` → `3rem` @640px → `3.75rem` @1024px, weight 600, `line-height 1.08`, `letter-spacing -0.03em`, `#ffffff` (`:469-488`). Display class carries the `-0.03em` tracking (`:60-63`).
- **Hero sub** `1rem` → `1.125rem` @640px, `line-height 1.625`, `--muted`, `max-width 42rem` (`:490-503`).
- **Section H2 / block titles** all start at `1.875rem`, weight 600, `-0.03em`, `#ffffff`, then step differently per block: `.h2center` → `3rem` @768px (`:796-810`); `.blockTitle` → `3rem` @768px → `3.75rem` @1024px (`:864-884`); `.pricingTitle` → `2.25rem` @640px → `3rem` @1024px (`:1420-1438`); `.templatesTitle` and `.faqTitle` → `2.25rem` @640px (`:1117-1129`, `:1653-1665`). There is no single H2 step — check the block you are editing.
- **Lede** `--muted`, centered, `max-width 36rem` (`.lede` `:811-824`, `.pricingLede` `:1440-1446`, `.templatesLede` `:1131-1136`). The `48rem` cap applies to the *head containers* that hold a title + lede (`.heroCopy` `:448`, `.pricingHead` `:1412`, `.faq` `:1633`), not to the lede text itself.
- **Body / small** 14–15px, muted `#d4d4d8` for secondary runs; **micro** 11–12px for captions and price notes (`:1623-1628`).
- Uppercase panel labels: 14px, `letter-spacing 0.05em`, `--faint` (`:961-967`).

Motion — four things are live on `/`, not one:

1. **Animated WebGL hero canvas (Velaris).** `<VelarisCanvas />` is mounted inside the hero (`page.tsx:186`) and runs a continuous `requestAnimationFrame` render loop (`landing-islands.tsx:410-427`, `VELARIS_SPEED = 1.6` at `:18`, emerald palette `#10b981`/`#059669`/`#064e3b` at `:17`), styled by `.velaris` (`landing.module.css:411-418`, `opacity 0.6`). This is a live animated background under the H1 — do not describe `/` as static. It is gated: `prefers-reduced-motion: reduce` returns early and leaves the CSS glow (`landing-islands.tsx:321-323`), and it no-ops without WebGL (`:327-330`).
2. **Lenis smooth scroll**, dynamically imported and gated on reduced-motion (`landing-islands.tsx:165-197`), with anchor clicks riding it (`:200`+); native scroll is the fallback. The same reduced-motion check governs both.
3. **`pulseDot` keyframe** on live/status dots (`:672-688`, reused `:1928-1934`), 2s infinite.
4. **`.reveal` entrance utility** (`:133-152`).

The hero H1 itself is **static text** — there is no rotating-word stack (`page.tsx:202-204` renders one plain string) and no rotator CSS in `landing.module.css`; the D-065 rotating-H1 behaviour was retired with the Pryzm port and reintroducing it needs a founder call. `prefers-reduced-motion: reduce` kills CSS transitions (`:146`) and, separately, gates the canvas and Lenis.

---

## 4. Spacing & layout

- 4pt scale. Radii in live use: **pill `999px`** is the dominant shape (badges, all three landing buttons, live dots, chips, avatar circles) — **18px** for the surface card (`.card`, `:70-74`), **1rem** for product/price panels (`:618`, `:945`, `:1178`, `:1468`, `:1481`), **0.75rem** for frame bar and tiles, **0.25–0.375rem** for small mono boxes. The old "hero button = 8px radius, NOT a pill" rule is **retired**: the live hero uses two pills — `Start building free` (white fill, `999px`, 14px, weight 600, with a black circular arrow badge, `:520-554`) and `Interactive Demo` (label at `page.tsx:225`; `#141417` fill, `rgba(255 255 255 / 0.1)` border, `999px`, 14px, weight 500, `:559-581`). Shared `components/ui/` primitives remain square-ish (`--radius-card: 10px`, `--radius-button: 8px`, `--radius-input: 8px`, `globals.css:17-19`) — that is the kit's lane, not the landing's.
- Borders are 1px hairlines from `--line` / `--line-bright`; panel treatment adds `box-shadow: 0 25px 50px -12px rgba(0 0 0 / 0.9)` + `0 0 0 1px rgba(255 255 255 / 0.05)` (`:621-624`).
- Containers: nav and content rails **`max-width: 72rem`** (`:214`, `:1804`, `:1899`); wide section wrap **`80rem`** (`:427`), inner sections **`1400px`** (`:775`, `:1091`, `:1399`); hero copy column **`48rem`** centered (`:446-454`) with the sub capped at **`42rem`**; product frame **`64rem`** (`:591`); text blocks **`36rem`/`28rem`**. Nav padding `1rem` → `1.5rem` @640px (`.navInner` `:217`, `:220-224` — there is **no** 1024px nav step). The hero container has its own three-step padding `1rem` → `1.5rem` @640px → `2rem` @1024px (`.heroContainer`, `:426-444`). Hero vertical padding `7rem/5rem` → `9rem/7rem` @768px (`:396-409`).
- Breakpoints in live use on `/`: **640 / 768 / 1024** (no `900` in `landing.module.css`). The `900px` breakpoint is the dashboard shell's collapse (`dashboard/layout.module.css:98`).
- Dashboard layout: outer shell is `flex` — rail (owned by `components/ui/dashboard-rail.module.css`) + content column (`dashboard/layout.module.css:1-15`, `:37-46`). The dashboard home is a **left-aligned full-width workspace grid, not a centered column** (`dashboard/page.module.css:32-40`). Interview stays a single centered column (chat-like, private by design).

---

## 5. Components

> Shared kit lives in `components/ui/` (D-123 rule: one rail, one chat kit — ports reuse it, never re-copy it). Route CSS Modules hold only route-specific layout. Every interactive primitive ships all states or it doesn't ship. The kit draws on the `globals.css` tokens + `--font-sans`; landing and dashboard do **not** inherit from it — they carry their own tokens.

Live `/` **section order** (`page.tsx`), top to bottom — this is the shipped rhythm and any new section slots into it, not over it:

1. **Nav** (`landing.module.css:175-390`) — brand cluster + five anchor links (`Features` and `Architecture` both → `#bento`, `Showcase` → `#templates`, `Pricing` → `#pricing`, `FAQ` → `#faq`; `page.tsx:31-37`) + demo/sign buttons. The feature links (`.navLinks`, `:275-287`) are hidden below **768px**, where a hamburger (`.menuBtn`, hidden again at `min-width: 768px` — `:328-340`) opens the drawer menu instead. The demo button (`.demoBtn`) is hidden below **640px**, not 768px (`:305-315`); the sign button stays visible at all widths.
2. **Hero** `#how-it-works` (`:396-758`) — centered single-column: pill badge (`No code | No token paste | free preview`, `:456-467`) → H1 → sub → CTA pair (white pill first, dark demo pill second) → price note `Free 3-day trial — 1 bot, 100 AI credits, no card required.` (string at `page.tsx:220`, class `.priceNote` at `:1623-1628`) → **product frame**: window bar with a pulsing live dot + URL, then the preview image inside the blurred glass frame.
3. **Bento** `#bento` (`:760-1088`) — alternating text/panel rows. Panels carry the permission list (`permOk` ✓ emerald / `permNo` ✗ red struck-through), the timeline list (emerald dots + title + faint sub), and the conversation mock (faint speaker column, emerald `AI` speaker, dim/bright line pair).
4. **Templates** `#templates` (`:1090-1396`) — template tile grid; tiles carry an emerald/sky/rose tag in the `0.1`/`0.2` pattern, plus one ghost "more" tile.
5. **Pricing** `#pricing` (`:1398-1628`) — three cards, popular card elevated (`:1480-1493`) with a badge; emerald price flags and checks. Tiers are **Starter $0** ("free preview", flag *No Card Required*), **Corvus Pro $10/mo** (popular, emerald flag), **Corvus Studio $29/mo** (flag *Networks & Agencies*) — `page.tsx:703/750/805`. **Honesty state (L-005, KI-030 / KI-033, D-145 — re-measured 2026-09-20):** nothing is *sellable* yet — no checkout, no payment path. But the copy deliberately distinguishes two different things, and the distinction is load-bearing: **planned** (not built) vs **enforced** (built and live). The section lede says "Prices and limits are planned — no checkout yet, nothing is enforced" (`page.tsx:693-696`), while Starter's own card says "Prices and limits are planned — the trial (1 bot, 100 AI credits) is enforced." (`page.tsx:711`). That is not a contradiction to "fix" — as of D-145 the trial *is* enforced by five live gateway gates (commit `d9cf8d7`), so Starter's line is the accurate one and the section lede's "nothing is enforced" is the loose one. Pro and Studio are still entirely unbuilt. Starter's CTA is the only live link (`/dashboard`), and Pro and Studio render **disabled buttons** reading "Pro — coming soon" / "Studio — coming soon" (`page.tsx:791-798`, `:843-850`). Feature bullets carry a `Planned:` prefix for the same reason — on Starter the four capability bullets are prefixed while `Community Discord support` is not (`page.tsx:713-733`), and Studio prefixes its first three (`page.tsx:816-841`). Pro's bullets are unprefixed. Do not add a tier, a price or an enabled checkout CTA here without a founder decision.
6. **FAQ** `#faq` (`:1632-1758`) — accordion list, plus glyph rotates 45° when open (`:1716-1729`).
7. **Footer** (`:1761-1934`) — glow + veil, brand column, three link columns, base row with a pulsing emerald status dot.

- **Buttons.** Landing: white pill (`.btnPrimary`, `#fafafa` → `#ffffff` hover, black text, weight 600, `:77-93`) is primary; `#141417` pill with a `rgba(255, 255, 255, 0.1)` border is secondary (the hero instance is `.ctaDemo`, `:559-581`; note this writes the literal `0.1`, **not** `var(--line)` = `0.09` — see §2.1's bypass note); inner dark pills use `#1c1c1f` + `rgba(255 255 255 / 0.12)` border, hover border `0.28` + fill `#26262b` (`.btnDark`, `:95-112`). Ghost = transparent + `--line` border (`.btnGhost`, `:114-130`). No uppercase, no lift-on-hover (anti-slop), color/border transitions only. Shared kit `Button` owns the default/hover/focus/disabled/loading matrix (`Button.tsx:10-35`).
- **Input/select/textarea** — label always visible above, never placeholder-only; focus ring, error-red border + message, disabled state.
- **Card** — surface + 1px hairline + radius from §4; header/title/body/footer slots.
- **Modal** — overlay `rgb(0 0 0 / 0.5)`, card `max-width: 560px`, Esc closes, focus trapped (`Modal.module.css:1-30`, `Modal.tsx:42-68`); typed confirmation is opt-in via the `confirmPhrase` prop (`Modal.tsx:14-15`, `:86-88`). **As of 2026-09-20 the shared `Modal` has no production consumer** — its only usages are its own test file. Treat the "typed confirm for bot delete" rule as a *design intent to honour when that flow is built*, not as a description of shipped code.
- **Pills/badges** — `Pills.tsx` ships `online` / `offline` / `trial`; the dot colors are token-driven: online `var(--color-success)` = `#16a34a`, offline `var(--color-muted)` = `#64748b`, trial `var(--color-primary)` = `#1e40af` (`Pills.module.css:25-35`; tokens at `globals.css:8`/`:10`/`:13`). Pre-flight rows are left-border tones red/yellow/green (`Pills.module.css:50-60`). Status is never color-only — the pill always carries text.
- **Diff view** — accept/reject per change; the AI-patch review surface.
- **Empty states** — one line + one action via the shared `EmptyState` primitive (`message` + `actionLabel` + `onAction`), never a blank panel. Live copy: `No open questions — start a new round.` (`interview/page.tsx:375-379`), `Say hello - no signup needed.` (`demo/page.tsx:92-96`). The dashboard's own empty state is inline, not the primitive: `No bots yet — describe your first bot.` (`dashboard/bots/page.tsx:183`).

---

## 6. Voice & tone

- Plain verbs first ("Connect", "Publish", "Roll back"), no emoji in UI, no exclamation marks in product copy, no "supercharge/delight/seamless" filler. Errors say what happened + the one fix ("I couldn't kick @X — drag my role above theirs. [How]").
- Numbers over adjectives: "≈1800 builds left" not "plenty of credits". Trial copy states the deal in one line: "Free 3-day trial — 1 bot, 100 AI credits, no card required."
- **Non-coder voice (L-015, 2026-09-12).** ICP per D-008 is non-coder Discord server owners running gaming/study/streams communities (50–5,000 members) — not developers. User-facing copy explains value as to a friend who runs a Discord server. Forbidden on user-facing surfaces: OAuth, PKCE, ACID, Postgres, WebSocket, Multi-guild, Dispatch, Compilation, Self-healing, Behavior spec, Sandbox, Backend, API, "Production-grade", "Built from first principles", "Enterprise-Grade", "Architectural Breakthroughs". If a developer term is technically accurate but the ICP won't recognize it, paraphrase or remove. Visual rhythm still founder-pixel-picked (D-068); copy layer is audience-fit, separately. No fabricated numbers (social proof / testimonials / uptime / latency) — only real numbers or marked examples (`* example`). No form with no backend (L-005).
- A user-facing string never contains an internal id, flag name, env var or infra term. If a page must explain a limit, it explains the customer consequence, not the mechanism.

---

## 7. Accessibility baseline

- Contrast ≥ 4.5:1 body, ≥ 3:1 large text (tokens chosen to pass). Live checks: `#fafafa` on `#000` and `#a1a1aa` on `#000` both pass; `#71717a` on `#000` sits at roughly 4.3:1 — use it for captions/labels only, never for body copy.
- Visible focus ring on everything interactive. Three live implementations, all `2px` outlines — the offset and color differ, so copy the one your shell already uses rather than inventing a fourth: **Exception (founder order 2026-09-21, D-147):** the `/dashboard/new` composer draws NO ring — rejected on sight as a "locked" look; its only focus signal is the `focus-within:border-white/30` shift (recorded in `chat-thread.module.css`). Do not extend without a founder call.
  - **Landing `/`** — neutral `rgba(255, 255, 255, 0.4)`, offset `3px` (`landing.module.css:35-39`).
  - **Dashboard / gallery / terms / privacy** — teal `#2dd4bf`, offset `3px` (`dashboard/layout.module.css:81`, `gallery:19`/`:452`, `terms:18`, `privacy:18`).
  - **Shared kit primitives** — `2px solid var(--color-accent)` at offset `2px` for `Button`/`Modal` (`Button.module.css:47`, `Modal.module.css:29`) and `1px` for `Input` (`Input.module.css:40`) and the modal's inner control (`Modal.module.css:72`). As of 2026-09-20 `--color-accent` resolves to **sky `#0ea5e9`**, not teal (see §2.4).
- Full keyboard path for interview → template → simulate → publish (no mouse-only step). Skip link is present on the dashboard shell (`dashboard/layout.module.css:17-34`).
- Alt text on images; status never color-only. `/` currently ships exactly one `<img>` — the hero preview — and it carries alt text (`page.tsx:256-258`); the template tiles and the gallery are CSS-gradient/`background` mockups, not `<img>` elements, so there are no thumbnails to alt. If a real image is added to a tile, it needs alt text. Reviewer checks against real renders.

---

## 8. Where the truth lives (re-measure here, not from memory)

| Surface                        | Authoritative file                                                    |
| ------------------------------ | --------------------------------------------------------------------- |
| Landing `/` tokens + all sections | `apps/web/app/landing.module.css` (tokens `:6-15`)                 |
| Landing fonts + section order  | `apps/web/app/page.tsx`                                               |
| Landing motion (hero canvas, Lenis, effects) | `apps/web/app/landing-islands.tsx`                      |
| Dashboard shell                | `apps/web/app/dashboard/layout.module.css` (+ `layout.tsx` for the font) |
| Dashboard rail                 | `apps/web/components/ui/dashboard-rail.module.css`                    |
| Shared primitives              | `apps/web/components/ui/*.module.css` + `apps/web/app/globals.css`     |
| Parked (not live)              | `apps/web/app/pryzm/*` — dev-only, 404s in production (KI-034)        |
| Dev-only picker                | `apps/web/app/pick/*` — never linked from prod nav, never shipped     |

Any PR that changes one of these files and leaves this document stale re-opens KI-031.
