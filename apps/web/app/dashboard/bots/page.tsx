'use client';

/* Bots list page: toolbar (search + sort + status filter tabs), bot cards
   with Open/Activity/Pre-flight deep links, counts, empty state, and a
   New-bot button. Moved verbatim from the old `?view=bots` branch of
   `app/dashboard/page.tsx` — no behavior or copy change. Shared shell
   classes (scroll column, title block, section titles) still live in
   `../page.module.css`; this sheet keeps only the list-exclusive rules. */
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  activityFor,
  fetchBots,
  formatCount,
  MOCK_BOTS,
  STATUS_LABEL,
  STATUS_RANK,
  type BotSource,
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

export default function BotsPage({ bots: injectedBots }: { bots?: MockBot[] }) {
  const [tab, setTab] = useState<TabFilter>('all');
  const [sort, setSort] = useState<SortMode>('status');
  const [query, setQuery] = useState('');

  /* Live-first: the caller's own bots when the list can be read, the example
     bots otherwise. A fallback keeps the current (example) render, so only a
     real live answer swaps the data — and the source mark rides along. */
  const [liveSnapshot, setLiveSnapshot] = useState<BotsSnapshot | null>(null);
  useEffect(() => {
    if (injectedBots !== undefined) return;
    const controller = new AbortController();
    let active = true;
    void fetchBots(controller.signal).then((snapshot) => {
      if (active && snapshot.isLive) setLiveSnapshot(snapshot);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [injectedBots]);

  const bots = liveSnapshot?.bots ?? injectedBots ?? MOCK_BOTS;
  const source: BotSource = liveSnapshot?.isLive === true ? 'live' : 'mock';
  const live = source === 'live';

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

        <section
          id="bots"
          aria-label={live ? 'Your bots' : 'Your bots (example)'}
          className={shared.section}
        >
          <div className={styles.sectionHead}>
            <div className={shared.titleRow}>
              <div className={styles.headLead}>
                <h2 className={shared.sectionTitle}>Your bots</h2>
                <p className={styles.countsLine}>
                  Live {liveCount} / Trial {trialCount} / Off {offCount}
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
                  <p className={styles.emptyText}>No bots yet — Connect your first server</p>
                  <a href="/dashboard#get-started" className={styles.primaryAction}>
                    Connect a server
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
                /* Live rows have no server-side activity or counts: the line
                   is omitted rather than filled with a fabricated example. */
                const last = live ? null : activityFor(bot)[0];
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
                          {last !== null ? (
                            <span className={styles.botGridTime}>{last.time}</span>
                          ) : null}
                        </span>
                        {last !== null ? (
                          <span className={styles.botGridLast}>{last.text}</span>
                        ) : null}
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
      </div>
    </div>
  );
}
