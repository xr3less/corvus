'use client';

/* Template gallery: live card list (GET /api/templates) with real forks
   (POST /api/templates/[slug]/fork). Search, category band, card grid,
   fork counts, and the empty state behave exactly as before. On list
   failure the grid renders an honest unavailable state — never mock rows.
    Wrapped in the same left rail as /dashboard so the route reads as the app. */
import { useEffect, useMemo, useState } from 'react';
import { DashboardRail } from '@/components/ui/dashboard-rail';
import { forkErrorMessage } from '@/lib/http/refusal';
import styles from './page.module.css';

interface GalleryTemplate {
  id: string;
  name: string;
  category: string;
  forks: number;
  detail: string;
}

const ALL = 'All';

/* Server card mapping (GET /api/templates -> { templates: TemplateCard[] }).
   The list route serves card columns only — slug, name, category, forks plus
   capabilities — so the card detail line renders the capability list. Any row
   that is not exactly this shape rejects the whole payload (honest
   unavailable state), never a half-mapped grid. */
function detailForCard(row: Record<string, unknown>): string {
  const capabilities = row.capabilities;
  if (
    Array.isArray(capabilities) &&
    capabilities.length > 0 &&
    capabilities.every((entry): entry is string => typeof entry === 'string')
  ) {
    return capabilities.join(', ');
  }
  return '';
}

function toGalleryTemplate(value: unknown): GalleryTemplate | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.slug !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.category !== 'string' ||
    typeof row.forks !== 'number'
  ) {
    return null;
  }
  return {
    id: row.slug,
    name: row.name,
    category: row.category,
    forks: row.forks,
    detail: detailForCard(row),
  };
}

interface ForkSuccess {
  botId: string;
  inviteUrl: string;
}

interface ForkFailure {
  message: string;
  loggedOut: boolean;
}

/* Refusal reader lives in lib/http/refusal.ts (shared forkErrorMessage
   import above). Non-401 fork failures surface the route's own reason: a
   KI-033 trial refusal arrives as { error: <code>, message: <the honest
   sentence> } — the route writes both (/api/templates/[slug]/fork), so the
   person reads the reason in words instead of a code like
   'trial_bot_limit'. `message` is preferred for that reason; `error` stays
   the fallback for the code-only shape, and a body with neither degrades to
   the status line. */

/* Discord glyph path ported 1:1 from the landing template cards (app/page.tsx)
   so the gallery tile centers the same mark. Defined once per page as a symbol. */
const DISCORD_PATH =
  'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z';

/* Category tone mapping ported from the landing cards: moderation/automod-family
   → emerald, support-family → sky, onboarding/welcome-family → rose. The gallery's
   remaining categories reuse the closest of the three — no new hues. */
type TileTone = 'emerald' | 'sky' | 'rose';

const TILE_GLOWS: Record<TileTone, string> = {
  emerald: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(16,185,129,0.18), transparent 70%)',
  sky: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(56,189,248,0.18), transparent 70%)',
  rose: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(251,113,133,0.18), transparent 70%)',
};

function toneForCategory(category: string): TileTone {
  const c = category.toLowerCase();
  if (c.includes('mod') || c.includes('automod') || c === 'logs') return 'emerald';
  if (c.includes('welc') || c.includes('onboard') || c.includes('role')) return 'rose';
  return 'sky';
}

export default function GalleryPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  /* Live list, honest on failure: the grid starts unloaded and fills from
     GET /api/templates only on a fully valid 200 payload. Any failure
     (network, non-200, bad JSON, shape mismatch) renders the honest
     unavailable state — never mock rows. `null` means "request in flight" so
     the loading shell holds until the fetch resolves — never the no-match
     empty state as a stand-in. */
  const [templates, setTemplates] = useState<GalleryTemplate[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [forked, setForked] = useState<string[]>([]);
  const [forking, setForking] = useState<string[]>([]);
  const [forkResults, setForkResults] = useState<Record<string, ForkSuccess>>({});
  const [forkErrors, setForkErrors] = useState<Record<string, ForkFailure>>({});

  useEffect(() => {
    let active = true;
    fetch('/api/templates')
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          if (active) setLoadFailed(true);
          return;
        }
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          if (active) setLoadFailed(true);
          return;
        }
        if (!active) return;
        const rows =
          typeof payload === 'object' && payload !== null
            ? (payload as { templates?: unknown }).templates
            : undefined;
        if (!Array.isArray(rows)) {
          setLoadFailed(true);
          return;
        }
        const mapped: GalleryTemplate[] = [];
        for (const row of rows) {
          const template = toGalleryTemplate(row);
          if (template === null) {
            setLoadFailed(true);
            return;
          }
          mapped.push(template);
        }
        if (!active) return;
        setTemplates(mapped);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /* Fork one card through the real transactional route. Success marks the
     card Forked (+1) and exposes the new bot page plus the invite URL;
     every failure stays on the card as text — never a fake success. */
  async function forkTemplate(template: GalleryTemplate): Promise<void> {
    if (forking.includes(template.id) || forked.includes(template.id)) return;
    setForking((prev) => [...prev, template.id]);
    setForkErrors((prev) => {
      if (!(template.id in prev)) return prev;
      const next = { ...prev };
      delete next[template.id];
      return next;
    });
    try {
      const response = await fetch(`/api/templates/${encodeURIComponent(template.id)}/fork`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (response.status === 401) {
        setForkErrors((prev) => ({
          ...prev,
          [template.id]: { message: 'logged out', loggedOut: true },
        }));
        return;
      }
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        setForkErrors((prev) => ({
          ...prev,
          [template.id]: {
            message: forkErrorMessage(payload, response.status),
            loggedOut: false,
          },
        }));
        return;
      }
      const record =
        typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>)
          : null;
      const botId = record?.botId;
      const inviteUrl = record?.inviteUrl;
      if (
        typeof botId !== 'string' ||
        botId === '' ||
        typeof inviteUrl !== 'string' ||
        inviteUrl === ''
      ) {
        setForkErrors((prev) => ({
          ...prev,
          [template.id]: { message: 'Fork failed. Try again.', loggedOut: false },
        }));
        return;
      }
      setForkResults((prev) => ({ ...prev, [template.id]: { botId, inviteUrl } }));
      setForked((prev) => [...prev, template.id]);
    } catch {
      setForkErrors((prev) => ({
        ...prev,
        [template.id]: { message: 'Could not reach the server. Try again.', loggedOut: false },
      }));
    } finally {
      setForking((prev) => prev.filter((id) => id !== template.id));
    }
  }

  const categories = useMemo(
    () => Array.from(new Set((templates ?? []).map((template) => template.category))),
    [templates],
  );

  const needle = query.trim().toLowerCase();
  const visible = (templates ?? []).filter((template) => {
    const inCategory = category === ALL || template.category === category;
    const inSearch =
      needle === '' ||
      template.name.toLowerCase().includes(needle) ||
      template.detail.toLowerCase().includes(needle);
    return inCategory && inSearch;
  });

  function clearFilters() {
    setQuery('');
    setCategory(ALL);
  }

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <DashboardRail />
      <main id="main-content" className={styles.content}>
        <div className={styles.inner}>
          <header className={styles.head}>
            <h1 className={styles.title}>Templates</h1>
            <p className={styles.sub}>
              Fork a template to your bots, then customize it with AI.
            </p>
          </header>

          <section className={styles.filterBand} aria-label="Filter templates">
            <div className={styles.searchField}>
              <label className={styles.searchLabel} htmlFor="gallery-search">
                Search templates
              </label>
              <input
                id="gallery-search"
                className={styles.search}
                type="search"
                placeholder="Search by name or detail"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className={styles.pillRow} role="group" aria-label="Filter by category">
              <button
                type="button"
                aria-pressed={category === ALL}
                className={category === ALL ? styles.pillActive : styles.pill}
                onClick={() => setCategory(ALL)}
              >
                {ALL}
              </button>
              {categories.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={category === name}
                  className={category === name ? styles.pillActive : styles.pill}
                  onClick={() => setCategory(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>

          {loadFailed && (templates === null || templates.length === 0) ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Templates unavailable — try again.</p>
            </div>
          ) : templates === null ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Loading templates…</p>
            </div>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>No templates match that search.</p>
              <button type="button" className={styles.clear} onClick={clearFilters}>
                Clear search
              </button>
            </div>
          ) : (
            <>
              <svg width="0" height="0" className={styles.spriteDef} aria-hidden="true">
                <symbol id="discordGlyph" viewBox="0 0 24 24">
                  <path fill="currentColor" d={DISCORD_PATH} />
                </symbol>
              </svg>
              <ul className={styles.grid}>
                {visible.map((template) => {
                  const isForked = forked.includes(template.id);
                  const isForking = forking.includes(template.id);
                  const result = forkResults[template.id];
                  const failure = forkErrors[template.id];
                  const forks = template.forks + (isForked ? 1 : 0);
                  const tone = toneForCategory(template.category);
                  const tagTone =
                    tone === 'emerald'
                      ? styles.tileTagEmerald
                      : tone === 'sky'
                        ? styles.tileTagSky
                        : styles.tileTagRose;
                  return (
                    <li key={template.id}>
                      <article className={styles.card}>
                        <div>
                          <div className={styles.tTileWrap}>
                            <div className={styles.tile}>
                              <div
                                aria-hidden="true"
                                className={styles.tileGlow}
                                style={{ background: TILE_GLOWS[tone] }}
                              />
                              <svg
                                className={styles.tileGlyph}
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <use href="#discordGlyph" />
                              </svg>
                              <div className={styles.tilePill}>
                                <span>Template</span>
                              </div>
                              <div className={`${styles.tileTag} ${tagTone}`}>
                                {template.category.toUpperCase()}
                              </div>
                            </div>
                          </div>
                          <div className={styles.tBody}>
                            <div className={styles.tMeta}>
                              <span className={styles.forks} aria-label={`${forks} forks`}>
                                {forks} forks
                              </span>
                            </div>
                            <div className={styles.tTitleRow}>
                              <h3 className={styles.tTitle}>
                                <a href={`/gallery/${encodeURIComponent(template.id)}`}>
                                  {template.name}
                                </a>
                              </h3>
                              <span className={styles.botBadge}>BOT</span>
                            </div>
                            <p className={styles.cardDetail}>{template.detail}</p>
                            <div className={styles.tagRow}>
                              <span className={styles.tag}>#{template.id}</span>
                              <span className={styles.tag}>#{template.category.toLowerCase()}</span>
                            </div>
                            {isForked && result !== undefined ? (
                              <p className={styles.cardDetail}>
                                <a href={`/dashboard/bots/${result.botId}`}>Open your bot</a>
                                {' · '}
                                <a href={result.inviteUrl} target="_blank" rel="noopener">
                                  Add to Discord (shared test app)
                                </a>
                                {' · '}
                                <a href={`/dashboard/bots/${result.botId}`}>
                                  Customize with AI
                                </a>
                              </p>
                            ) : null}
                            {failure !== undefined ? (
                              failure.loggedOut ? (
                                <p className={styles.cardDetail} role="alert">
                                  You are logged out — <a href="/api/auth/login">log in</a>, then
                                  fork again.
                                </p>
                              ) : (
                                <p className={styles.cardDetail} role="alert">
                                  {failure.message}
                                </p>
                              )
                            ) : null}
                          </div>
                        </div>
                        <div className={styles.cardFoot}>
                          {isForked ? (
                            <button type="button" className={styles.forked} disabled>
                              Forked
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.fork}
                              disabled={isForking}
                              onClick={() => void forkTemplate(template)}
                            >
                              {isForking ? 'Forking…' : 'Fork'}
                            </button>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
