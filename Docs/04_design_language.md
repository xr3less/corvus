# 04 — Design Language

## Status: DRAFT (lead snapshot 2026-09-11 — measured truth of `/pryzm`, the unlocked lead per D-061. Values below are read off `apps/web/app/pryzm/pryzm.module.css` + `page.tsx`, not invented. Method locked D-068: founder curates pixels, AI ports 1:1, no generated taste.)

> The visual and tonal system: colors, type, spacing, components, voice. Per `GLOBAL_RULES.md §3.4`, the design direction must be settled before the build starts. The Reviewer gate compares built UI against this doc (and any screenshots in `Screenshots/`).

---

## 1. Design direction & mood

> LOCKED feeling (founder, 2026-09-07): CLEAN AND TRUSTWORTHY. Server owners hand us elevated permissions + bot tokens — every pixel must say "safe hands." Colors/typography delegated to build agent; FOUNDER TESTS all UI before it ships (taste gate).
>
> DARK-FIRST (founder, 2026-09-10, D-045): V1 ships dark. Refs: Strix.ai + illustration.app (landing: black hero, centered message, one CTA, logo/product strip) + Linear.app (dashboard: dense left-nav + center content + subtle borders). Light theme deferred to V2.
>
> ANTI-SLOP RULE (founder directive, non-negotiable): never ship generic AI aesthetics — no purple-blue gradient blobs, no glassmorphism-everywhere, no ✨-emoji marketing voice, no identical-Inter-everywhere, no lorem-style filler copy. Every screen must look hand-decided. Reviewer gate checks this against real renders.

> Palette/type measured off the lead route 2026-09-11 (D-062…D-072); the anti-slop rule stays attached to every UI task brief. Founder tests all UI before ship.

---

## 2. Color palette

> Dark single-field (D-045 + D-071): page reads as ONE continuous `#000` from nav to footer (all 4 bands resolve to the bg token); cards/panels keep their contrast. Light theme is dead unless the founder reopens it (D-067).

| Token | Value | Use |
|---|---|---|
| `color-bg` | `#000000` (`--pryzm-bg`) | Page + section bands (single field, D-071) |
| `color-surface` | `#0B0B0D` | Raised surfaces |
| `color-surface-2` | `#141417` | Inner blocks |
| `color-card` | `#16161B` | Cards (stats, quick-create box) |
| `color-panel` | `#101014` | Dashboard mock panel |
| `color-text` | `#FAFAFA` | Headings, primary button text-inverse |
| `color-body` | `#D4D1D9`-family / `#D4D4D8` | Hero-adjacent body |
| `color-muted` | `#A1A1AA` | Sub copy, captions, trial line, chips |
| `color-faint` | `#71717A` | `(example)` markers, faintest labels |
| `color-border` | `rgb(255 255 255 / 0.08–0.09)` | Hairlines, card/panel edges |
| `color-border-strong` | `rgb(255 255 255 / 0.15)` | Badge shell, ghost-button border, dividers |
| `color-primary` | `#FAFAFA` fill, `#0A0A0B` text | Hero primary button: 40px height, **8px radius**, 500 weight (NOT a pill — mined hero-3, D-070) |
| `color-ghost` | transparent + strong border | Hero secondary button, same 40px/8px metrics |
| `color-accent` | `#2DD4BF` | Teal dot (badge) + focus ring (`2px` outline, `3px` offset) — never fills |
| `color-success` | `#22C55E` | Online pills, pre-flight pass |
| `color-warning` | `#F59E0B` | Yellow pre-flight rows, soft-cap notices |
| `color-error` | `#FF7B72` | Red rows, destructive actions |
| Forbidden | neon, purple-blue gradients, heavy glassmorphism, light themes | Panel glow ALLOWED: white radial `0.1` alpha, `blur(50px)`, static only + bottom mask fade on preview |

---

## 3. Typography

- Display: `Poppins` 500–600 for the hero voice; UI text system stack (`Inter` fallback). Mono: `Geist Mono` for badge boxes, labels, code/logs. Weights: 500 hero/buttons/labels, 600 panel titles only (never 700+ — the reference H1 is 500, D-070).
- Scale (measured): H1 **36px mobile → 48px desktop**, `lh 1.25`, `-0.03em`, flat `#FAFAFA`, balance-wrap. Hero sub 14 → 18 → 20px, `0.05em` tracking, muted. Body 15–16/1.625. Small 13–14, micro 11–12 (chips, captions). Pretty-wrap body.
- Motion type: rotating H1 word (D-065) — `inline-grid` stack (no layout shift), 10s cycle / 2.5s per word, fade+rise; `prefers-reduced-motion` shows the static first word. Words today: bot / moderator / welcomer / guardian (one const, founder-swappable).

---

## 4. Spacing & layout

- 4pt scale. Card radius 10–12px, hero button radius **8px**, input radius 8–10px, badge box radius 2–4px. Borders 1px hairlines; panel shadow `0 20px 25px -5px rgb(0 0 0 / 0.5)` + ring `0 0 0 1px rgb(255 255 255 / 0.1)` + white radial glow + bottom mask fade on previews.
- Containers: hero content **64rem** centered, copy column **42rem** left-aligned; panel **max-w-5xl** (`p-2`). Breakpoints 640/768/1024/1280. Dashboard: left nav 240px + content; panel interview: single 640px column (chat-like, private by design). Mobile: single column, tables become stacked cards.

---

## 5. Components

> Shared kit lives in `components/ui/` (D-123 rule: one rail, one chat kit — ports reuse it, never re-copy it). Route CSS Modules hold only route-specific layout. Every interactive primitive ships all states or it doesn't ship.

- Hero stack (the lead rhythm): box badge (mono mini-box + divider + text, non-link) → H1 + rotator → sub → button pair (ghost FIRST → quiet anchor, white SECOND → primary) → trial line verbatim → dashboard mock panel (window dots + title + Preview chip, sidebar 240px, 4 stat cards, inline-SVG chart, every number `(example)`-marked).
- Button (primary/ghost/dark/danger; default, hover, focus-ring, disabled, loading) — hero pair: 40px height, 8px radius, 500 weight, no uppercase. Dark button (section CTAs, e.g. flow-cta): `#1C1C1F` fill, `rgb(255 255 255 / 0.12)` border, FULL pill `999px`, fg text, padding `0.625rem 1.25rem`, 14px; hover border `.3` + fill `#26262B`. Pill radius survives on dark buttons and legacy nav spots only.
- Input/select/textarea (default, focus-ring `color-accent`, error-red border + message, disabled) — labels always visible above, never placeholder-only.
- Card (surface, 1px border, 10–12px radius; header/title/body/footer slots). Pricing: 3 cards, popular Pro elevated — Trial $0 / Pro $10 / Studio $29, all CTAs → `/dashboard`.
- Modal (overlay 50% black, 560px card, Esc closes, focus trapped, destructive needs typed confirm for irreversible acts like rollback-to-old-version? No — rollback is safe; typed confirm only for bot delete).
- Pills/badges (online green, offline gray, trial blue, Red/Yellow/Green pre-flight rows).
- Diff view (Accept/Reject per change — the AI-patch review surface).
- Empty states: one line + one action ("No bots yet — Connect your first server"), never blank panels.

---

## 6. Voice & tone

- Plain verbs first ("Connect", "Publish", "Roll back"), no emoji in UI, no exclamation marks in product copy, no "supercharge/delight/seamless" filler. Errors say what happened + the one fix ("I couldn't kick @X — drag my role above theirs. [How]").
- Numbers over adjectives: "≈1800 builds left" not "plenty of credits". Trial copy states the deal in one line: "3 days, full Pro, no card. Then pay or your bot sleeps."
- **Non-coder voice (L-015, 2026-09-12).** ICP per D-008 is non-coder Discord server owners running gaming/study/streams communities (50–5,000 members) — not developers. User-facing copy explains value as to a friend who runs a Discord server. Forbidden on user-facing surfaces: OAuth, PKCE, ACID, Postgres, WebSocket, Multi-guild, Dispatch, Compilation, Self-healing, Behavior spec, Sandbox, Backend, API, "Production-grade", "Built from first principles", "Enterprise-Grade", "Architectural Breakthroughs". If a developer term is technically accurate but the ICP won't recognize it, paraphrase or remove. Visual rhythm still founder-pixel-picked (D-068); copy layer is audience-fit, separately. No fabricated numbers (social proof / testimonials / uptime / latency) — only real numbers or marked examples (`* example`). No form with no backend (L-005).

---

## 7. Accessibility baseline

- Contrast ≥ 4.5:1 body, ≥ 3:1 large text (tokens chosen to pass). Visible focus ring on everything interactive (`color-accent` 2px outline). Full keyboard path for interview → template → simulate → publish (no mouse-only step). Alt text on template thumbnails; status never color-only (pill carries text: Online/Offline/Trial). Reviewer checks against real renders.
