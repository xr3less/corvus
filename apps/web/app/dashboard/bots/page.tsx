'use client';

/* Bots list page: toolbar (search + sort + status filter tabs), bot cards
   with Open/Activity/Pre-flight deep links, counts, empty state, and a
   New-bot button. Moved verbatim from the old `?view=bots` branch of
   `app/dashboard/page.tsx` — behavior unchanged since, only the copy moved to
   the owner's language (Turkish). Shared shell classes (scroll column, title
   block, section titles) still live in `../page.module.css`; this sheet keeps
   only the list-exclusive rules.

   One English source stays, owned by another file: everything the shared
   `BuilderProgress` component renders (`No run started`, `Queued`,
   `Generating`, …), which `/dashboard` shows as well. */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, Plus } from 'lucide-react';
import { BuilderProgress } from '@/components/ui/builder-progress';
import {
  fetchBots,
  formatCount,
  STATUS_RANK,
  TRIAL_EXPIRED_MESSAGE,
  type BotStatus,
  type BotsSnapshot,
  type MockBot,
} from '@/lib/bots';
import shared from '../page.module.css';
import styles from './page.module.css';

type TabFilter = 'all' | 'live' | 'trial';
type SortMode = 'status' | 'name';

/* Owner-language labels (Turkish). The words here match the sidebar rail's
   already-Turkish labels — 'Botlar', 'Etkinlik', 'Ön kontrol' — so the list and
   the rail name the same things the same way. */
const STATUS_LABEL: Record<BotStatus, string> = {
  online: 'Canlı',
  trial: 'Deneme',
  offline: 'Çevrimdışı',
};

const TAB_LABEL: Record<TabFilter, string> = {
  all: 'Tümü',
  live: 'Canlı',
  trial: 'Deneme',
};

const TABS: TabFilter[] = ['all', 'live', 'trial'];

const SORT_LABEL: Record<SortMode, string> = {
  status: 'Durum',
  name: 'İsim A-Z',
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

const LOGIN_HREF = '/api/auth/login';
const LOGGED_OUT_LINE = 'Oturumun kapanmış — yeniden giriş yap, sonra tekrar dene.';

function BotsInner({
  bots: injectedBots,
  trialExpired: injectedTrialExpired,
}: {
  bots?: MockBot[];
  /* KI-033: server truth from GET /api/session/trial (never the bot rows).
     An injected prop (tests) wins outright. */
  trialExpired?: boolean;
}) {
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
  /* The list fetch 401s (snapshot.unauthorized) — the session is gone, not
     the bots. Loading (no injected rows, snapshot still null) holds the shell
     until the fetch resolves, never the "No bots yet" flash. */
  const unauthorized = injectedBots === undefined && (liveSnapshot?.unauthorized ?? false);
  const loading = injectedBots === undefined && liveSnapshot === null;

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
          <h1 className={shared.pageTitle}>Botlar</h1>
          <p className={shared.pageSub}>Anlat, botun burada belirsin.</p>
        </header>

        {/* KI-033 banner: `TRIAL_EXPIRED_MESSAGE` is byte-locked in
            `lib/bots.ts` and printed verbatim on `/dashboard` and the
            bot-detail page too, so this page renders the constant as-is rather
            than keeping a second wording of its own. */}
        {trialExpired ? (
          <p role="status" className={shared.trialExpiredBanner}>
            {TRIAL_EXPIRED_MESSAGE}
          </p>
        ) : null}

        <section id="bots" aria-label="Botların" className={shared.section}>
          <div className={styles.sectionHead}>
            <div className={shared.titleRow}>
              <div className={styles.headLead}>
                <h2 className={shared.sectionTitle}>Botların</h2>
                <p className={styles.countsLine}>
                  {loading
                    ? 'Yükleniyor…'
                    : bots.length === 0
                      ? 'Henüz veri yok'
                      : `Canlı ${liveCount} / Deneme ${trialCount} / Çevrimdışı ${offCount}`}
                </p>
              </div>
              <a href="/dashboard/new" className={`${styles.primaryAction} ${styles.newBotButton}`}>
                <Plus aria-hidden="true" size={16} />
                Yeni bot
              </a>
            </div>
            <div className={styles.toolbar}>
              <div role="group" aria-label="Botları duruma göre filtrele" className={styles.tabs}>
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
                    Botlarda ara
                  </label>
                  <input
                    id="bot-search"
                    type="search"
                    placeholder="Botlarda ara…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className={styles.search}
                  />
                </div>
                <div className={styles.sortField}>
                  <label htmlFor="bot-sort" className={styles.searchLabel}>
                    Botları sırala
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
          {/* The detail page idiom, mirrored: hold the shell while the fetch
              is in flight, and render the logged-out line + login link on 401 —
              never "No bots yet" for either. */}
          {loading ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Botların yükleniyor…</p>
            </div>
          ) : unauthorized ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>{LOGGED_OUT_LINE}</p>
              <a href={LOGIN_HREF} className={styles.ghostAction}>
                Giriş yap
              </a>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {bots.length === 0 ? (
                <>
                  <p className={styles.emptyText}>Henüz botun yok — ilk botunu anlat.</p>
                  <a href="/dashboard/new" className={styles.primaryAction}>
                    İlk botunu anlat
                  </a>
                </>
              ) : (
                <>
                  <p className={styles.emptyText}>Bu filtreye uyan bot yok.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setTab('all');
                    }}
                    className={styles.ghostAction}
                  >
                    Aramayı temizle
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul aria-label="Bot kartları" className={styles.botGrid}>
              {filtered.map((bot) => {
                /* Real rows render real numbers only. Rows that carry
                   server-backed members/servers counts show them; otherwise the
                   line is omitted rather than filled with a fabricated example
                   (KI-030). The words are Turkish here (the owner's language);
                   the number grouping itself comes from `formatCount` in
                   `lib/bots.ts`, which is outside this file. */
                const counts =
                  bot.members !== undefined && bot.servers !== undefined
                    ? `${formatCount(bot.members, 'üye', 'üye')} · ${formatCount(
                        bot.servers,
                        'sunucu',
                        'sunucu',
                      )}`
                    : null;
                return (
                  <li key={bot.id}>
                    <div className={styles.botGridCard}>
                      <a
                        href={`/dashboard/bots/${bot.id}`}
                        className={styles.botGridBody}
                        aria-label={`${bot.name} — bot detayını aç`}
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
                          Aç
                        </a>
                        <a
                          href={`/dashboard/bots/${bot.id}?tab=activity`}
                          className={styles.botAction}
                        >
                          Etkinlik
                        </a>
                        <a
                          href={`/dashboard/bots/${bot.id}?tab=preflight`}
                          className={styles.botAction}
                        >
                          Ön kontrol
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="build-progress" aria-label="Kurulum ilerlemesi" className={shared.panel}>
          <div className={shared.panelHead}>
            <h2 className={shared.panelTitle}>Kurulum ilerlemesi</h2>
            <Activity aria-hidden="true" size={16} className={shared.panelIcon} />
          </div>
          <p className={shared.cardSub}>Botunu taslaktan kayıtlı sürüme kadar izle.</p>
          <BuilderProgress runId={runId} />
        </section>
      </div>
    </div>
  );
}

export default function BotsPage({
  bots,
  trialExpired,
}: {
  bots?: MockBot[];
  trialExpired?: boolean;
}) {
  return (
    <Suspense>
      <BotsInner bots={bots} trialExpired={trialExpired} />
    </Suspense>
  );
}
