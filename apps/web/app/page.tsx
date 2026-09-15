import type { Metadata } from 'next';
import { Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { ArrowRight, Check, Menu, Play, ShieldCheck, X } from 'lucide-react';
import styles from './landing.module.css';
import { LandingEffects, VelarisCanvas } from './landing-islands';

export const metadata: Metadata = {
  title: 'Corvus - Build a Discord Bot With Plain Words',
  description:
    'The no-code bot builder for Discord communities: describe your bot in plain English and test it before it goes live. 3-day free trial, no card required.',
};

// next/font/google (latin, display-swap). If the Google font fetch fails,
// Plus Jakarta Sans falls back to the system sans stack and mono falls back to
// system mono via the CSS stacks in landing.module.css.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});
const mono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--landing-mono',
});

const DISCORD_PATH =
  'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z';

const NAV_LINKS = [
  { href: '#bento', label: 'Features' },
  { href: '#bento', label: 'Architecture' },
  { href: '#templates', label: 'Showcase' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const FAQS = [
  {
    q: 'Do I ever need to share my bot token or credentials?',
    a: 'Never. You sign in with Discord - we never see or store your password or token. The bot only gets the permissions you approve, nothing more.',
  },
  {
    q: 'What happens to my guild data and XP records if my trial expires?',
    a: 'Nothing is lost. Your settings, member XP and your bot\u2019s setup are kept safe. If your subscription ends, your bot naps until you come back - you can wake it up anytime or take your data with you.',
  },
  {
    q: 'How does Corvus differ from legacy bots like MEE6 or Dyno?',
    a: 'Legacy bots charge you per server for fixed features you cannot change without code. With Corvus, you describe what you want in plain words. Your bot fits your community, and one subscription covers multiple servers, all managed in one place.',
  },
  {
    q: 'How do AI credits work for dynamic interactions and moderation?',
    a: 'Everyday jobs (giving roles, running commands, counting XP, enforcing rules) are free and never touch your credits. Credits go only to AI work: building from your descriptions and smart replies (about 1.1 credits per build). The 2,000 credits in Pro last most communities for months.',
  },
  {
    q: 'I already have other bots installed. Will role permissions conflict?',
    a: 'No. Before joining, Corvus checks your server\u2019s roles and permissions and tells you in plain words where the bot should sit, so it never fights your other bots.',
  },
];

function BrandMark() {
  return (
    <span className={styles.brandBadge} aria-hidden="true">
      <svg
        className={styles.brandGlyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2L3 9l9 7 9-7-9-7z" />
        <path d="M5 12l7 5 7-5" />
        <path d="M7 16l5 4 5-4" />
      </svg>
    </span>
  );
}

export default function HomePage() {
  return (
    <div className={`${jakarta.className} ${mono.variable} ${styles.page}`}>
      <a href="#top" className={styles.skip}>
        Skip to content
      </a>

      <header id="siteNav" className={styles.nav}>
        <div aria-hidden="true" className={styles.blurStack}>
          <div
            className={styles.blurLayer}
            style={{
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              maskImage: 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)',
            }}
          />
          <div
            className={styles.blurLayer}
            style={{
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              maskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
            }}
          />
          <div
            className={styles.blurLayer}
            style={{
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              maskImage: 'linear-gradient(to bottom, black 0%, black 15%, transparent 60%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 15%, transparent 60%)',
            }}
          />
          <div
            className={styles.blurLayer}
            style={{
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              maskImage: 'linear-gradient(to bottom, black 0%, transparent 45%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 45%)',
            }}
          />
          <div className={styles.blurShade} />
        </div>

        <nav className={styles.navInner} aria-label="Main Navigation">
          <div className={styles.brandCluster}>
            <a href="#top" className={styles.brand} aria-label="Corvus Home">
              <BrandMark />
              <span className={styles.brandName}>CORVUS</span>
            </a>
            <div className={styles.navLinks}>
              {NAV_LINKS.map((link) => (
                <a key={link.label} href={link.href} className={styles.navLink}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className={styles.navCtas}>
            <a href="/demo" className={`${styles.btnDark} ${styles.demoBtn}`}>
              Interactive Demo
            </a>
            <a href="/api/auth/login" className={`${styles.btnPrimary} ${styles.signBtn}`}>
              <svg className={styles.signGlyph} viewBox="0 0 24 24" fill="currentColor">
                <path d={DISCORD_PATH} />
              </svg>
              Sign in with Discord
            </a>
            <button
              id="menuBtn"
              className={`${styles.btnDark} ${styles.menuBtn}`}
              aria-label="Toggle Navigation"
              aria-expanded="false"
              type="button"
            >
              <Menu size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </nav>

        <div id="mobileMenu" className={styles.mobileMenu}>
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} className={styles.drawerLink}>
              {link.label}
            </a>
          ))}
          <div className={styles.drawerCtas}>
            <a href="/demo" className={`${styles.btnDark} ${styles.drawerBtn}`}>
              Interactive Demo
            </a>
            <a href="/api/auth/login" className={`${styles.btnPrimary} ${styles.drawerBtn}`}>
              Sign in with Discord
            </a>
          </div>
        </div>
      </header>

      <main id="top" className={styles.main}>
        <section id="how-it-works" className={styles.hero}>
          <VelarisCanvas />
          <div
            aria-hidden="true"
            className={styles.heroGlow}
            style={{
              background:
                'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(255,255,255,0.06), transparent 70%)',
            }}
          />

          <div className={styles.heroContainer}>
            <div className={`${styles.heroCopy} ${styles.reveal}`}>
              <div className={styles.badge}>
                <span>No code | No token paste | 3-day free trial</span>
              </div>

              <h1 className={`${styles.display} ${styles.h1}`}>
                Build Custom AI Discord Bots in Minutes, Not Weeks
              </h1>

              <p className={styles.heroSub}>
                Stop paying for 4-5 rigid bots on every server. Describe the bot your community
                needs, in plain English - no code, no token paste.
              </p>

              <div className={styles.ctaRow}>
                <a href="/dashboard" className={styles.ctaTrial}>
                  <span>Start 3-Day Free Trial</span>
                  <span className={styles.ctaTrialCircle} aria-hidden="true">
                    <ArrowRight size={16} strokeWidth={2.5} />
                  </span>
                </a>
                <a href="/demo" className={styles.ctaDemo}>
                  <Play size={16} className={styles.playGlyph} aria-hidden="true" />
                  <span>Interactive Demo</span>
                </a>
              </div>
            </div>

            <div className={`${styles.frameWrap} ${styles.reveal}`}>
              <div aria-hidden="true" className={styles.frameGlow} />

              <div className={styles.frame}>
                <div className={styles.frameBar}>
                  <div className={styles.frameBarLeft}>
                    <div className={styles.frameTitle}>
                      <span className={styles.liveDot} aria-hidden="true" />
                      <span className={styles.frameTitleText}>Corvus AI Studio</span>
                    </div>
                    <span className={styles.frameSep} aria-hidden="true">
                      /
                    </span>
                    <span className={`${styles.mono} ${styles.frameUrl}`}>
                      corvus.ai/studio/sentinel-prime
                    </span>
                  </div>
                  <div className={styles.frameBarRight}>
                    <span className={styles.framePill}>
                      <ShieldCheck size={12} strokeWidth={2.5} aria-hidden="true" />
                      No token paste needed
                    </span>
                  </div>
                </div>

                <div className={styles.frameImgWrap}>
                  <img
                    src="/landing/dashboard-hero.jpg"
                    alt="Corvus AI Studio Dashboard - Real-time Bot Configuration Console"
                    className={styles.frameImg}
                    loading="eager"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="bento" className={styles.bento}>
          <div className={styles.wrapWide}>
            <div className={`${styles.bentoHead} ${styles.reveal}`}>
              <h2 className={`${styles.display} ${styles.h2center}`}>Three things we promise.</h2>
              <p className={styles.lede}>Written down because you shouldn&rsquo;t have to ask.</p>
            </div>

            <div className={styles.blockStack}>
              <div className={styles.blockGrid}>
                <div className={styles.blockText}>
                  <h3 className={`${styles.display} ${styles.blockTitle}`}>
                    Your server. Your bot. No surprises.
                  </h3>
                  <p className={styles.blockPara}>
                    Sign in with Discord. We never see your password or bot token. You can leave
                    anytime &mdash; take your bot with you.
                  </p>
                  <ul className={styles.checkList}>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Sign in with Discord, no password to remember
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Your data and bot come with you if you leave
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      No admin access to your server, ever
                    </li>
                  </ul>
                </div>
                <div className={styles.panelCol}>
                  <div className={styles.panel}>
                    <div className={styles.panelPad}>
                      <div className={styles.panelLabel}>Permission preview</div>
                      <ul className={styles.permList}>
                        <li className={styles.permItem}>
                          <Check
                            size={12}
                            className={`${styles.mono} ${styles.permOk}`}
                            aria-hidden="true"
                          />
                          Send Messages
                        </li>
                        <li className={styles.permItem}>
                          <Check
                            size={12}
                            className={`${styles.mono} ${styles.permOk}`}
                            aria-hidden="true"
                          />
                          Kick Members
                        </li>
                        <li className={styles.permItem}>
                          <Check
                            size={12}
                            className={`${styles.mono} ${styles.permOk}`}
                            aria-hidden="true"
                          />
                          Manage Messages
                        </li>
                        <li className={styles.permItem}>
                          <Check
                            size={12}
                            className={`${styles.mono} ${styles.permOk}`}
                            aria-hidden="true"
                          />
                          View Audit Log
                        </li>
                        <li className={`${styles.permItem} ${styles.struck}`}>
                          <X
                            size={12}
                            className={`${styles.mono} ${styles.permNo}`}
                            aria-hidden="true"
                          />
                          Administrator
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.blockGrid}>
                <div className={`${styles.panelCol} ${styles.panelFirst}`}>
                  <div className={styles.panel}>
                    <div className={styles.panelPad}>
                      <div className={styles.panelLabel}>Overnight update, member view</div>
                      <ul className={styles.timeList}>
                        <li className={styles.timeItem}>
                          <span className={styles.timeDot} aria-hidden="true" />
                          <div>
                            <div className={styles.timeTitle}>
                              Update installed in the background
                            </div>
                            <div className={styles.timeSub}>bot stayed online the whole time</div>
                          </div>
                        </li>
                        <li className={styles.timeItem}>
                          <span className={styles.timeDot} aria-hidden="true" />
                          <div>
                            <div className={styles.timeTitle}>Every XP record kept</div>
                            <div className={styles.timeSub}>
                              roles, warnings and balances untouched
                            </div>
                          </div>
                        </li>
                        <li className={styles.timeItem}>
                          <span className={styles.timeDot} aria-hidden="true" />
                          <div>
                            <div className={styles.timeTitle}>Nobody noticed a thing</div>
                            <div className={styles.timeSub}>zero downtime for your members</div>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className={`${styles.blockText} ${styles.textSecond}`}>
                  <h3 className={`${styles.display} ${styles.blockTitle}`}>
                    Always on. Always remembered.
                  </h3>
                  <p className={styles.blockPara}>
                    Your community&rsquo;s XP, roles, and history stick around. Restarts and updates
                    happen without anyone noticing.
                  </p>
                  <ul className={styles.checkList}>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Your community&rsquo;s XP and roles survive every restart
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Updates happen in the background, no downtime
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      12 months of data kept, even after you stop paying
                    </li>
                  </ul>
                </div>
              </div>

              <div className={styles.blockGrid}>
                <div className={styles.blockText}>
                  <h3 className={`${styles.display} ${styles.blockTitle}`}>
                    Describe it. We build it.
                  </h3>
                  <p className={styles.blockPara}>
                    Tell us what your bot should do. In plain English. We&rsquo;ll make it, test it
                    on a practice server, and put it on your server.
                  </p>
                  <ul className={styles.checkList}>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Plain English setup, no code
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Test on a practice server before going live
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Change anything anytime, no developer needed
                    </li>
                  </ul>
                </div>
                <div className={styles.panelCol}>
                  <div className={styles.panel}>
                    <div className={styles.panelPad}>
                      <div className={styles.panelLabel}>Your bot, in plain English</div>
                      <div className={styles.convo}>
                        <div className={styles.convoRow}>
                          <span className={styles.convoWho}>You</span>
                          <span className={styles.convoTextDim}>
                            A welcome message in #general when someone joins.
                          </span>
                        </div>
                        <div className={styles.convoRow}>
                          <span className={`${styles.convoWho} ${styles.convoWhoAi}`}>Corvus</span>
                          <span className={styles.convoTextBright}>
                            Got it. Welcoming new members in #general with their username.
                          </span>
                        </div>
                        <div className={styles.convoRow}>
                          <span className={styles.convoWho}>You</span>
                          <span className={styles.convoTextDim}>
                            Also give them the @Member role automatically.
                          </span>
                        </div>
                        <div className={styles.convoRow}>
                          <span className={`${styles.convoWho} ${styles.convoWhoAi}`}>Corvus</span>
                          <span className={styles.convoTextBright}>
                            Done. Your bot is ready to test.
                          </span>
                        </div>
                      </div>
                      <a href="#templates" className={styles.convoLink}>
                        Browse templates
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="templates" className={styles.templates}>
          <div className={`${styles.templatesHead} ${styles.reveal}`}>
            <div>
              <h2 className={`${styles.display} ${styles.templatesTitle}`}>
                Start from a template
              </h2>
              <p className={styles.templatesLede}>
                Pick one, make it yours with plain-English tweaks, and test it before it goes live.
              </p>
            </div>
            <a href="#pricing" className={`${styles.btnGhost} ${styles.ghostCta}`}>
              <span>All templates included - start free</span>
              <span className={styles.arrowGlyph} aria-hidden="true">
                →
              </span>
            </a>
          </div>

          <svg width="0" height="0" className={styles.spriteDef} aria-hidden="true">
            <symbol id="discordGlyph" viewBox="0 0 24 24">
              <path fill="currentColor" d={DISCORD_PATH} />
            </symbol>
          </svg>

          <div className={styles.templateGrid}>
            <article className={`${styles.tCard} ${styles.reveal}`}>
              <div>
                <div className={styles.tTileWrap}>
                  <div className={styles.tile}>
                    <div
                      aria-hidden="true"
                      className={styles.tileGlow}
                      style={{
                        background:
                          'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(16,185,129,0.18), transparent 70%)',
                      }}
                    />
                    <svg className={styles.tileGlyph} viewBox="0 0 24 24" aria-hidden="true">
                      <use href="#discordGlyph" />
                    </svg>
                    <div className={styles.tilePill}>
                      <span>Template</span>
                    </div>
                    <div className={`${styles.tileTag} ${styles.tileTagEmerald}`}>AUTOMOD</div>
                  </div>
                </div>

                <div className={styles.tBody}>
                  <div className={styles.tMeta}>
                    <span>General & Gaming Guilds</span>
                  </div>
                  <div className={styles.tTitleRow}>
                    <h3 className={styles.tTitle}>Community Guardian</h3>
                    <span className={styles.botBadge}>BOT</span>
                  </div>
                  <p className={styles.tDesc}>
                    Blocks spam, filters toxic messages, stops raids, and keeps a log of what
                    happened.
                  </p>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>#anti-spam</span>
                    <span className={styles.tag}>#auto-mute</span>
                    <span className={styles.tag}>#raid-shield</span>
                  </div>
                </div>
              </div>

              <div className={styles.tFoot}>
                <a href="/gallery" className={styles.tBtn}>
                  <span>Use this template</span>
                </a>
              </div>
            </article>

            <article className={`${styles.tCard} ${styles.reveal}`}>
              <div>
                <div className={styles.tTileWrap}>
                  <div className={styles.tile}>
                    <div
                      aria-hidden="true"
                      className={styles.tileGlow}
                      style={{
                        background:
                          'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(56,189,248,0.18), transparent 70%)',
                      }}
                    />
                    <svg className={styles.tileGlyph} viewBox="0 0 24 24" aria-hidden="true">
                      <use href="#discordGlyph" />
                    </svg>
                    <div className={styles.tilePill}>
                      <span>Template</span>
                    </div>
                    <div className={`${styles.tileTag} ${styles.tileTagSky}`}>SUPPORT</div>
                  </div>
                </div>

                <div className={styles.tBody}>
                  <div className={styles.tMeta}>
                    <span>SaaS & Commerce</span>
                  </div>
                  <div className={styles.tTitleRow}>
                    <h3 className={styles.tTitle}>AI Support Desk</h3>
                    <span className={styles.botBadge}>BOT</span>
                  </div>
                  <p className={styles.tDesc}>
                    Answers common questions itself, opens private help threads for your staff, and
                    saves transcripts.
                  </p>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>#ai-deflection</span>
                    <span className={styles.tag}>#transcripts</span>
                    <span className={styles.tag}>#private-threads</span>
                  </div>
                </div>
              </div>

              <div className={styles.tFoot}>
                <a href="/gallery" className={styles.tBtn}>
                  <span>Use this template</span>
                </a>
              </div>
            </article>

            <article className={`${styles.tCard} ${styles.reveal}`}>
              <div>
                <div className={styles.tTileWrap}>
                  <div className={styles.tile}>
                    <div
                      aria-hidden="true"
                      className={styles.tileGlow}
                      style={{
                        background:
                          'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(251,113,133,0.18), transparent 70%)',
                      }}
                    />
                    <svg className={styles.tileGlyph} viewBox="0 0 24 24" aria-hidden="true">
                      <use href="#discordGlyph" />
                    </svg>
                    <div className={styles.tilePill}>
                      <span>Template</span>
                    </div>
                    <div className={`${styles.tileTag} ${styles.tileTagRose}`}>ONBOARDING</div>
                  </div>
                </div>

                <div className={styles.tBody}>
                  <div className={styles.tMeta}>
                    <span>Community & Social Clubs</span>
                  </div>
                  <div className={styles.tTitleRow}>
                    <h3 className={styles.tTitle}>Welcome & Role Picker</h3>
                    <span className={styles.botBadge}>BOT</span>
                  </div>
                  <p className={styles.tDesc}>
                    Welcome images, button role menus, and a rules-accept step for new members.
                  </p>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>#button-roles</span>
                    <span className={styles.tag}>#rules-gate</span>
                    <span className={styles.tag}>#welcome-canvas</span>
                  </div>
                </div>
              </div>

              <div className={styles.tFoot}>
                <a href="/gallery" className={styles.tBtn}>
                  <span>Use this template</span>
                </a>
              </div>
            </article>

            <article className={`${styles.tCard} ${styles.reveal}`}>
              <div
                className={styles.ctaTile}
                style={{
                  background:
                    'radial-gradient(ellipse 80% 70% at 50% 30%, rgba(16,185,129,0.10), rgba(255,255,255,0.02), transparent 70%)',
                }}
              >
                <div className={styles.ctaTileInner}>
                  <span className={styles.morePill}>More →</span>
                  <h3 className={`${styles.display} ${styles.ctaTileTitle}`}>
                    See all 8 templates
                  </h3>
                </div>
              </div>
              <div className={`${styles.tBody} ${styles.ctaTileBody}`}>
                <p className={styles.tDesc}>
                  From welcome bots to support desks - 8 templates to start from. Open the gallery.
                </p>
              </div>
              <div className={styles.tFoot}>
                <a href="/gallery" className={styles.tBtn}>
                  <span>Open gallery</span>
                </a>
              </div>
            </article>
          </div>
        </section>

        <section id="pricing" className={styles.pricing}>
          <div className={`${styles.pricingHead} ${styles.reveal}`}>
            <h2 className={`${styles.display} ${styles.pricingTitle}`}>
              Transparent pricing, no per-server fees
            </h2>
            <p className={styles.pricingLede}>
              One bot replaces the 4-5 bots you pay for on every server. One subscription,
              everything in one place.
            </p>
          </div>

          <div className={styles.priceGrid}>
            <div className={`${styles.priceCard} ${styles.reveal}`}>
              <div>
                <div className={styles.priceHeadRow}>
                  <h3 className={styles.priceName}>Starter Trial</h3>
                  <span className={styles.priceFlag}>No Card Required</span>
                </div>
                <div className={styles.priceRow}>
                  <span className={`${styles.display} ${styles.priceValue}`}>$0</span>
                  <span className={styles.pricePer}>/ 3-day access</span>
                </div>
                <p className={styles.priceDesc}>
                  Deploy your first custom Discord bot to production in minutes. No credit card
                  required.
                </p>
                <ul className={styles.priceList}>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />1 active
                    production Discord bot
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />1 connected
                    Discord guild
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    100 AI credits for 3 days - builds plus smart replies
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Full access to all 8 starter templates
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Community Discord support
                  </li>
                </ul>
              </div>
              <a href="/dashboard" className={`${styles.btnGhost} ${styles.priceCta}`}>
                Start 3-Day Free Trial
              </a>
            </div>

            <div className={`${styles.priceCardPopular} ${styles.reveal}`}>
              <span className={styles.popularBadge}>Most Popular</span>
              <div>
                <div className={styles.priceHeadRow}>
                  <h3 className={styles.priceName}>Corvus Pro</h3>
                  <span className={`${styles.priceFlag} ${styles.priceFlagGreen}`}>
                    Recommended
                  </span>
                </div>
                <div className={styles.priceRow}>
                  <span className={`${styles.display} ${styles.priceValue}`}>$10</span>
                  <span className={styles.pricePer}>/ month</span>
                </div>
                <p className={styles.priceDesc}>
                  Full capabilities for growing communities, gaming hubs, and multi-channel servers.
                </p>
                <ul className={`${styles.priceList} ${styles.priceListBright}`}>
                  <li className={`${styles.priceLi} ${styles.priceLiStrong}`}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />2 active
                    production Discord bots
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Up to 5 connected Discord guilds
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    2,000 AI credits (~1,800 builds)
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    XP, roles and settings survive every restart
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Stays online while you build - editing never takes it down
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Priority developer email & Discord support
                  </li>
                </ul>
              </div>
              <div className={styles.priceCtaBlock}>
                <a href="/dashboard" className={`${styles.btnPrimary} ${styles.priceCtaPrimary}`}>
                  Upgrade to Pro
                </a>
                <p className={styles.priceNote}>Cancel anytime with a single click</p>
              </div>
            </div>

            <div className={`${styles.priceCard} ${styles.reveal}`}>
              <div>
                <div className={styles.priceHeadRow}>
                  <h3 className={styles.priceName}>Corvus Studio</h3>
                  <span className={styles.priceFlag}>Networks & Agencies</span>
                </div>
                <div className={styles.priceRow}>
                  <span className={`${styles.display} ${styles.priceValue}`}>$29</span>
                  <span className={styles.pricePer}>/ month</span>
                </div>
                <p className={styles.priceDesc}>
                  For networks and agencies running many communities at once.
                </p>
                <ul className={styles.priceList}>
                  <li className={`${styles.priceLi} ${styles.priceLiStrong}`}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />8 active
                    production Discord bots
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Up to 100 connected Discord guilds
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    6,000 AI credits per month
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Test everything on a practice server first
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Pre-flight checks before every publish
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Priority support when you need a human
                  </li>
                </ul>
              </div>
              <a href="/dashboard" className={`${styles.btnGhost} ${styles.priceCta}`}>
                Select Studio Plan
              </a>
            </div>
          </div>
        </section>

        <section id="faq" className={styles.faq}>
          <div className={`${styles.faqHead} ${styles.reveal}`}>
            <h2 className={`${styles.display} ${styles.faqTitle}`}>Frequently Asked Questions</h2>
            <p className={styles.faqLede}>
              Everything you need to know about architecture, token security, and pricing.
            </p>
          </div>

          <div className={styles.faqList} id="faqList">
            {FAQS.map((faq, index) => (
              <div
                key={faq.q}
                className={`${styles.card} ${styles.faqItem} ${styles.reveal}`}
                data-testid="faq-item"
                data-open={index === 0 ? 'true' : 'false'}
              >
                <button
                  className={styles.faqQ}
                  aria-expanded={index === 0 ? 'true' : 'false'}
                  type="button"
                >
                  <span>{faq.q}</span>
                  <span className={styles.faqPlus} aria-hidden="true">
                    +
                  </span>
                </button>
                <div className={styles.faqA}>
                  <div className={styles.faqAInner}>
                    <p className={styles.faqAText}>{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div aria-hidden="true" className={styles.footerGlowWrap}>
          <div className={styles.footerGlow} />
          <div className={styles.footerVeil} />
        </div>

        <div className={styles.footerInner}>
          <div className={styles.footerTop}>
            <div className={styles.footerBrandCol}>
              <a href="#top" className={styles.brand} aria-label="Corvus Home">
                <BrandMark />
                <span className={styles.footerBrandName}>CORVUS</span>
              </a>
              <p className={styles.footerTag}>
                Build a Discord bot with plain words. No code, no token paste.
              </p>
            </div>

            <div className={styles.footerCols}>
              <nav aria-label="Product" className={styles.footerCol}>
                <p className={styles.footerHeading}>Product</p>
                <a className={styles.footerLink} href="#how-it-works">
                  How It Works
                </a>
                <a className={styles.footerLink} href="#bento">
                  Features
                </a>
                <a className={styles.footerLink} href="#bento">
                  Security Architecture
                </a>
                <a className={styles.footerLink} href="#templates">
                  Templates
                </a>
                <a className={styles.footerLink} href="#pricing">
                  Pricing
                </a>
              </nav>
              <nav aria-label="Resources" className={styles.footerCol}>
                <p className={styles.footerHeading}>Resources</p>
                <a className={styles.footerLink} href="#faq">
                  Documentation
                </a>
                <a className={styles.footerLink} href="#bento">
                  Security Whitepaper
                </a>
                <a className={styles.footerLink} href="#bento">
                  Discord Gateway
                </a>
                <a className={styles.footerLink} href="#how-it-works">
                  Pre-Flight Scanner
                </a>
              </nav>
              <nav aria-label="Company" className={styles.footerCol}>
                <p className={styles.footerHeading}>Company</p>
                <a className={styles.footerLink} href="/privacy">
                  Privacy Policy
                </a>
                <a className={styles.footerLink} href="/terms">
                  Terms of Service
                </a>
                <span className={styles.footerLink}>Community Discord</span>
                <span className={styles.footerLink}>X (Twitter)</span>
              </nav>
            </div>
          </div>

          <div className={styles.footerBase}>
            <p className={styles.copyright}>© 2026 Corvus. All rights reserved.</p>
            <div className={styles.footerDotRow}>
              <span className={styles.footerDot} aria-hidden="true" />
            </div>
          </div>
        </div>
      </footer>

      <LandingEffects />
    </div>
  );
}
