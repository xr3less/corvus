'use client';

/* Template detail (E3 — gallery truth): a template detail page previews
   behaviors before forking, and a template can seed the new-bot chat composer
   via the "Start in chat" link (?template=<slug>).

   Consumes the EXISTING GET /api/templates/[slug] only — no new API. Fork
   posts to the EXISTING POST /api/templates/[slug]/fork and surfaces the
   documented handoff (fork/route.ts:62-66): Open your bot, the shared-app
   invite URL, and Customize with AI → /dashboard/bots/[botId].
   gallery/page.tsx copy is a sibling agent's scope — untouched here. */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DashboardRail } from '@/components/ui/dashboard-rail';
import { forkErrorMessage } from '@/lib/http/refusal';
import styles from '../page.module.css';

interface BehaviorPreview {
  title: string;
  detail: string;
}

interface PermWhy {
  perm: string;
  why: string;
}

interface TemplateDetail {
  slug: string;
  name: string;
  category: string;
  capabilities: string[];
  permsNeeded: PermWhy[];
  permsUnlisted: boolean;
  forks: number;
  semver: string;
  behaviors: BehaviorPreview[] | null;
  serverPack: string | null;
}

const SLUG_RE = /^[a-z0-9-]{1,64}$/;

/* source_spec is opaque to the web tier (SPEC_VERSION 1, z.unknown): preview
   only entries shaped { title, detail } and the server_pack suggestion
   string. Anything else shape yields nulls and the honest fallback lines —
   never a crash, never invented rows. */
function behaviorPreviewOf(sourceSpec: unknown): {
  behaviors: BehaviorPreview[] | null;
  serverPack: string | null;
} {
  if (typeof sourceSpec !== 'object' || sourceSpec === null) {
    return { behaviors: null, serverPack: null };
  }
  const record = sourceSpec as Record<string, unknown>;
  let behaviors: BehaviorPreview[] | null = null;
  if (Array.isArray(record.behaviors)) {
    const previews: BehaviorPreview[] = [];
    for (const entry of record.behaviors) {
      if (typeof entry !== 'object' || entry === null) continue;
      const row = entry as Record<string, unknown>;
      if (typeof row.title === 'string' && typeof row.detail === 'string') {
        previews.push({ title: row.title, detail: row.detail });
      }
    }
    behaviors = previews;
  }
  const serverPack = typeof record.server_pack === 'string' ? record.server_pack : null;
  return { behaviors, serverPack };
}

function toTemplateDetail(value: unknown): TemplateDetail | null {
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
  const capabilities = Array.isArray(row.capabilities)
    ? row.capabilities.filter((entry): entry is string => typeof entry === 'string')
    : [];
  let permsNeeded: PermWhy[] = [];
  let permsUnlisted = false;
  if (Array.isArray(row.perms_needed)) {
    const needs: PermWhy[] = [];
    for (const entry of row.perms_needed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const need = entry as Record<string, unknown>;
      if (typeof need.perm === 'string' && typeof need.why === 'string') {
        needs.push({ perm: need.perm, why: need.why });
      }
    }
    permsNeeded = needs;
  } else {
    permsUnlisted = true;
  }
  const { behaviors, serverPack } = behaviorPreviewOf(row.source_spec);
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    capabilities,
    permsNeeded,
    permsUnlisted,
    forks: row.forks,
    semver: typeof row.semver === 'string' ? row.semver : '1.0.0',
    behaviors,
    serverPack,
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

export default function TemplateDetailPage() {
  const routeParams = useParams<{ slug: string }>();
  const rawSlug = typeof routeParams?.slug === 'string' ? routeParams.slug : '';
  const slugValid = SLUG_RE.test(rawSlug);

  /* Live detail, honest on failure: null means "request in flight" so the
     loading shell holds until the fetch resolves — never a half-mapped page.
     A malformed slug never fetches (indistinguishable 404, no leak). */
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [forked, setForked] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkResult, setForkResult] = useState<ForkSuccess | null>(null);
  const [forkError, setForkError] = useState<ForkFailure | null>(null);

  useEffect(() => {
    if (!slugValid) {
      setLoadFailed(true);
      return;
    }
    let active = true;
    fetch(`/api/templates/${encodeURIComponent(rawSlug)}`)
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setLoadFailed(true);
          return;
        }
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          setLoadFailed(true);
          return;
        }
        if (!active) return;
        const detail = toTemplateDetail(payload);
        if (detail === null) setLoadFailed(true);
        else setTemplate(detail);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [rawSlug, slugValid]);

  /* Fork through the real transactional route — the same idiom as
     gallery/page.tsx. Success exposes the new bot page, the shared-app
     invite URL, and Customize with AI; every failure stays on the page as
     text — never a fake success. */
  async function forkTemplate(detail: TemplateDetail): Promise<void> {
    if (forking || forked) return;
    setForking(true);
    setForkError(null);
    try {
      const response = await fetch(`/api/templates/${encodeURIComponent(detail.slug)}/fork`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (response.status === 401) {
        setForkError({ message: 'logged out', loggedOut: true });
        return;
      }
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        setForkError({ message: forkErrorMessage(payload, response.status), loggedOut: false });
        return;
      }
      const record =
        typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>)
          : null;
      const botId = record?.botId;
      const inviteUrl = record?.inviteUrl;
      if (typeof botId !== 'string' || botId === '' || typeof inviteUrl !== 'string' || inviteUrl === '') {
        setForkError({ message: 'Fork failed. Try again.', loggedOut: false });
        return;
      }
      setForkResult({ botId, inviteUrl });
      setForked(true);
    } catch {
      setForkError({ message: 'Could not reach the server. Try again.', loggedOut: false });
    } finally {
      setForking(false);
    }
  }

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <DashboardRail />
      <main id="main-content" className={styles.content}>
        <div className={styles.inner}>
          <p>
            <a href="/gallery">← All templates</a>
          </p>
          {loadFailed ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Template unavailable — try again.</p>
              <a href="/gallery" className={styles.clear}>
                Back to templates
              </a>
            </div>
          ) : template === null ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Loading template…</p>
            </div>
          ) : (
            <>
              <header className={styles.head}>
                <h1 className={styles.title}>{template.name}</h1>
                <p className={styles.sub}>
                  {template.category} · {template.forks + (forked ? 1 : 0)} forks · v
                  {template.semver}
                </p>
              </header>

              <section aria-label="What this template does">
                <h2>What this template does</h2>
                {template.behaviors === null || template.behaviors.length === 0 ? (
                  <p className={styles.cardDetail}>No behavior preview listed.</p>
                ) : (
                  <ul>
                    {template.behaviors.map((behavior) => (
                      <li key={behavior.title}>
                        <strong>{behavior.title}</strong> — {behavior.detail}
                      </li>
                    ))}
                  </ul>
                )}
                {template.serverPack !== null ? (
                  <p className={styles.cardDetail}>{template.serverPack}</p>
                ) : null}
              </section>

              <section aria-label="Capabilities">
                <h2>Capabilities</h2>
                {template.capabilities.length === 0 ? (
                  <p className={styles.cardDetail}>No capabilities listed.</p>
                ) : (
                  <div className={styles.tagRow}>
                    {template.capabilities.map((capability) => (
                      <span key={capability} className={styles.tag}>
                        {capability}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section aria-label="Permissions it needs">
                <h2>Permissions it needs</h2>
                {template.permsUnlisted ? (
                  <p className={styles.cardDetail}>Permissions not listed.</p>
                ) : template.permsNeeded.length === 0 ? (
                  <p className={styles.cardDetail}>No extra permissions needed.</p>
                ) : (
                  <ul>
                    {template.permsNeeded.map((need) => (
                      <li key={need.perm}>
                        <strong>{need.perm}</strong> — {need.why}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Fork this template">
                <h2>Get this template</h2>
                <p>
                  <a href={`/dashboard/new?template=${encodeURIComponent(template.slug)}`}>
                    Start in chat
                  </a>
                </p>
                {forked && forkResult !== null ? (
                  <>
                    <button type="button" className={styles.forked} disabled>
                      Forked
                    </button>
                    <p className={styles.cardDetail}>
                      <a href={`/dashboard/bots/${forkResult.botId}`}>Open your bot</a>
                      {' · '}
                      <a href={forkResult.inviteUrl} target="_blank" rel="noopener">
                        Add to Discord (shared test app)
                      </a>
                      {' · '}
                      <a href={`/dashboard/bots/${forkResult.botId}`}>Customize with AI</a>
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.fork}
                    disabled={forking}
                    onClick={() => void forkTemplate(template)}
                  >
                    {forking ? 'Forking…' : 'Fork'}
                  </button>
                )}
                {forkError !== null ? (
                  forkError.loggedOut ? (
                    <p className={styles.cardDetail} role="alert">
                      You are logged out — <a href="/api/auth/login">log in</a>, then fork again.
                    </p>
                  ) : (
                    <p className={styles.cardDetail} role="alert">
                      {forkError.message}
                    </p>
                  )
                ) : null}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
