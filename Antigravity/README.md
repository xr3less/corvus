# Corvus — Award-Winning Hybrid Landing Page & Design System

> ⚠️ **STALE — last README refresh was the pre-launch prototype state (2026-09-10). The cleanup wave of 2026-09-12 (D-075) removed: 10 fake testimonials, fake "500+/1.8M+" social proof, fake hero trust strip, unbacked newsletter form, `#features` Tailark carousel, `#cta` "60 Seconds Away" section, fake footer uptime. Bento rewritten with non-coder voice (L-015). Templates shrunk 8 → 3 + "See all 8 templates" CTA. README sections 3 (Marquee), 6 (Templates), 7 (Pricing), 8 (FAQ), 9 (Newsletter/CTA) now describe deleted content — trust D-075 over this README until refresh. Three surviving fake/jargon sites on the file are flagged as KI-009.**

This directory contains the **Corvus** production landing page prototype and modular TypeScript React component library. Corvus is a zero-code, AI-native bot development and deployment platform built for Discord communities and gaming networks.

The design system fuses **Pryzm (`pryzm.design`)** atmospheric depth (4-tier progressive blur, hairline borders, fluid Lenis scroll, and interactive WebGL shaders) with enterprise-grade B2B SaaS aesthetics (Linear, Raycast, Supabase).

All developments and code artifacts are strictly isolated within `C:\Users\xr3less\Desktop\corvus\Antigravity\`.

---

## 🎨 Design Philosophy & Token Architecture

Adapted tokens and aesthetic principles:

| Token / Area | Value / Rule | Rationale |
| :--- | :--- | :--- |
| **Background** | `#000000` (Pure OLED Black) | Infinite contrast and deep grounding for glow shaders |
| **Surfaces** | `#08080a`, `#0c0c0e`, `#121215`, `#141417` | Warm charcoal elevation layers with subtle luminance steps |
| **Borders (Hairlines)** | `border-white/10`, `hover:border-white/20` | Razor-sharp 1px hairline bezels |
| **Primary Accent** | Emerald `#10b981` | Single intentional accent for verified states, uptime, and active items |
| **Display Typography** | `Plus Jakarta Sans` (Semibold, tracking `-0.03em`) | Character-rich, modern Silicon Valley editorial display style |
| **Body Typography** | `Plus Jakarta Sans` (Regular/Medium, leading-relaxed) | Consistent, high-legibility body type |
| **System & Latency** | `Geist Mono` / `font-mono` | Strictly reserved for code tokens, schemas, and metrics (`14ms`, `v2.1`, `99.98%`) |
| **Button Architecture** | Button-in-button primary CTAs, `.btn-dark`, `.btn-ghost` | Restrained hover states without upward-lifting animations |
| **Anti-AI-Slop Rules** | Zero purple/neon gradients, zero candy buttons, zero monospace in UI chips or badges |

---

## 📂 Directory & File Architecture

```
Antigravity/
├── index.html                   # Complete, self-contained, interactive HTML & JS landing page (Velaris WebGL living shader)
├── README.md                    # Architectural documentation and design specifications
├── lib/
│   └── utils.ts                 # shadcn compatible cn class utility (clsx + tailwind-merge)
├── assets/                      # Local web fonts and high-resolution assets
│   ├── fonts/                   # Plus Jakarta Sans, Poppins, Inter, and Geist Mono fonts
│   └── images/
│       ├── pryzm.design/        # Ambient artwork, footer3.webp
│       └── qbbeqzzqoylaziguwfjx.supabase.co/ # 8 high-resolution Discord bot blueprint visual assets
└── components/                  # Modular TypeScript + React component library
    ├── index.ts                 # Central export hub for all components
    ├── Navbar.tsx               # 4-tier progressive blur sticky header with v2.1 badge & mobile drawer
    ├── Hero.tsx                 # WebGL Velaris living gradient hero component with OnboardCard
    ├── OnboardCard.tsx          # Forge UI 3-step interactive bot configuration card
    ├── SocialProofMarquee.tsx   # Dual-row marquee with 10 verified customer testimonial cards
    ├── FeaturesCarousel.tsx     # 4-tab Tailark architecture with in-browser live Discord command simulator
    ├── BentoGrid.tsx            # 6 enterprise-grade security cards (Least Privilege, Zero Token, Postgres, etc.)
    ├── BotTemplatesGrid.tsx     # 8 production-ready Discord bot blueprints with deploy states
    ├── RemixGrid.tsx            # Compatibility adapter for BotTemplatesGrid
    ├── Pricing.tsx              # 3 transparent pricing tiers with 20% annual discount toggle
    ├── FaqAccordion.tsx         # Single-open smooth accordion FAQ section
    ├── Footer.tsx               # Sticky reveal footer emerging from under main content
    ├── HeroCollage.tsx          # Parallax artwork collage component
    ├── StudioMock.tsx           # Bot behavior studio editor mockup
    ├── EmbedSection.tsx         # Live Discord embed preview widget
    ├── FlowGraph.tsx            # Logic routing graph visualizer
    └── ui/                      # Atomic UI component directory
        ├── velaris.tsx          # WebGL 1.0 simplex noise, grain & vignette living shader component
        └── demo.tsx             # Showcase demo for Velaris living canvas
```

---

## 🌟 Section Breakdown & Interactive Specifications (`index.html`)

### 1. 4-Tier Progressive-Blur Sticky Navigation (`#siteNav`)
- Pryzm-inspired **4-layer gradient-masked backdrop-filter blur stack** (`blur(2px)`, `blur(4px)`, `blur(8px)`, `blur(16px)`).
- Corvus geometric logo mark, `CORVUS` brand typography, and `v2.1` release badge.
- Navigation links: `Features`, `Architecture`, `Showcase`, `Pricing`, `FAQ`.
- Action CTAs: `Interactive Demo` and `Sign in with Discord` pill buttons with mobile drawer menu.

### 2. Hero Section + WebGL Velaris Living Gradient (`#how-it-works`)
- **Live WebGL Velaris Canvas Shader (`#velarisCanvas` & `components/ui/velaris.tsx`):**
  - WebGL 1.0 GPU simplex noise, 4-tier color blending, film grain (`grain: 0.25`), and vignette illumination.
  - Corvus palette: pure black ground (`bg: #000000`), pulsing emerald and charcoal waves (`#10b981`, `#059669`, `#064e3b`, `#09090b`), `speed: 1.6`.
  - High-DPR retina support via `Math.min(window.devicePixelRatio, 2)`.
- **Headline:** `Build Custom AI Discord Bots in Minutes, Not Weeks`
- **Subheadline:** `Stop paying per-server hostage fees for rigid bots. Describe your ideal moderator, economy, or support assistant in plain English—Corvus compiles and deploys it to your Discord server instantly.`
- **Primary Action:** Button-in-Button CTA `Start 3-Day Free Trial` with circular arrow pill.
- **Secondary Action:** `Interactive Demo` button.
- **Trust Strip:** `No credit card required · 14ms gateway response · 99.98% uptime SLA`.
- **Chassis Top Bar:** `Corvus Studio v2.1` with `100% Verified Secure` indicator in sans-serif typography.

### 3. Launch UI Dual-Row Testimonial Marquee (`#social-proof`)
- Dual-direction infinite scrolling marquee with edge gradient fade masks.
- Top pill: `PROVEN AT SCALE`.
- Headline: `Trusted by 500+ Discord Communities Managing 1.8M+ Members`.
- **10 Unique Verified Testimonial Cards:**
  - Row 1: Alex Rivera (Apex Esports), Sarah Chen (DevGuild HQ), Marcus Vance (CryptoAlpha DAO), Elena Rostova (Anime Lounge), Jessica Taylor (StudyStream).
  - Row 2: Liam O'Connor (Indie Game Devs), David Park (Trading Signals Pro), Michael Torres (Creator Economy Hub), Chloe Bennett (LoFi Chill Lounge), Nathan Drake (Adventure Guild).
- Verified bot badges, sans-serif member counts, and 5.0/5.0 emerald star ratings.

### 4. Tailark Features Carousel (`#features`)
- **Left Column (4 Interactive Tabs with Progress Bars):**
  1. **Private Studio Interview:** Natural language prompt compilation into `behavior_rules.json`.
  2. **Pre-Flight Permission Audit:** Automated role hierarchy inspection with 100/100 safety score.
  3. **In-Browser Sandbox Simulator:** Test slash commands and responses before deployment.
  4. **Persistent Postgres State:** Dedicated ACID database preventing XP and ticket loss.
- **Right Column (Live Preview Chassis):**
  - Console header `Live Console v2.1` with automatic tab synchronization and pause-on-hover timer.

### 5. Enterprise Security Bento Grid (`#bento`)
- 6 enterprise-grade architecture cards:
  1. **Least Privilege Scoping:** Granular bitwise permission flags, zero Administrator permission requests.
  2. **Zero Token Sharing:** Direct OAuth2 PKCE handshake, zero token copy-pasting.
  3. **Self-Healing Gateway:** High-frequency reconnect daemon resyncing events in under 350ms.
  4. **Persistent ACID Database:** Point-in-time recovery for member XP and moderation tickets.
  5. **Deterministic Logic Compilation:** Formal grammar verification eliminating hallucinations.
  6. **Multi-Guild Central Dispatch:** Multi-tenant control plane across hundreds of server instances.

### 6. Production-Ready Bot Blueprints (`#templates`)
- 8 production Discord bot blueprints with live avatars, online status indicators, and deployment states:
  1. **Community Guardian** (AUTOMOD)
  2. **XP Economy & Shop** (ECONOMY)
  3. **AI Support Desk** (SUPPORT)
  4. **Live Stream Notifier** (MEDIA)
  5. **Welcome & Role Picker** (ONBOARDING)
  6. **Dynamic Voice Hub** (AUDIO & VOICE)
  7. **Knowledge Base AI** (AI ASSISTANT)
  8. **Tournament & Giveaways** (EVENTS)
- Dynamic interactive button: `Deploy Blueprint` transitions to `✓ Blueprint Deployed!`.

### 7. Transparent Pricing Tiers (`#pricing`)
- Interactive Monthly / Annual toggle with automatic 20% discount calculation.
- **Starter Trial ($0):** 3-day full access, no credit card required, 1 bot, 1 guild.
- **Corvus Pro ($10/mo or $8/mo billed annually):** Most Popular tier, 2 bots, 5 guilds, 2,000 AI credits, persistent Postgres database, 99.98% SLA.
- **Corvus Studio ($29/mo or $23/mo billed annually):** Agency tier, 8 bots, 100 guilds, 6,000 AI credits, dedicated static IP, custom SLA.

### 8. Frequently Asked Questions (`#faq`)
- Single-open smooth accordion answering questions regarding token safety, database persistence, legacy bot comparison, AI credit consumption, and role conflicts.

### 9. Product Changelog Newsletter & Final CTA (`#cta`)
- Newsletter subscription box with real-time feedback confirmation.
- High-impact closing CTA `Your Custom Discord Bot is 60 Seconds Away.` featuring button-in-button primary action.

### 10. Sticky Reveal Ambient Footer
- Footer emerging smoothly from behind the main page layout (`sticky bottom-0 z-0`).
- Blurred ambient background from `footer3.webp`.
- Verified status indicator: `Gateway: 99.98% Uptime · 14ms Latency`.

---

## 🚀 Running & Verifying the Prototype

Open `index.html` directly in any modern browser:
```powershell
Start-Process "C:\Users\xr3less\Desktop\corvus\Antigravity\index.html"
```
All dependencies (Tailwind CSS, Lenis Scroll, Lucide Icons, and local image/font assets) run independently without requiring external build servers.
