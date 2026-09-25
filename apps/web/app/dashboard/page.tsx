'use client';

/* Dashboard home (overview only). The shell + rail live in
   `app/dashboard/layout.tsx`; the bots list is its own page at
   `/dashboard/bots`. `?view=bots` is honored once as a redirect for old
   back-links. */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Bot, Coins, FlaskConical, Server, ShieldCheck } from 'lucide-react';
import { BuilderProgress } from '@/components/ui/builder-progress';
import { TRIAL_EXPIRED_MESSAGE, fetchBots, TRIAL_DEAL, type MockBot } from '@/lib/bots';
import styles from './page.module.css';

/* Owner-language page (Turkish). Every string this page owns is Turkish. The
   two trial lines are NOT this page's words: `TRIAL_EXPIRED_MESSAGE` and
   `TRIAL_DEAL` are defined once in `lib/bots.ts` and shared with the API
   refusal bodies and the bot-detail page, so this page imports and prints them
   verbatim rather than retyping a sentence that could drift. Both are Turkish
   there now (F5); this page needed no change to follow. */

/* Three starter presets. The visible label byte-matches the catalog seed name
   (apps/gateway/src/db/seed-templates.ts) — the single shared name set the
   landing showcase (app/page.tsx) and the gallery detail pages use, so one
   click never contradicts the destination. Each card is a link to that
   template's live gallery detail page (/gallery/<slug>, the E3 route), so no
   card is a dead control and every slug is one the catalog actually serves —
   a made-up slug would 404. The three labels are pinned by page.test.tsx. */
const TEMPLATES: { name: string; slug: string }[] = [
  { name: 'Mod Shield', slug: 'mod-shield' },
  { name: 'Ticket Desk', slug: 'ticket-desk' },
  { name: 'Welcome Wagon', slug: 'welcome-wagon' },
];

/* Setup is a display-only checklist. */
const SETUP_STEPS: { id: string; name: string; state: string; done: boolean; current: boolean }[] =
  [
    { id: 'setup-1', name: 'Sunucunu bağla', state: 'Tamam', done: true, current: false },
    { id: 'setup-2', name: 'Botunu anlat', state: 'Buradasın', done: false, current: true },
    { id: 'setup-3', name: 'Dene', state: 'Sırada', done: false, current: false },
    { id: 'setup-4', name: 'Canlıya al', state: 'Sırada', done: false, current: false },
  ];

const SETUP_DONE = 2;
const SETUP_TOTAL = 4;

/* KI-033: the trial clock is server truth (accounts.trial_ends_at) and this
   page is 'use client', so the flag is read from GET /api/session/trial on
   mount — never from the bare bot rows, and never guessed. An injected prop
   (tests) wins; otherwise absent/fetch-fail means "not expired as far as this
   read knows" and the banner stays off. */
/* Display formatting for a live credit balance. Integral balances render as
   whole numbers; fractional ones round to one decimal — never model names or
   raw tokens (KI-030 honesty applies to the balance line too). The unreadable
   line says so in the owner's language, matching the bots list's own
   `Henüz veri yok`. */
function formatCredits(value: number): string {
  if (!Number.isFinite(value)) return 'Henüz veri yok';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function DashboardInner({
  bots: injectedBots,
  trialExpired: injectedTrialExpired,
}: {
  bots?: MockBot[];
  trialExpired?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  /* The run id a started build hands back (?runId=). Absent, BuilderProgress
     shows its honest "No run started" — never a fabricated step (KI-014). */
  const runId = searchParams.get('runId');

  /* Backward compat: old back-links pointed at ?view=bots; the list is a
     real page now, so send those arrivals over. */
  useEffect(() => {
    if (searchParams.get('view') === 'bots') {
      router.replace('/dashboard/bots');
    }
  }, [searchParams, router]);

  /* Counts reflect the caller's own bots when the list can be read; otherwise
     the page renders an honest empty state (KI-030) — never example bots.
     `liveBots` stays null until the read settles, so the empty state is gated
     on the same flag: an in-flight fetch shows the loading shell, never a
     "No bots yet" flash over an account that may well have bots. An injected
     prop (tests) is already settled by construction. */
  const [liveBots, setLiveBots] = useState<MockBot[] | null>(null);
  useEffect(() => {
    if (injectedBots !== undefined) return;
    const controller = new AbortController();
    let active = true;
    void fetchBots(controller.signal).then((snapshot) => {
      if (active) setLiveBots(snapshot.bots);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [injectedBots]);
  const bots = liveBots ?? injectedBots ?? [];
  /* The bots list page idiom (bots/page.tsx): hold the shell while the fetch
     is in flight. Only a resolved read may claim the account is empty. */
  const botsLoading = injectedBots === undefined && liveBots === null;

  /* The credit balance is live ledger data from GET /api/credits (allowance
     = monthly grant + active refills, spent = month-to-date spend SUM).
     `liveCredits` holds the last good read; `creditsSettled` flips once the
     read resolves either way, so the card shows a loading value mid-flight
     and a 0 fallback on resolved-empty/unread — never a dash after load,
     never a fabricated nonzero. */
  const [liveCredits, setLiveCredits] = useState<{
    remaining: number;
    allowance: number;
  } | null>(null);
  const [creditsSettled, setCreditsSettled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/credits', { signal: controller.signal });
        if (!active) return;
        if (response.ok) {
          const payload: unknown = await response.json();
          if (!active) return;
          if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
            const record = payload as Record<string, unknown>;
            const remaining = record.remaining;
            const allowance = record.allowance;
            if (
              typeof remaining === 'number' &&
              Number.isFinite(remaining) &&
              typeof allowance === 'number' &&
              Number.isFinite(allowance)
            ) {
              setLiveCredits({ remaining, allowance });
            }
          }
        }
        if (active) setCreditsSettled(true);
      } catch {
        if (active) setCreditsSettled(true);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  /* The expiry signal arrives from GET /api/session/trial (never from the bot
     rows). An injected prop (tests) wins outright; otherwise the endpoint is
     read once on mount and any failure resolves to false — fail-open, so a
     down session read can never conjure a banner. */
  const [liveTrialExpired, setLiveTrialExpired] = useState(false);
  useEffect(() => {
    if (injectedTrialExpired !== undefined) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/session/trial', { signal: controller.signal });
        if (!active || !response.ok) return;
        const payload: unknown = await response.json();
        if (!active) return;
        if (typeof payload === 'object' && payload !== null) {
          const flag = (payload as Record<string, unknown>).trialExpired;
          if (typeof flag === 'boolean' && flag) setLiveTrialExpired(true);
        }
      } catch {
        return;
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [injectedTrialExpired]);
  const trialExpired = injectedTrialExpired ?? liveTrialExpired;

  const liveCount = bots.filter((bot) => bot.status === 'online').length;
  const trialCount = bots.filter((bot) => bot.status === 'trial').length;
  const serverKnown = bots.some((bot) => typeof bot.servers === 'number');
  const serverTotal = bots.reduce((sum, bot) => sum + (bot.servers ?? 0), 0);
  const hasBots = bots.length > 0;

  /* Stat cards show real numbers when rows exist, `—`/`Henüz veri yok` when not
     — never mock counts (KI-030). Live/trial counts derive from real rows.
     Server counts are not wired yet, so they read `Henüz veri yok` whenever rows
     exist (a summed 0 from absent data would be fabricated) and `—` when there
     is nothing to measure. The Credits card shows the live balance once
     /api/credits answers, a loading value while that read is in flight, and a
     0 fallback once it settles unread or unparseable — never a dash after
     load, never a fabricated nonzero. */
  const creditsValue = liveCredits
    ? `${formatCredits(liveCredits.remaining)} / ${formatCredits(liveCredits.allowance)} kredi`
    : creditsSettled
      ? '0 / 0 kredi'
      : '…';
  const statCards: { key: string; label: string; value: string; icon: typeof Bot }[] = [
    { key: 'live', label: 'Canlı botlar', value: hasBots ? String(liveCount) : '—', icon: Bot },
    {
      key: 'trial',
      label: 'Denemede',
      value: hasBots ? String(trialCount) : '—',
      icon: FlaskConical,
    },
    {
      key: 'servers',
      label: 'Sunucular',
      value: !hasBots ? '—' : serverKnown ? String(serverTotal) : 'Henüz veri yok',
      icon: Server,
    },
    { key: 'credits', label: 'Kalan kredi', value: creditsValue, icon: Coins },
  ];

  /* KI-030: no activity feed exists yet, so This week stays an honest empty
     state even when bots exist — never example rows passed off as the
     account's activity. */

  return (
    <div className={styles.homeScroll}>
      <div className={styles.homeInner}>
        <header id="home" className={styles.titleBlock}>
          <h1 className={styles.pageTitle}>Ana sayfa</h1>
          <p className={styles.pageSub}>Botlarına bir bakış.</p>
        </header>

        {trialExpired ? (
          <p role="status" className={styles.trialExpiredBanner}>
            {TRIAL_EXPIRED_MESSAGE}
          </p>
        ) : null}

        <section id="get-started" aria-label="Başlangıç (2/4)" className={styles.panel}>
          <div className={styles.cardHead}>
            <h2 className={styles.panelTitle}>Başlangıç (2/4)</h2>
            <p className={styles.cardSub}>İki adım tamam. Devam etmek için botunu anlat.</p>
          </div>
          <div
            role="progressbar"
            aria-label="Kurulum durumu"
            aria-valuenow={SETUP_DONE}
            aria-valuemin={0}
            aria-valuemax={SETUP_TOTAL}
            className={styles.setupTrack}
          >
            <div className={styles.setupFill} />
          </div>
          <ol aria-label="Kurulum adımları" className={styles.steps}>
            {SETUP_STEPS.map((step, index) => (
              <li
                key={step.id}
                className={`${styles.step} ${step.done ? styles.stepDone : ''} ${
                  step.current ? styles.stepCurrent : ''
                }`}
              >
                <span aria-hidden="true" className={styles.stepNum}>
                  {index + 1}
                </span>
                <span className={styles.stepName}>{step.name}</span>
                <span className={`${styles.stepState} ${step.current ? styles.stepHere : ''}`}>
                  {step.state}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section id="build-progress" aria-label="Kurulum ilerlemesi" className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Kurulum ilerlemesi</h2>
            <Activity aria-hidden="true" size={16} className={styles.panelIcon} />
          </div>
          <p className={styles.cardSub}>Botunu taslaktan kayıtlı sürüme kadar izle.</p>
          <BuilderProgress runId={runId} />
        </section>

        <section aria-label="Genel bakış" className={styles.statRow}>
          {statCards.map((stat) => (
            <div key={stat.key} role="group" aria-label={stat.label} className={styles.statCard}>
              <stat.icon aria-hidden="true" size={16} className={styles.statIcon} />
              <span className={styles.statNumber}>{stat.value}</span>
              <span className={styles.statSub}>{stat.label}</span>
            </div>
          ))}
        </section>

        {botsLoading ? (
          <section aria-label="Botların yükleniyor" className={styles.panel}>
            <p role="status" className={styles.cardSub}>
              Botların yükleniyor…
            </p>
          </section>
        ) : hasBots ? null : (
          <section aria-label="Henüz bot yok" className={styles.panel}>
            <h2 className={styles.panelTitle}>Henüz botun yok — ilk botunu anlat.</h2>
            <a href="/dashboard/new" className={styles.templateLink}>
              İlk botunu anlat
            </a>
          </section>
        )}

        <div className={styles.dualRow}>
          <section id="week" aria-label="Bu hafta" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Bu hafta</h2>
              <Activity aria-hidden="true" size={16} className={styles.panelIcon} />
            </div>
            <p className={styles.todaySentence}>Henüz etkinlik yok.</p>
          </section>
          <section id="preflight" aria-label="Ön kontrol" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Ön kontrol</h2>
              <ShieldCheck aria-hidden="true" size={16} className={styles.panelIcon} />
            </div>
            <p className={styles.todaySentence}>Henüz tarama yok — bir botu açıp çalıştır.</p>
          </section>
        </div>

        <section id="workspace" aria-label="Çalışma alanı" className={styles.panel}>
          <h2 className={styles.panelTitle}>Çalışma alanı</h2>
          <p className={styles.wsLine}>Çalışma alanı: Sunucum</p>
          <p className={styles.trialLine}>{TRIAL_DEAL}</p>
          <div>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Yakında"
              className={styles.upgrade}
            >
              Yükselt · Yakında
            </button>
          </div>
        </section>

        <section aria-label="Şablonlar" className={styles.section}>
          <div className={styles.titleRow}>
            <h2 className={styles.sectionTitle}>Şablondan başla</h2>
            <a href="/gallery" className={styles.templateLink}>
              Tüm şablonları gör
            </a>
          </div>
          <div className={styles.templateGrid}>
            {TEMPLATES.map((preset) => (
              <a key={preset.slug} href={`/gallery/${preset.slug}`} className={styles.templateCard}>
                <span className={styles.templateName}>{preset.name}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function DashboardPage({
  bots,
  trialExpired,
}: {
  bots?: MockBot[];
  trialExpired?: boolean;
}) {
  return (
    <Suspense>
      <DashboardInner bots={bots} trialExpired={trialExpired} />
    </Suspense>
  );
}
