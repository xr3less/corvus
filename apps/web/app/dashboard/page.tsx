'use client';

/* Dashboard home (overview only). The shell + rail live in
   `app/dashboard/layout.tsx`; the bots list is its own page at
   `/dashboard/bots`. `?view=bots` is honored once as a redirect for old
   back-links. */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Bot, Coins, FlaskConical, Server, ShieldCheck } from 'lucide-react';
import {
  activityFor,
  CREDITS_TOTAL,
  CREDITS_USED,
  fetchBots,
  MOCK_BOTS,
  TRIAL_DEAL,
  type MockBot,
} from '@/lib/bots';
import styles from './page.module.css';

/* Three starter presets — plain buttons with no action behind them yet. */
const TEMPLATES = ['Community Guardian', 'AI Support Desk', 'Welcome & Role Picker'];

interface ActivityItem {
  id: string;
  text: string;
  suffix: string;
  time: string;
}

/* Setup is a display-only checklist; the numbers are mock and marked (example). */
const SETUP_STEPS: { id: string; name: string; state: string; done: boolean; current: boolean }[] =
  [
    { id: 'setup-1', name: 'Connect your server', state: 'Done', done: true, current: false },
    { id: 'setup-2', name: 'Describe your bot', state: 'You are here', done: false, current: true },
    { id: 'setup-3', name: 'Test it', state: 'Next', done: false, current: false },
    { id: 'setup-4', name: 'Go live', state: 'Next', done: false, current: false },
  ];

const SETUP_DONE = 2;
const SETUP_TOTAL = 4;

const PREFLIGHT_ROWS: { id: string; tone: 'pass' | 'warn'; text: string }[] = [
  { id: 'pf-1', tone: 'pass', text: 'Token and permissions look right' },
  { id: 'pf-2', tone: 'pass', text: 'Rate limits within caps' },
  { id: 'pf-3', tone: 'warn', text: 'Welcome reply targets a hidden channel' },
];

function DashboardInner({ bots: injectedBots }: { bots?: MockBot[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  /* Backward compat: old back-links pointed at ?view=bots; the list is a
     real page now, so send those arrivals over. */
  useEffect(() => {
    if (searchParams.get('view') === 'bots') {
      router.replace('/dashboard/bots');
    }
  }, [searchParams, router]);

  /* Counts reflect the caller's own bots when the list can be read; otherwise
     the example bots. Only a live answer swaps the data. */
  const [liveBots, setLiveBots] = useState<MockBot[] | null>(null);
  useEffect(() => {
    if (injectedBots !== undefined) return;
    const controller = new AbortController();
    let active = true;
    void fetchBots(controller.signal).then((snapshot) => {
      if (active && snapshot.isLive) setLiveBots(snapshot.bots);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [injectedBots]);
  const bots = liveBots ?? injectedBots ?? MOCK_BOTS;

  const liveCount = bots.filter((bot) => bot.status === 'online').length;
  const trialCount = bots.filter((bot) => bot.status === 'trial').length;
  const serverTotal = bots.reduce((sum, bot) => sum + (bot.servers ?? 0), 0);
  const creditsLeft = CREDITS_TOTAL - CREDITS_USED;

  /* Every number here is mock — the (example) marker rides on the aria-label. */
  const statCards: { key: string; label: string; value: number; icon: typeof Bot }[] = [
    { key: 'live', label: 'Live bots', value: liveCount, icon: Bot },
    { key: 'trial', label: 'On trial', value: trialCount, icon: FlaskConical },
    { key: 'servers', label: 'Servers', value: serverTotal, icon: Server },
    { key: 'credits', label: 'Credits left', value: creditsLeft, icon: Coins },
  ];

  /* This week reuses the first bot's existing activity rows — no new data source. */
  const weekRows = useMemo(
    (): ActivityItem[] => (bots.length > 0 ? activityFor(bots[0]) : []),
    [bots],
  );

  return (
    <div className={styles.homeScroll}>
      <div className={styles.homeInner}>
        <header id="home" className={styles.titleBlock}>
          <h1 className={styles.pageTitle}>Home</h1>
          <p className={styles.pageSub}>Your bots at a glance.</p>
        </header>

        <section id="get-started" aria-label="Get started (2/4) (example)" className={styles.panel}>
          <div className={styles.cardHead}>
            <h2 className={styles.panelTitle}>Get started (2/4)</h2>
            <p className={styles.cardSub}>Two steps done. Describe your bot to keep going.</p>
          </div>
          <div
            role="progressbar"
            aria-label="Setup progress (example)"
            aria-valuenow={SETUP_DONE}
            aria-valuemin={0}
            aria-valuemax={SETUP_TOTAL}
            className={styles.setupTrack}
          >
            <div className={styles.setupFill} />
          </div>
          <ol aria-label="Setup steps" className={styles.steps}>
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

        <section aria-label="Overview" className={styles.statRow}>
          {statCards.map((stat) => (
            <div
              key={stat.key}
              role="group"
              aria-label={`${stat.label} (example)`}
              className={styles.statCard}
            >
              <stat.icon aria-hidden="true" size={16} className={styles.statIcon} />
              <span className={styles.statNumber}>{stat.value}</span>
              <span className={styles.statSub}>{stat.label}</span>
            </div>
          ))}
        </section>

        <div className={styles.dualRow}>
          <section id="week" aria-label="This week (example)" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>This week</h2>
              <Activity aria-hidden="true" size={16} className={styles.panelIcon} />
            </div>
            {weekRows.length > 0 ? (
              <ul className={styles.activityList}>
                {weekRows.map((item) => (
                  <li key={item.id} className={styles.activityRow}>
                    <span className={styles.activityText}>
                      {item.text}
                      <span className={styles.activityTime}>{item.suffix}</span>
                    </span>
                    <span className={styles.activityTime}>{item.time}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.todaySentence}>No bots yet.</p>
            )}
          </section>
          <section id="preflight" aria-label="Pre-flight" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Pre-flight</h2>
              <ShieldCheck aria-hidden="true" size={16} className={styles.panelIcon} />
            </div>
            <ul className={styles.activityList}>
              {PREFLIGHT_ROWS.map((row) => (
                <li key={row.id} className={styles.preflightRow}>
                  <span
                    aria-hidden="true"
                    className={`${styles.preDot} ${row.tone === 'pass' ? styles.prePass : styles.preWarn}`}
                  />
                  {row.text}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section id="workspace" aria-label="Workspace" className={styles.panel}>
          <h2 className={styles.panelTitle}>Workspace</h2>
          <p className={styles.wsLine}>Workspace: My server</p>
          <p className={styles.trialLine}>{TRIAL_DEAL}</p>
          <div>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Coming soon"
              className={styles.upgrade}
            >
              Upgrade · Coming soon
            </button>
          </div>
        </section>

        <section aria-label="Templates" className={styles.section}>
          <div className={styles.titleRow}>
            <h2 className={styles.sectionTitle}>Start from a template</h2>
            <a href="/gallery" className={styles.templateLink}>
              See all templates
            </a>
          </div>
          <div className={styles.templateGrid}>
            {TEMPLATES.map((name) => (
              <button key={name} type="button" className={styles.templateCard}>
                <span className={styles.templateName}>{name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function DashboardPage({ bots }: { bots?: MockBot[] }) {
  return (
    <Suspense>
      <DashboardInner bots={bots} />
    </Suspense>
  );
}
