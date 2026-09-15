'use client';

/*
 * /pick — DEV-ONLY component picker (round 1: text inputs).
 * Unlinked route: no prod navigation points here. Votes persist to
 * localStorage for this browser and POST to /api/pick/vote so the orchestrator
 * can read `.pick-votes/votes.json` from disk.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { VARIANTS } from './variants';
import './pick.css';

const STORAGE_KEY = 'pick:input:round1';
const VOTE_ENDPOINT = '/api/pick/vote';

export default function PickPage(): ReactElement {
  const [picked, setPicked] = useState<readonly string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setPicked(parsed.filter((value): value is string => typeof value === 'string'));
      }
    } catch {
      // Dev-only tool: an unreadable localStorage must not break the page.
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setPicked((current) => {
      const has = current.includes(id);
      const next = has ? current.filter((value) => value !== id) : [...current, id];
      const delta = has ? -1 : 1;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage full/disabled: the in-memory selection still works.
      }
      void fetch(VOTE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: id, delta }),
      }).catch(() => undefined);
      return next;
    });
  }, []);

  return (
    <main className="pick-root">
      <div className="pick-shell">
        <header className="pick-head">
          <div>
            <h1 className="pick-title">Hangisi güzel?</h1>
            <p className="pick-sub">Metin kutusu — 1. tur. Birden fazla seçebilirsin.</p>
          </div>
          <Link href="/pick/results" className="pick-focus pick-results-link">
            Sonuçlar →
          </Link>
        </header>

        <div className="pick-grid">
          {VARIANTS.map((variant) => {
            const selected = picked.includes(variant.id);
            return (
              <section key={variant.id} className="pick-card">
                <div className="pick-card-head">
                  <h2 className="pick-card-name">{variant.name}</h2>
                  <span
                    className={
                      variant.origin === 'ours'
                        ? 'pick-origin pick-origin-ours'
                        : 'pick-origin pick-origin-ref'
                    }
                  >
                    {variant.origin === 'ours' ? 'bizim' : 'shadcn tarzı'}
                  </span>
                </div>

                <div className="pick-sample">{variant.render()}</div>

                <button
                  type="button"
                  className={
                    selected ? 'pick-focus pick-vote pick-vote-on' : 'pick-focus pick-vote'
                  }
                  aria-pressed={selected}
                  onClick={() => toggle(variant.id)}
                >
                  <span
                    className={selected ? 'pick-check pick-check-on' : 'pick-check'}
                    aria-hidden="true"
                  />
                  {selected ? 'Seçildi' : 'Seç'}
                </button>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
