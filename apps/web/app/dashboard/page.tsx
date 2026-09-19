'use client';

/* Dashboard home (overview only). The shell + rail live in
   `app/dashboard/layout.tsx`; the bots list is its own page at
   `/dashboard/bots`. `?view=bots` is honored once as a redirect for old
   back-links. */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Bot, Coins, FlaskConical, Server, ShieldCheck } from 'lucide-react';
import { BuilderProgress } from '@/components/ui/builder-progress';
import { fetchBots, TRIAL_DEAL, type MockBot } from '@/lib/bots';
import styles from './page.module.css';

/* Three starter presets — plain buttons with no action behind them yet. */
const TEMPLATES = ['Community Guardian', 'AI Support Desk', 'Welcome & Role Picker'];

/* Setup is a display-only checklist. */
const SETUP_STEPS: { id: string; name: string; state: string; done: boolean; current: boolean }[] =
  [
    { id: 'setup-1', name: 'Connect your server', state: 'Done', done: true, current: false },
    { id: 'setup-2', name: 'Describe your bot', state: 'You are here', done: false, current: true },
    { id: 'setup-3', name: 'Test it', state: 'Next', done: false, current: false },
    { id: 'setup-4', name: 'Go live', state: 'Next', done: false, current: false },
  ];

const SETUP_DONE = 2;
const SETUP_TOTAL = 4;

function DashboardInner({ bots: injectedBots }: { bots?: MockBot[] }) {
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
     the page renders an honest empty state (KI-030) — never example bots. */
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

  const liveCount = bots.filter((bot) => bot.status === 'online').length;
  const trialCount = bots.filter((bot) => bot.status === 'trial').length;
  const serverKnown = bots.some((bot) => typeof bot.servers === 'number');
  const serverTotal = bots.reduce((sum, bot) => sum + (bot.servers ?? 0), 0);
  const hasBots = bots.length > 0;

  /* Stat cards show real numbers when rows exist, `—`/`No data yet` when not
     — never mock counts (KI-030). Live/trial counts derive from real rows.
     Server counts and credit balances are not wired yet, so they read
     `No data yet` whenever rows exist (a summed 0 from absent data would be
     fabricated) and `—` when there is nothing to measure. */
  const statCards: { key: string; label: string; value: string; icon: typeof Bot }[] = [
    { key: 'live', label: 'Live bots', value: hasBots ? String(liveCount) : '—', icon: Bot },
    {
      key: 'trial',
      label: 'On trial',
      value: hasBots ? String(trialCount) : '—',
      icon: FlaskConical,
    },
    {
      key: 'servers',
      label: 'Servers',
      value: !hasBots ? '—' : serverKnown ? String(serverTotal) : 'No data yet',
      icon: Server,
    },
    { key: 'credits', label: 'Credits left', value: hasBots ? 'No data yet' : '—', icon: Coins },
  ];

  /* KI-030: no activity feed exists yet, so This week stays an honest empty
     state even when bots exist — never example rows passed off as the
     account's activity. */

  return (
    <div className={styles.homeScroll}>
      <div className={styles.homeInner}>
        <header id="home" className={styles.titleBlock}>
          <h1 className={styles.pageTitle}>Home</h1>
          <p className={styles.pageSub}>Your bots at a glance.</p>
        </header>

        <section id="get-started" aria-label="Get started (2/4)" className={styles.panel}>
          <div className={styles.cardHead}>
            <h2 className={styles.panelTitle}>Get started (2/4)</h2>
            <p className={styles.cardSub}>Two steps done. Describe your bot to keep going.</p>
          </div>
          <div
            role="progressbar"
            aria-label="Setup progress"
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

        <section id="build-progress" aria-label="Build progress" className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Build progress</h2>
            <Activity aria-hidden="true" size={16} className={styles.panelIcon} />
          </div>
          <p className={styles.cardSub}>Follow your bot from draft to saved version.</p>
          <BuilderProgress runId={runId} />
        </section>

        <section aria-label="Overview" className={styles.statRow}>
          {statCards.map((stat) => (
            <div key={stat.key} role="group" aria-label={stat.label} className={styles.statCard}>
              <stat.icon aria-hidden="true" size={16} className={styles.statIcon} />
              <span className={styles.statNumber}>{stat.value}</span>
              <span className={styles.statSub}>{stat.label}</span>
            </div>
          ))}
        </section>

        {hasBots ? null : (
          <section aria-label="No bots yet" className={styles.panel}>
            <h2 className={styles.panelTitle}>No bots yet — describe your first bot.</h2>
            <a href="/dashboard/new" className={styles.templateLink}>
              Create your first bot
            </a>
          </section>
        )}

        <div className={styles.dualRow}>
          <section id="week" aria-label="This week" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>This week</h2>
              <Activity aria-hidden="true" size={16} className={styles.panelIcon} />
            </div>
            <p className={styles.todaySentence}>No activity yet.</p>
          </section>
          <section id="preflight" aria-label="Pre-flight" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Pre-flight</h2>
              <ShieldCheck aria-hidden="true" size={16} className={styles.panelIcon} />
            </div>
            <p className={styles.todaySentence}>No scan yet — open a bot to run one.</p>
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
