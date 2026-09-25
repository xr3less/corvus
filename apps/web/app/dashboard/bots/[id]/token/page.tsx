'use client';

/* Bot token panel (E6 token custody): the owner pastes a bot token, the API
   stores it encrypted, and this page shows presence-only status
   (`saved · N chars`) — never the value, never logged. The pasted token
   lives only in the local input state, is cleared after every save attempt,
   and is never printed anywhere. */

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import styles from '../page.module.css';

const LOGIN_HREF = '/api/auth/login';
const LOGGED_OUT_LINE = 'You are logged out — log in again, then try again.';

type PresenceState =
  | { status: 'loading' }
  | { status: 'live'; saved: boolean; length: number }
  | { status: 'unauthorized' }
  | { status: 'missing' }
  | { status: 'error'; text: string };

interface ActionNote {
  text: string;
  login?: boolean;
}

function TokenPanelInner() {
  const routeParams = useParams<{ id: string }>();
  const id = typeof routeParams?.id === 'string' ? routeParams.id : '';

  const [presence, setPresence] = useState<PresenceState>({ status: 'loading' });
  const [presenceNonce, setPresenceNonce] = useState(0);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<ActionNote | null>(null);

  useEffect(() => {
    if (id.length === 0) {
      setPresence({ status: 'missing' });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setPresence({ status: 'loading' });
    void (async () => {
      try {
        const response = await fetch(`/api/bots/${id}/token`, {
          signal: controller.signal,
        });
        if (!active) return;
        if (response.status === 401) {
          setPresence({ status: 'unauthorized' });
          return;
        }
        if (response.status === 404) {
          setPresence({ status: 'missing' });
          return;
        }
        if (!response.ok) {
          setPresence({
            status: 'error',
            text: 'Could not load the token status — try again.',
          });
          return;
        }
        const payload: unknown = await response.json().catch(() => ({}));
        if (!active) return;
        if (typeof payload !== 'object' || payload === null) {
          setPresence({
            status: 'error',
            text: 'Could not load the token status — try again.',
          });
          return;
        }
        const record = payload as Record<string, unknown>;
        const saved = record.saved === true;
        const length = typeof record.length === 'number' ? record.length : -1;
        if (!Number.isInteger(length) || length < 0) {
          setPresence({
            status: 'error',
            text: 'Could not load the token status — try again.',
          });
          return;
        }
        setPresence({ status: 'live', saved, length });
      } catch {
        if (active) {
          setPresence({
            status: 'error',
            text: 'Could not load the token status — check your connection and try again.',
          });
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, presenceNonce]);

  async function runSave(): Promise<void> {
    if (saving) return;
    if (token.trim().length === 0) {
      setNote({ text: 'Paste a token first, then save it.' });
      return;
    }
    setSaving(true);
    setNote(null);
    try {
      const response = await fetch(`/api/bots/${id}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (response.status === 401) {
        setNote({ text: LOGGED_OUT_LINE, login: true });
        return;
      }
      const payload: unknown = await response.json().catch(() => ({}));
      if (response.ok) {
        const record =
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>)
            : {};
        const length = typeof record.length === 'number' ? record.length : -1;
        if (record.saved === true && Number.isInteger(length) && length >= 0) {
          setPresence({ status: 'live', saved: true, length });
          setNote({ text: `Saved · ${length} characters.` });
        } else {
          setNote({ text: 'Saved.' });
          setPresenceNonce((nonce) => nonce + 1);
        }
        return;
      }
      if (response.status === 404) {
        setNote({ text: 'No bot with this address — it may have been deleted.' });
        return;
      }
      if (response.status === 422) {
        setNote({ text: 'That token looks empty or too long — paste it again.' });
        return;
      }
      setNote({ text: 'Could not save — try again.' });
    } catch {
      setNote({ text: 'Could not save — check your connection and try again.' });
    } finally {
      // The pasted value is never kept around: clear it whether the save
      // succeeded or not, so it cannot be rendered back later.
      setToken('');
      setSaving(false);
    }
  }

  return (
    <div className={styles.detailScroll}>
      <div className={styles.detailInner}>
        <a href="/dashboard/bots" className={styles.backLink}>
          ← All bots
        </a>
        {id.length > 0 ? (
          <a href={`/dashboard/bots/${encodeURIComponent(id)}`} className={styles.backLink}>
            ← Back to bot
          </a>
        ) : null}
        <div className={styles.detailHead}>
          <h1 className={styles.detailTitle}>Bot token</h1>
          <p className={styles.todaySentence}>
            Paste the token from the Discord developer portal. It is stored encrypted and never
            shown again — not here, not in logs. Only the length is displayed so you can confirm
            a save.
          </p>
        </div>
        <section aria-label="Token status" className={styles.card}>
          <h2 className={styles.cardTitle}>Status</h2>
          {presence.status === 'loading' ? (
            <p className={styles.todaySentence}>Loading token status…</p>
          ) : presence.status === 'live' ? (
            <p role="status" className={styles.todaySentence}>
              {presence.saved
                ? `Saved · ${presence.length} characters.`
                : 'No token saved yet.'}
            </p>
          ) : presence.status === 'unauthorized' ? (
            <p className={styles.todaySentence}>
              {LOGGED_OUT_LINE} <a href={LOGIN_HREF}>Log in</a>
            </p>
          ) : presence.status === 'missing' ? (
            <p className={styles.todaySentence}>
              No bot with this address — it may have been deleted.
            </p>
          ) : presence.status === 'error' ? (
            <p className={styles.todaySentence}>
              {presence.text}{' '}
              <button
                type="button"
                className={styles.textAction}
                onClick={() => setPresenceNonce((nonce) => nonce + 1)}
              >
                Retry
              </button>
            </p>
          ) : null}
        </section>
        <section aria-label="Save a token" className={styles.card}>
          <h2 className={styles.cardTitle}>Save a token</h2>
          <div className={styles.actionRow}>
            <Input
              id="bot-token"
              label="Bot token"
              type="password"
              placeholder="Paste the token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => void runSave()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save token'}
            </button>
          </div>
          {note !== null ? (
            <p role="status" className={styles.todaySentence}>
              {note.text}
              {note.login === true ? (
                <>
                  {' '}
                  <a href={LOGIN_HREF}>Log in</a>
                </>
              ) : null}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function BotTokenPage() {
  return (
    <Suspense>
      <TokenPanelInner />
    </Suspense>
  );
}
