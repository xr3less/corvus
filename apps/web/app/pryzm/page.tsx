import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import styles from './pryzm.module.css';
import { PryzmEffects } from './islands';

export const metadata: Metadata = {
  title: 'Pryzm | Background & Visual Studio for Designers',
  description:
    'Pryzm is a visual studio for designers. Create original backgrounds and textures for your websites, templates, and designs in seconds, right in your browser.',
};

const BLUR_MASKS = [
  'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)',
  'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
  'linear-gradient(to bottom, black 0%, black 15%, transparent 60%)',
  'linear-gradient(to bottom, black 0%, transparent 45%)',
];

const BLUR_SIZES = [2, 4, 8, 16];

const BLOBS: CSSProperties[] = [
  { background: 'radial-gradient(circle at 40% 35%,#fda4af,#881337 70%)' },
  { background: 'radial-gradient(circle at 60% 60%,#fecdd3,#4c0519 75%)' },
  {
    background:
      'radial-gradient(circle,#fda4af 18%,transparent 19%),radial-gradient(circle,#fda4af 14%,transparent 15%)',
    backgroundColor: '#2a1215',
  },
  { background: 'radial-gradient(circle at 30% 70%,#fdba74,#7c2d12 70%)' },
  {
    background: 'radial-gradient(#fbcfe8 1px,transparent 1px)',
    backgroundColor: '#241016',
    backgroundSize: '6px 6px',
  },
  { background: 'radial-gradient(circle at 50% 50%,#fda4af,#7f1d1d 65%,#1c0a0a)' },
  { background: 'conic-gradient(from 40deg,#312e81,#818cf8,#1e1b4b,#312e81)' },
  {
    background: 'radial-gradient(circle,#fdba74 16%,transparent 17%)',
    backgroundColor: '#2a1a10',
    backgroundSize: '8px 8px',
  },
];

const WAVES: CSSProperties[] = [
  { background: 'repeating-radial-gradient(circle at 50% 120%,#fb7185,#7c2d12 12%,#111 22%)' },
  { background: 'repeating-radial-gradient(circle at 50% 50%,#fbbf24,#78350a 14%,#111 24%)' },
  { background: 'repeating-radial-gradient(circle at 20% 20%,#f472b6,#500f28 16%,#111 26%)' },
  { background: 'repeating-radial-gradient(circle at 80% 30%,#f97316,#431407 15%,#111 25%)' },
  { background: 'radial-gradient(circle at 50% 120%,#fbbf24,#111 70%)' },
  { background: 'conic-gradient(from 200deg at 60% 40%,#f59e0b,#111 40%,#f59e0b)' },
];

const PIXELATE: CSSProperties[] = [
  { background: 'conic-gradient(from 45deg at 50% 50%,#e9d5ff,#701a75,#e9d5ff)' },
  { background: 'conic-gradient(from 45deg at 50% 50%,#fecdd3,#881337,#fecdd3)' },
  { background: 'conic-gradient(from 45deg at 50% 50%,#fbcfe8,#500f28,#fbcfe8)' },
  { background: 'conic-gradient(from 45deg at 50% 50%,#ddd6fe,#4c1d95,#ddd6fe)' },
  { background: 'conic-gradient(from 45deg at 50% 50%,#f9a8d4,#831843,#f9a8d4)' },
];

const DITHER: CSSProperties[] = [
  { background: 'radial-gradient(circle at 30% 30%,#60a5fa,#172554 70%)' },
  { background: 'radial-gradient(circle at 70% 60%,#38bdf8,#0c4a6e 70%)' },
  { background: 'radial-gradient(circle at 50% 50%,#818cf8,#1e1b4b 70%)' },
  { background: 'radial-gradient(circle at 40% 60%,#a5b4fc,#020617 72%)' },
  { background: 'radial-gradient(circle at 60% 30%,#93c5fd,#1e3a8a 70%)' },
];

type Look = {
  odId: string;
  art: CSSProperties;
  alt: string;
  tag?: string;
  title: string;
  blurb: string;
  meta: string;
};

// Look thumbnails are CSS-only gradient paintings (KI-011): no raster assets,
// no hotlinks. Each gradient evokes the look it names, in the same 4:3 frame.
const LOOKS: Look[] = [
  {
    odId: 'look-card-ink-facet',
    art: {
      background:
        'repeating-linear-gradient(90deg, rgb(0 0 0 / 0.55) 0 3px, transparent 3px 10px), radial-gradient(ellipse at 50% 42%, #fda4af, #be185d 45%, #1c0a0f 100%)',
    },
    alt: 'Ink Facet — magenta beam behind fluted glass',
    tag: 'ProLab',
    title: 'Ink Facet',
    blurb:
      'A magenta beam blooming behind fluted glass, sliced into fine vertical bars against near black.',
    meta: 'gradient · beam · glass',
  },
  {
    odId: 'look-card-undergrowth',
    art: {
      background:
        'radial-gradient(circle at 42% 55%, rgb(134 239 172 / 0.35), transparent 46%), radial-gradient(circle at 70% 30%, #14532d, #052e16 70%, #020403 100%)',
    },
    alt: 'Undergrowth — figure blurred among dark leaves',
    tag: 'Pro',
    title: 'Undergrowth',
    blurb: 'A figure blurred among dark leaves, soft and nearly out of focus.',
    meta: 'grain',
  },
  {
    odId: 'look-card-pewter-fade',
    art: {
      background:
        'radial-gradient(circle at 62% 38%, rgb(251 191 36 / 0.5), transparent 52%), linear-gradient(160deg, #1e3a8a, #64748b 60%, #0f172a)',
    },
    alt: 'Pewter Fade — cool blue wash with warm bloom',
    title: 'Pewter Fade',
    blurb: 'A wash of cool blue lit by a warm bloom, blurred into a dreamlike square.',
    meta: 'grain',
  },
  {
    odId: 'look-card-pewter-stock',
    art: {
      background:
        'radial-gradient(circle at 50% 60%, rgb(163 230 53 / 0.28), transparent 44%), linear-gradient(180deg, #14532d, #052e16 55%, #020617)',
    },
    alt: 'Pewter Stock — lone figure in grainy green haze',
    tag: 'Pro',
    title: 'Pewter Stock',
    blurb: 'A lone figure adrift in a grainy green haze — moody and quietly cinematic.',
    meta: 'grain',
  },
  {
    odId: 'look-card-violets',
    art: {
      background:
        'radial-gradient(circle at 35% 40%, rgb(167 139 250 / 0.75), transparent 38%), radial-gradient(circle at 65% 62%, rgb(196 181 253 / 0.6), transparent 40%), linear-gradient(150deg, #312e81, #1e1b4b 65%, #0b0b1a)',
    },
    alt: 'Violets — flowers blurred behind frosted glass',
    tag: 'Pro',
    title: 'Violets',
    blurb:
      'A cluster of violets blurred behind frosted glass, bleeding color through a soft chromatic edge and grain.',
    meta: 'glass · grain · aberration',
  },
  {
    odId: 'look-card-bright-spark',
    art: {
      background:
        'radial-gradient(circle at 50% 50%, #f0abfc 0 12%, #c026d3 34%, #4a044e 68%, #0a0a0a 100%)',
    },
    alt: 'Bright Spark — hot magenta burst under frosted glass',
    title: 'Bright Spark',
    blurb: 'A hot magenta burst under frosted glass, softened with grain.',
    meta: 'glass · grain',
  },
  {
    odId: 'look-card-soft-blend',
    art: {
      background: 'linear-gradient(135deg, #4338ca, #1d4ed8 55%, #0c4a6e)',
    },
    alt: 'Soft Blend — quiet indigo to blue blend',
    title: 'Soft Blend',
    blurb: 'A quiet indigo-to-blue blend with just a whisper of grain.',
    meta: 'grain',
  },
  {
    odId: 'look-card-purple-haze',
    art: {
      background:
        'radial-gradient(circle at 50% 45%, #ddd6fe, #7c3aed 45%, #2e1065 78%, #0a0a0a 100%)',
    },
    alt: 'Purple Haze — soft violet glow behind frosted glass',
    tag: 'Pro',
    title: 'Purple Haze',
    blurb: 'A soft violet glow behind frosted glass, finished with a fine film grain.',
    meta: 'glass · grain',
  },
];

type Faq = { q: string; a: string };

const FAQS: Faq[] = [
  {
    q: "What's free, and what needs Pro?",
    a: 'The whole studio is open to explore with no account needed to start. Exporting needs a free account: free export goes up to Preview size — clean (no watermark) for PNG, watermarked for video. Pryzm Pro unlocks Small, HD, Full HD, 2K, and 4K output, removes the video watermark, and adds longer loops and higher frame rates.',
  },
  {
    q: 'Can I use what I make commercially?',
    a: "Absolutely. Backgrounds and loops you export are yours for personal and commercial projects. You just can't resell them as standalone stock.",
  },
  {
    q: 'Where do my images go?',
    a: 'Rendering happens entirely in your browser, so nothing leaves your device while you design. When you save a look, that look is stored privately in your account so you can reopen and keep editing it. Only you can see your saved looks, unless you choose to share one.',
  },
  {
    q: 'Can I share a look with a teammate?',
    a: 'Yes. Save it, press Share and turn on Allow remixing: you get a link that opens the look in their editor as a copy of their own. Your original is never touched, and turning the switch off stops the link at once.',
  },
  {
    q: 'What video formats can I export?',
    a: 'MP4 (H.264), WebM (VP9), and AV1, all as seamless loops. Free video exports are watermarked and at Preview size; Pro removes the watermark and unlocks Small, HD, Full HD, 2K, and 4K.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. Pryzm runs in the browser with real-time WebGL. Just open the studio and start.',
  },
  {
    q: 'How does Pryzm Pro billing work?',
    a: "Pryzm Pro is a subscription billed through Polar, monthly or yearly with three months free. Sign in, subscribe, and Pro unlocks on your account across devices. Cancel anytime, and you keep access through the end of the period you've paid for.",
  },
];

type PricingPlan = {
  odId: string;
  name: string;
  price: string;
  per: string;
  blurb: string;
  cta: string;
  ctaId: string;
  popular: boolean;
  features: string[];
};

const PRICING_PLANS: PricingPlan[] = [
  {
    odId: 'pricing-trial',
    name: 'Trial',
    price: '$0',
    per: 'for 3 days',
    blurb: 'Pro features for 3 days — 1 bot, 100 credits.',
    cta: 'Start free',
    ctaId: 'pricing-trial-cta',
    popular: false,
    features: [
      '1 bot for 1 server',
      '100 credits to spend on builds',
      'Every Pro feature unlocked',
      'Sleeps after the trial, nothing is deleted',
    ],
  },
  {
    odId: 'pricing-pro',
    name: 'Pro',
    price: '$10',
    per: 'per month',
    blurb: 'For bots that run every day.',
    cta: 'Start building',
    ctaId: 'pricing-pro-cta',
    popular: true,
    features: [
      '2 bots for up to 5 servers',
      '2000 credits per month (about 1800 builds)',
      'Exports included free',
      'Priority build queue',
    ],
  },
  {
    odId: 'pricing-studio',
    name: 'Studio',
    price: '$29',
    per: 'per month',
    blurb: 'For teams running many servers.',
    cta: 'Scale up',
    ctaId: 'pricing-studio-cta',
    popular: false,
    features: [
      '8 bots for up to 100 servers',
      '6000 credits per month',
      'Everything in Pro included',
    ],
  },
];

export default function PryzmPage() {
  // Parked route (KI-034): direct URLs 404 in production; dev is untouched.
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div className={styles.page}>
      <PryzmEffects />

      <header data-od-id="site-nav" id="siteNav" className={styles.siteHeader}>
        <div aria-hidden="true" className={styles.blurStack}>
          {BLUR_MASKS.map((mask, index) => (
            <div
              key={mask}
              className={styles.blurLayer}
              style={{
                backdropFilter: `blur(${BLUR_SIZES[index]}px)`,
                WebkitBackdropFilter: `blur(${BLUR_SIZES[index]}px)`,
                maskImage: mask,
                WebkitMaskImage: mask,
              }}
            />
          ))}
          <div
            className={styles.blurLayer}
            style={{
              background:
                'linear-gradient(to bottom, rgb(0 0 0 / 0.3), rgb(0 0 0 / 0.1), transparent)',
            }}
          />
        </div>
        <nav className={styles.navBar} aria-label="Primary">
          <div className={styles.navLeft}>
            <a data-od-id="nav-logo" href="#top" className={styles.logoLink}>
              <span className={styles.logoWord}>Pryzm</span>
            </a>
            <div className={styles.navLinks}>
              <a data-od-id="nav-inspiration" href="#remix" className={styles.navLink}>
                Inspiration
              </a>
              <a data-od-id="nav-lab" href="#flow" className={styles.navLink}>
                Lab <span className={`${styles.mono} ${styles.betaBadge}`}>BETA</span>
              </a>
              <a data-od-id="nav-pricing" href="#pricing" className={styles.navLink}>
                Pricing
              </a>
            </div>
          </div>
          <div className={styles.navActions}>
            <a
              data-od-id="nav-open-studio"
              href="#studio"
              className={`${styles.btnDark} ${styles.navCta}`}
            >
              Open studio
            </a>
            <a
              data-od-id="nav-signin"
              href="#cta"
              className={`${styles.btnDark} ${styles.navCta} ${styles.signinLink}`}
            >
              Sign in
            </a>
            <button
              data-od-id="nav-menu-btn"
              id="menuBtn"
              className={`${styles.btnDark} ${styles.menuBtn}`}
              aria-label="Open menu"
              aria-expanded="false"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M2 5h14M2 9h14M2 13h14" />
              </svg>
            </button>
          </div>
        </nav>
        <div id="mobileMenu" className={styles.mobileMenu}>
          <a href="#remix">Inspiration</a>
          <a href="#flow">Lab BETA</a>
          <a href="#pricing">Pricing</a>
          <a href="#cta">Sign in</a>
        </div>
      </header>

      <main id="top" className={styles.main}>
        <section data-od-id="hero" className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.heroBadgeWrap}>
              <span data-testid="hero-badge" className={styles.heroBadge}>
                <span className={styles.heroBadgeBox}>DRAFT</span>
                Private preview, members never see it
                <span aria-hidden="true" className={styles.heroBadgeDivider} />
              </span>
            </p>
            <h1
              data-od-id="hero-title"
              className={`${styles.display} ${styles.heroTitleCenter} ${styles.heroGradient}`}
            >
              <span className={styles.heroTitleLine}>
                Describe the{' '}
                <span className={styles.rotator}>
                  <span className={styles.rotWord}>bot</span>
                  <span className={styles.rotWord}>moderator</span>
                  <span className={styles.rotWord}>welcomer</span>
                  <span className={styles.rotWord}>guardian</span>
                </span>
              </span>{' '}
              <span className={styles.heroTitleLine}>your server needs</span>
            </h1>
            <p data-od-id="hero-sub" className={styles.heroCenterSub}>
              Corvus drafts every command, you approve each change, then you publish it live.
            </p>
            <div className={styles.heroCtaRow}>
              <a data-od-id="hero-secondary" href="#studio" className={styles.heroCtaGhost}>
                Watch it run first
              </a>
              <a data-od-id="hero-cta" href="/dashboard" className={styles.heroCtaPrimary}>
                Start building
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 8h11M9 3.5 13.5 8 9 12.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
            <div data-testid="hero-panel" className={styles.heroPanel}>
              <div className={styles.panelTop}>
                <span aria-hidden="true" className={styles.panelDots}>
                  <span className={styles.panelDot} />
                  <span className={styles.panelDot} />
                  <span className={styles.panelDot} />
                </span>
                <span className={styles.panelTitle}>Corvus draft preview</span>
                <span className={styles.panelChip}>Preview</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.panelSide} aria-label="Preview navigation">
                  <p className={styles.sideWorkspace}>My servers</p>
                  <p className={styles.sideQuick}>Quick create</p>
                  <div className={styles.sideNav}>
                    <span className={`${styles.sideItem} ${styles.sideActive}`}>Overview</span>
                    <span className={styles.sideItem}>Commands</span>
                    <span className={styles.sideItem}>Preview</span>
                    <span className={styles.sideItem}>Activity</span>
                    <span className={styles.sideItem}>Team</span>
                  </div>
                  <p className={styles.sideHeading}>Manage</p>
                  <div className={styles.sideNav}>
                    <span className={styles.sideItem}>Drafts</span>
                    <span className={styles.sideItem}>Publish log</span>
                    <span className={styles.sideItem}>Settings</span>
                  </div>
                </div>
                <div className={styles.panelMain}>
                  <div className={styles.statGrid}>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>/welcome drafts</p>
                      <p className={styles.statValue}>
                        3 <span className={styles.statExample}>(example)</span>
                      </p>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>Previews watched</p>
                      <p className={styles.statValue}>
                        12 <span className={styles.statExample}>(example)</span>
                      </p>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>Publishes</p>
                      <p className={styles.statValue}>
                        2 <span className={styles.statExample}>(example)</span>
                      </p>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>Uptime</p>
                      <p className={styles.statValue}>
                        99% <span className={styles.statExample}>(example)</span>
                      </p>
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <div className={styles.chartHead}>
                      <p className={styles.chartTitle}>Previews watched</p>
                      <div aria-hidden="true" className={styles.rangeTabs}>
                        <span className={styles.rangeTab}>Day</span>
                        <span className={`${styles.rangeTab} ${styles.rangeActive}`}>Week</span>
                        <span className={styles.rangeTab}>Month</span>
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 400 120"
                      aria-hidden="true"
                      focusable="false"
                      className={styles.chartSvg}
                    >
                      <defs>
                        <linearGradient id="heroChartFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FAFAFA" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#FAFAFA" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,90 C40,80 60,60 90,62 S150,80 180,55 S250,30 280,45 S340,70 400,40 L400,120 L0,120 Z"
                        fill="url(#heroChartFill)"
                      />
                      <path
                        d="M0,90 C40,80 60,60 90,62 S150,80 180,55 S250,30 280,45 S340,70 400,40"
                        fill="none"
                        stroke="#FAFAFA"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div aria-hidden="true" className={styles.chartX}>
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span>Sat</span>
                      <span>Sun</span>
                    </div>
                    <p className={styles.chartCaption}>
                      Mock preview activity <span className={styles.statExample}>(example)</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          data-od-id="studio-section"
          id="studio"
          className={`${styles.wrap} ${styles.studioSection}`}
        >
          <div className={`${styles.reveal} ${styles.studioShell}`}>
            <div className={styles.windowBar}>
              <span className={styles.windowDot} />
              <span className={styles.windowDot} />
              <span className={styles.windowDot} />
            </div>
            <div className={styles.studioGrid}>
              <div className={styles.iconRail} aria-hidden="true">
                <span className={styles.iconActive}>✳</span>
                <span>◐</span>
                <span>◫</span>
                <span>🗑</span>
                <span>❐</span>
                <span>🗀</span>
              </div>
              <div className={styles.effectsPane}>
                <p className={styles.effectsTitle}>Effects</p>
                <p className={styles.effectsLabel}>
                  Blobs <span className={styles.propsDim}>ⓘ</span>
                </p>
                <div className={styles.swatches} aria-hidden="true">
                  {BLOBS.map((swatch, index) => (
                    <span key={`blob-${index}`} className={styles.swatch} style={swatch} />
                  ))}
                </div>
                <p className={styles.effectsLabel}>Waves</p>
                <div className={styles.swatches} aria-hidden="true">
                  {WAVES.map((swatch, index) => (
                    <span key={`wave-${index}`} className={styles.swatch} style={swatch} />
                  ))}
                </div>
                <p className={styles.effectsLabel}>Pixelate</p>
                <div className={styles.swatches} aria-hidden="true">
                  {PIXELATE.map((swatch, index) => (
                    <span key={`pixel-${index}`} className={styles.swatch} style={swatch} />
                  ))}
                </div>
                <p className={styles.effectsLabel}>Dither</p>
                <div className={styles.swatches} aria-hidden="true">
                  {DITHER.map((swatch, index) => (
                    <span key={`dither-${index}`} className={styles.swatch} style={swatch} />
                  ))}
                </div>
                <p className={styles.effectsLabel}>Halftone</p>
              </div>
              <div className={styles.canvasPane}>
                <div className={styles.canvasToolbar}>
                  <span className={styles.toolChip}>✦ Randomize</span>
                  <span className={styles.toolChip}>⟳ Reset</span>
                  <span className={styles.toolChip}>▷ Animate</span>
                  <span className={styles.toolDim}>1.0×</span>
                  <span className={`${styles.toolChip} ${styles.toolChipPush}`}>⛶ ⊞ ⊟</span>
                  <span className={`${styles.toolChip} ${styles.toolChipFar}`}>⧉ Copy Look</span>
                  <span className={styles.toolChip}>💾 Save</span>
                  <span className={styles.toolExport}>⤓ Export</span>
                </div>
                <span
                  role="img"
                  aria-label="Studio canvas preview of a dotted halftone look"
                  className={styles.studioImg}
                />
              </div>
              <div className={styles.propsPane}>
                <div className={styles.propsHead}>
                  <p className={styles.propsTitle}>Props</p>
                  <p className={styles.propsDim}>↩ ↪</p>
                </div>
                <p className={styles.propsTitle} style={{ marginTop: '1rem' }}>
                  Gradient
                </p>
                <div className={styles.gradientBar} />
                <div className={styles.stopRow} aria-hidden="true">
                  <span
                    className={styles.stopDot}
                    style={{ border: '2px solid #f97316', background: '#000' }}
                  />
                  <span className={styles.stopDot} style={{ background: '#27272a' }} />
                  <span className={styles.stopDot} style={{ background: '#52525b' }} />
                  <span className={styles.stopDot} style={{ background: '#a1a1aa' }} />
                  <span className={styles.stopDot} style={{ background: '#e4e4e7' }} />
                </div>
                <div className={styles.colorRow}>
                  <span>Color</span>
                  <span className={styles.colorChip} />
                  <span className={`${styles.mono} ${styles.colorCode}`}>#0A0A0A</span>
                </div>
                <p className={styles.propsHint}>
                  Drag stops to reposition. Click the bar to add a stop (max 8).
                </p>
                <div className={styles.sliderStack}>
                  <div className={styles.sliderRow}>
                    <span>Opacity</span>
                    <span className={styles.val}>65%</span>
                  </div>
                  <input
                    type="range"
                    defaultValue={65}
                    className={styles.rangeInput}
                    aria-label="Opacity"
                    tabIndex={-1}
                  />
                  <div className={styles.sliderRow}>
                    <span>Shape</span>
                    <span className={styles.val}>Linear ⌄</span>
                  </div>
                  <div className={styles.sliderRow}>
                    <span>Angle</span>
                    <span className={styles.val}>220</span>
                  </div>
                  <input
                    type="range"
                    defaultValue={60}
                    className={styles.rangeInput}
                    aria-label="Angle"
                    tabIndex={-1}
                  />
                  <div className={styles.sliderRow}>
                    <span>Warp</span>
                    <span className={styles.val}>0.30</span>
                  </div>
                  <input
                    type="range"
                    defaultValue={30}
                    className={styles.rangeInput}
                    aria-label="Warp"
                    tabIndex={-1}
                  />
                  <div className={styles.sliderRow}>
                    <span>Flow</span>
                    <span className={styles.val}>0.00</span>
                  </div>
                  <input
                    type="range"
                    defaultValue={0}
                    className={styles.rangeInput}
                    aria-label="Flow"
                    tabIndex={-1}
                  />
                  <div className={styles.sliderRow}>
                    <span>Scale</span>
                    <span className={styles.val}>1.30</span>
                  </div>
                  <input
                    type="range"
                    defaultValue={65}
                    className={styles.rangeInput}
                    aria-label="Scale"
                    tabIndex={-1}
                  />
                  <div className={styles.sliderRow}>
                    <span>Detail</span>
                    <span className={styles.val}>1</span>
                  </div>
                  <input
                    type="range"
                    defaultValue={20}
                    className={styles.rangeInput}
                    aria-label="Detail"
                    tabIndex={-1}
                  />
                  <div className={styles.sliderRow}>
                    <span>Contrast</span>
                    <span className={styles.val}>1.10</span>
                  </div>
                  <input
                    type="range"
                    defaultValue={55}
                    className={styles.rangeInput}
                    aria-label="Contrast"
                    tabIndex={-1}
                  />
                </div>
                <div className={styles.propsGroup}>
                  <span>Optics</span>
                  <span className={styles.propsDim}>⌄</span>
                </div>
                <div className={styles.propsGroup}>
                  <span>Light</span>
                  <span className={styles.propsDim}>⌄</span>
                </div>
              </div>
            </div>
          </div>
          <p className={styles.tryRow}>
            <a data-od-id="studio-try" href="#cta" className={styles.textLink}>
              Try the Studio <span aria-hidden="true">→</span>
            </a>
          </p>
        </section>

        <section
          data-od-id="flow-section"
          id="flow"
          className={`${styles.wrap} ${styles.flowSection}`}
        >
          <div className={styles.reveal}>
            <p className={styles.eyebrow}>Flow</p>
            <div className={styles.flowHead}>
              <div className={styles.flowHeadMain}>
                <h2 className={`${styles.display} ${styles.h2}`}>Wire it up as a graph</h2>
                <p className={styles.sectionSub}>
                  Feed a gradient and effects into a base and watch it resolve live.
                </p>
              </div>
              <a
                data-od-id="flow-cta"
                href="#cta"
                className={`${styles.btnDark} ${styles.flowCta}`}
              >
                Open Flow <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <div
            data-od-id="flow-graph"
            className={`${styles.reveal} ${styles.flowGraph} ${styles.dotbg}`}
          >
            <div
              className={`${styles.nodeCard} ${styles.flowNode}`}
              style={{ left: '6%', top: '12%' }}
            >
              <div className={styles.nodeHead}>
                <span className={styles.nodeTitle}>Gradient</span>
                <span className={`${styles.mono} ${styles.nodeTag}`}>SOURCE</span>
              </div>
              <div className={styles.nodeBar} />
              <p className={styles.nodeLabel}>Angle</p>
              <input
                type="range"
                defaultValue={40}
                className={styles.rangeInput}
                style={{ marginTop: '0.25rem' }}
                aria-label="Gradient angle"
                tabIndex={-1}
              />
            </div>
            <div
              className={styles.flowGhostStack}
              style={{ left: '6%', top: '52%' }}
              aria-hidden="true"
            >
              <div className={`${styles.nodeCard} ${styles.flowGhost}`} />
              <div className={`${styles.nodeCard} ${styles.flowGhost}`} />
              <div className={`${styles.nodeCard} ${styles.flowGhost}`} />
            </div>
            <svg
              className={styles.flowEdges}
              style={{ left: '23%', top: '20%', width: '22%', height: '60%' }}
              viewBox="0 0 200 200"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="8" cy="60" r="7" stroke="#71717a" strokeWidth="2" fill="#000" />
              <circle cx="8" cy="60" r="2.5" fill="#71717a" />
              <path
                d="M15 60 C 80 60, 60 150, 190 150"
                stroke="#52525b"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <circle cx="8" cy="110" r="7" stroke="#71717a" strokeWidth="2" fill="#000" />
              <circle cx="8" cy="110" r="2.5" fill="#71717a" />
              <path
                d="M15 110 C 70 110, 70 155, 190 155"
                stroke="#52525b"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <circle cx="8" cy="160" r="7" stroke="#71717a" strokeWidth="2" fill="#000" />
              <circle cx="8" cy="160" r="2.5" fill="#71717a" />
              <path
                d="M15 160 C 60 160, 80 160, 190 160"
                stroke="#52525b"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
            </svg>
            <div
              className={`${styles.nodeCard} ${styles.flowPreview}`}
              style={{ left: '46%', top: '30%' }}
            >
              <div className={styles.nodeHead}>
                <span className={styles.nodeTitle}>Base</span>
                <span className={`${styles.mono} ${styles.nodeTag}`}>PREVIEW</span>
              </div>
              <div className={styles.flowPreviewBar} />
            </div>
          </div>
        </section>

        <section
          data-od-id="remix-section"
          id="remix"
          className={`${styles.wrap} ${styles.remixSection}`}
        >
          <div className={`${styles.remixHead} ${styles.reveal}`}>
            <div>
              <p className={styles.eyebrow}>Remix</p>
              <h2 className={`${styles.display} ${styles.sectionTitle}`}>
                Never start from a blank canvas
              </h2>
              <p className={styles.sectionSub} style={{ fontSize: '16px' }}>
                Click any look to remix it in the studio and make it your own.
              </p>
            </div>
            <a
              data-od-id="remix-browse"
              href="#remix"
              className={`${styles.btnGhost} ${styles.remixCta}`}
            >
              Browse inspiration
            </a>
          </div>
          <div data-od-id="remix-grid" className={styles.remixGrid}>
            {LOOKS.map((look) => (
              <article
                key={look.odId}
                data-od-id={look.odId}
                className={`${styles.card} ${styles.lookCard} ${styles.reveal}`}
              >
                <div className={styles.lookImgWrap}>
                  <span
                    role="img"
                    aria-label={look.alt}
                    className={styles.thumb}
                    style={look.art}
                  />
                </div>
                <div className={styles.lookBody}>
                  {look.tag !== undefined && (
                    <p className={`${styles.lookTag} ${styles.mono}`}>{look.tag}</p>
                  )}
                  <h3 className={styles.lookTitle}>{look.title}</h3>
                  <p className={styles.lookBlurb}>{look.blurb}</p>
                  <p className={`${styles.lookMeta} ${styles.mono}`}>{look.meta}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section data-od-id="embed-section" className={`${styles.wrap} ${styles.embedSection}`}>
          <div className={`${styles.reveal} ${styles.embedInner}`}>
            <p className={styles.eyebrow}>Embed</p>
            <h2 className={`${styles.display} ${styles.sectionTitle}`}>
              Ship it as code, not a video
            </h2>
            <p className={styles.sectionSub} style={{ fontSize: '16px' }}>
              Export any look as a live background for Framer, React or plain HTML. It stays sharp
              at any size, fills any shape, animates without a video file, and nothing about it
              depends on us.
            </p>
            <a href="#studio" className={`${styles.btnGhost} ${styles.embedCta}`}>
              Try it in the studio
            </a>
          </div>
          <div className={`${styles.reveal} ${styles.embedGrid}`}>
            <div className={`${styles.card} ${styles.codeCard}`}>
              <p className={`${styles.mono} ${styles.codeLabel}`}>PryzmBackground.jsx</p>
              <pre className={`${styles.mono} ${styles.codeBlock}`}>
                <code>
                  <span className={styles.tokKeyword}>import</span>
                  {' { PryzmBackground } '}
                  <span className={styles.tokKeyword}>from</span>{' '}
                  <span className={styles.tokString}>"./PryzmBackground"</span>
                  {'\n\n<'}
                  <span className={styles.tokTag}>PryzmBackground</span>
                  {'\n  style={{ width: '}
                  <span className={styles.tokNum}>500</span>
                  {', height: '}
                  <span className={styles.tokNum}>400</span>
                  {' }} />'}
                </code>
              </pre>
              <p className={styles.codeNote}>
                The exported component runs live in the browser, at any size, instead of a
                multi-megabyte video.
              </p>
            </div>
            <div className={`${styles.card} ${styles.embedVisual} ${styles.grain}`}>
              <span
                role="img"
                aria-label="Live exported background running in a browser frame"
                className={styles.embedImg}
              />
              <span className={`${styles.mono} ${styles.liveBadge}`}>live · 500 × 400 · 12 KB</span>
            </div>
          </div>
        </section>

        <section
          data-od-id="pricing-section"
          id="pricing"
          className={`${styles.wrap} ${styles.pricingSection}`}
        >
          <div className={styles.reveal}>
            <p className={styles.eyebrow}>Pricing</p>
            <h2 className={`${styles.display} ${styles.sectionTitle}`}>Simple, honest pricing</h2>
            <p className={styles.pricingLead}>
              Start with 3 days of Pro features — 1 bot and 100 credits, no card required.
            </p>
          </div>
          <div className={`${styles.priceGrid} ${styles.priceGridThree}`}>
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.odId}
                data-od-id={plan.odId}
                className={`${styles.card} ${styles.priceCard} ${styles.tierCard} ${plan.popular ? styles.tierPopular : ''} ${styles.reveal}`}
              >
                {plan.popular && <span className={styles.popularBadge}>Popular</span>}
                <h3 className={styles.planName}>{plan.name}</h3>
                <p className={styles.priceLine}>
                  <span className={`${styles.display} ${styles.priceFigure}`}>{plan.price}</span>{' '}
                  <span className={styles.pricePer}>{plan.per}</span>
                </p>
                <p className={styles.planBlurb}>{plan.blurb}</p>
                <ul className={styles.priceList}>
                  {plan.features.map((feature) => (
                    <li key={feature} className={styles.tierItem}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        aria-hidden="true"
                        focusable="false"
                        className={styles.tierTick}
                      >
                        <path
                          d="M2.5 7.5 5.5 10.5 11.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  data-od-id={plan.ctaId}
                  href="/dashboard"
                  className={`${plan.popular ? styles.btnPrimary : styles.btnGhost} ${styles.priceCta}`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </section>

        <section data-od-id="faq-section" id="faq" className={styles.faqSection}>
          <h2 className={`${styles.display} ${styles.faqTitle} ${styles.reveal}`}>
            Good questions, answered.
          </h2>
          <div className={styles.faqList} id="faqList">
            {FAQS.map((faq) => (
              <div
                key={faq.q}
                className={`${styles.card} ${styles.faqItem} ${styles.reveal}`}
                data-testid="faq-item"
                data-open="false"
              >
                <button className={styles.faqQ}>
                  {faq.q}
                  <span className={styles.faqPlus}>+</span>
                </button>
                <div className={styles.faqA}>
                  <div className={styles.faqAInner}>
                    <p className={styles.faqText}>{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section data-od-id="loop-section" className={`${styles.wrap} ${styles.loopSection}`}>
          <div className={`${styles.reveal} ${styles.card} ${styles.loopCard} ${styles.grain}`}>
            <span aria-hidden="true" className={styles.loopBg} />
            <div className={styles.loopShade} aria-hidden="true" />
            <div className={styles.loopInner}>
              <h2 className={`${styles.display} ${styles.loopTitle}`}>Stay in the loop</h2>
              <p className={styles.loopSub}>
                Hear when we ship a new effect or add a look worth stealing.
              </p>
              <form data-od-id="loop-form" id="loopForm" className={styles.loopForm}>
                <label className={styles.srOnly} htmlFor="loopEmail">
                  Email address
                </label>
                <input
                  id="loopEmail"
                  type="email"
                  required
                  placeholder="Email address"
                  className={styles.emailInput}
                />
                <button type="submit" className={`${styles.btnPrimary} ${styles.loopSubmit}`}>
                  Subscribe
                </button>
              </form>
              <p id="loopMsg" className={styles.loopMsg} role="status" />
              <p className={styles.loopNote}>
                Occasional product emails. Unsubscribe in one click, anytime.
              </p>
            </div>
          </div>
        </section>

        <section data-od-id="cta-section" id="cta" className={styles.ctaSection}>
          <h2 className={`${styles.display} ${styles.ctaTitle} ${styles.reveal}`}>
            Your next background
            <br />
            is a minute away.
          </h2>
          <p className={`${styles.ctaSub} ${styles.reveal}`}>
            Open the studio and make something no one else has.
          </p>
          <div className={`${styles.ctaRow} ${styles.reveal}`}>
            <a
              data-od-id="cta-open-studio"
              href="#studio"
              className={`${styles.btnPrimary} ${styles.ctaPrimary}`}
            >
              Open studio
            </a>
            <a
              data-od-id="cta-pricing"
              href="#pricing"
              className={`${styles.btnGhost} ${styles.ctaSecondary}`}
            >
              See pricing
            </a>
          </div>
          <p className={`${styles.ctaNote} ${styles.reveal}`}>
            Built for design work, personal or commercial.
          </p>
        </section>
      </main>

      <footer data-od-id="site-footer" className={styles.siteFooter}>
        <div aria-hidden="true" className={styles.footerBg}>
          <div className={styles.footerBlur}>
            <span aria-hidden="true" className={styles.footerBlurImg} />
          </div>
          <div className={styles.footerShade} />
        </div>
        <div className={styles.footerInner}>
          <div className={styles.footerTop}>
            <div className={styles.footerBrandCol}>
              <a href="#top" className={styles.footerLogo} data-od-id="footer-logo">
                <span className={styles.logoWord}>Pryzm</span>
              </a>
              <p className={styles.footerTagline}>
                Original backgrounds and animated loops, made in your browser.
              </p>
              <div className={styles.footFormWrap}>
                <p className={styles.footFormTitle}>New features &amp; gallery drops</p>
                <form data-od-id="footer-form" id="footForm" className={styles.footForm}>
                  <label className={styles.srOnly} htmlFor="footEmail">
                    Email address
                  </label>
                  <input
                    id="footEmail"
                    type="email"
                    required
                    placeholder="you@example.com"
                    className={styles.footInput}
                  />
                  <button className={styles.footSubmit} type="submit">
                    Subscribe
                  </button>
                </form>
              </div>
            </div>
            <div className={styles.footerCols}>
              <nav aria-label="Product" className={styles.footerNav}>
                <p className={styles.footerNavTitle}>Product</p>
                <a className={styles.footerLink} href="#studio">
                  Studio
                </a>
                <a className={styles.footerLink} href="#remix">
                  Inspiration
                </a>
                <a className={styles.footerLink} href="#flow">
                  Flow
                </a>
                <a className={styles.footerLink} href="#top">
                  Blog
                </a>
                <a className={styles.footerLink} href="#pricing">
                  Pricing
                </a>
              </nav>
              <nav aria-label="Help" className={styles.footerNav}>
                <p className={styles.footerNavTitle}>Help</p>
                <a className={styles.footerLink} href="#faq">
                  About
                </a>
                <a className={styles.footerLink} href="#faq">
                  Docs
                </a>
                <a className={styles.footerLink} href="#faq">
                  Support
                </a>
                <a className={styles.footerLink} href="#faq">
                  Privacy
                </a>
                <a className={styles.footerLink} href="#faq">
                  Terms
                </a>
              </nav>
              <nav aria-label="Elsewhere" className={styles.footerNav}>
                <p className={styles.footerNavTitle}>Elsewhere</p>
                <a href="#top" className={styles.footerLink}>
                  Framer templates
                </a>
                <a href="#top" className={styles.footerLink}>
                  X / Twitter
                </a>
              </nav>
            </div>
          </div>
          <div className={styles.footerBase}>
            <p>
              © 2026 Pryzm · by <a href="#top">Ava Thiery</a> · study clone
            </p>
            <p>Runs in your browser</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
