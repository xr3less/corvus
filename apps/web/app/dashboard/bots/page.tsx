'use client';

/* Bots list page: toolbar (search + sort + status filter tabs), bot cards
   with Open/Activity/Pre-flight deep links, counts, empty state, and a
   New-bot button. Moved verbatim from the old `?view=bots` branch of
   `app/dashboard/page.tsx` — no behavior or copy change. Shared shell
   classes (scroll column, title block, section titles) still live in
   `../page.module.css`; this sheet keeps only the list-exclusive rules. */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, Plus } from 'lucide-react';
import { BuilderProgress } from '@/components/ui/builder-progress';
import {
  fetchBots,
  formatCount,
  STATUS_LABEL,
  STATUS_RANK,
  type BotStatus,
  type BotsSnapshot,
  type MockBot,
} from '@/lib/bots';
import shared from '../page.module.css';
import styles from './page.module.css';

type TabFilter = 'all' | 'live' | 'trial';
type SortMode = 'status' | 'name';

const TAB_LABEL: Record<TabFilter, string> = {
  all: 'All',
  live: 'Live',
  trial: 'Trial',
};

const TABS: TabFilter[] = ['all', 'live', 'trial'];

const SORT_LABEL: Record<SortMode, string> = {
  status: 'Status',
  name: 'Name A-Z',
};

const SORT_MODES: SortMode[] = ['status', 'name'];

function StatusPill({ status }: { status: BotStatus }) {
  return (
    <span className={`${styles.pill} ${styles[`pill-${status}`]}`}>
      <span aria-hidden="true" className={styles.dot} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function BotsInner({ bots: injectedBots }: { bots?: MockBot[] }) {
  const [tab, setTab] = useState<TabFilter>('all');
  const [sort, setSort] = useState<SortMode>('status');
  const [query, setQuery] = useState('');

  /* The run id a started build hands back (?runId=). Absent, BuilderProgress
     shows its honest "No run started" — never a fabricated step (KI-014). */
  const runId = useSearchParams().get('runId');

  /* KI-030: empty, not example — the list shows only the caller's real rows.
     fetchBots() returns [] when the list cannot be read, so a failure renders
     the honest empty state below, never mock bots as the account's own. */
  const [liveSnapshot, setLiveSnapshot] = useState<BotsSnapshot | null>(null);
  useEffect(() => {
    if (injectedBots !== undefined) return;
    const controller = new AbortController();
    let active = true;
    void fetchBots(controller.signal).then((snapshot) => {
      if (active) setLiveSnapshot(snapshot);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [injectedBots]);

  const bots = injectedBots ?? liveSnapshot?.bots ?? [];

  const liveCount = bots.filter((bot) => bot.status === 'online').length;
  const trialCount = bots.filter((bot) => bot.status === 'trial').length;
  const offCount = bots.filter((bot) => bot.status === 'offline').length;

  const sortedBots = useMemo(
    () =>
      bots
        .map((bot, index) => ({ bot, index }))
        .sort((a, b) => STATUS_RANK[a.bot.status] - STATUS_RANK[b.bot.status] || a.index - b.index)
        .map((entry) => entry.bot),
    [bots],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = sortedBots.filter((bot) => {
      if (tab === 'live' && bot.status !== 'online') return false;
      if (tab === 'trial' && bot.status !== 'trial') return false;
      if (q && !bot.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'name') {
      return [...matched].sort((a, b) => a.name.localeCompare(b.name));
    }
    return matched;
  }, [sortedBots, tab, query, sort]);

  return (
    <div className={shared.homeScroll}>
      <div className={shared.homeInner}>
        <header className={shared.titleBlock}>
          <h1 className={shared.pageTitle}>Bots</h1>
          <p className={shared.pageSub}>Describe one and it lands here.</p>
        </header>

        <section id="bots" aria-label="Your bots" className={shared.section}>
          <div className={styles.sectionHead}>
            <div className={shared.titleRow}>
              <div className={styles.headLead}>
                <h2 className={shared.sectionTitle}>Your bots</h2>
                <p className={styles.countsLine}>
                  {bots.length === 0
                    ? 'No data yet'
                    : `Live ${liveCount} / Trial ${trialCount} / Off ${offCount}`}
                </p>
              </div>
              <a href="/dashboard/new" className={`${styles.primaryAction} ${styles.newBotButton}`}>
                <Plus aria-hidden="true" size={16} />
                New bot
              </a>
            </div>
            <div className={styles.toolbar}>
              <div role="group" aria-label="Filter bots by status" className={styles.tabs}>
                {TABS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={tab === value}
                    onClick={() => setTab(value)}
                    className={styles.tab}
                  >
                    {TAB_LABEL[value]}
                  </button>
                ))}
              </div>
              <div className={styles.searchRow}>
                <div className={styles.searchField}>
                  <label htmlFor="bot-search" className={styles.searchLabel}>
                    Search bots
                  </label>
                  <input
                    id="bot-search"
                    type="search"
                    placeholder="Search bots..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className={styles.search}
                  />
                </div>
                <div className={styles.sortField}>
                  <label htmlFor="bot-sort" className={styles.searchLabel}>
                    Sort bots
                  </label>
                  <select
                    id="bot-sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortMode)}
                    className={styles.sortSelect}
                  >
                    {SORT_MODES.map((value) => (
                      <option key={value} value={value}>
                        {SORT_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              {bots.length === 0 ? (
                <>
                  <p className={styles.emptyText}>No bots yet — describe your first bot.</p>
                  <a href="/dashboard/new" className={styles.primaryAction}>
                    Describe your first bot
                  </a>
                </>
              ) : (
                <>
                  <p className={styles.emptyText}>No bots match this filter.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setTab('all');
                    }}
                    className={styles.ghostAction}
                  >
                    Clear search
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul aria-label="Bot cards" className={styles.botGrid}>
              {filtered.map((bot) => {
                /* Real rows render real numbers only. Rows that carry
                   server-backed members/servers counts show them; otherwise the
                   line is omitted rather than filled with a fabricated example
                   (KI-030). */
                const counts =
                  bot.members !== undefined && bot.servers !== undefined
                    ? `${formatCount(bot.members, 'member', 'members')} · ${formatCount(
                        bot.servers,
                        'server',
                        'servers',
                      )}`
                    : null;
                return (
                  <li key={bot.id}>
                    <div className={styles.botGridCard}>
                      <a
                        href={`/dashboard/bots/${bot.id}`}
                        className={styles.botGridBody}
                        aria-label={`${bot.name} — open bot detail`}
                      >
                        <span
                          aria-hidden="true"
                          data-testid="bot-media-box"
                          className={styles.botGridMedia}
                        >
                          <span className={styles.botGridAvatar}>{bot.name.charAt(0)}</span>
                        </span>
                        <span className={styles.botGridTitleRow}>
                          <span className={styles.botGridName}>{bot.name}</span>
                        </span>
                        <span className={styles.botGridPillRow}>
                          <StatusPill status={bot.status} />
                          {counts !== null ? (
                            <span className={styles.botGridMeta}>{counts}</span>
                          ) : null}
                        </span>
                      </a>
                      <div className={styles.botGridActions}>
                        <a href={`/dashboard/bots/${bot.id}`} className={styles.botAction}>
                          Open
                        </a>
                        <a
                          href={`/dashboard/bots/${bot.id}?tab=activity`}
                          className={styles.botAction}
                        >
                          Activity
                        </a>
                        <a
                          href={`/dashboard/bots/${bot.id}?tab=preflight`}
                          className={styles.botAction}
                        >
                          Pre-flight
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="build-progress" aria-label="Build progress" className={shared.panel}>
          <div className={shared.panelHead}>
            <h2 className={shared.panelTitle}>Build progress</h2>
            <Activity aria-hidden="true" size={16} className={shared.panelIcon} />
          </div>
          <p className={shared.cardSub}>Follow your bot from draft to saved version.</p>
          <BuilderProgress runId={runId} />
        </section>
      </div>
    </div>
  );
}

export default function BotsPage({ bots }: { bots?: MockBot[] }) {
  return (
    <Suspense>
      <BotsInner bots={bots} />
    </Suspense>
  );
}
