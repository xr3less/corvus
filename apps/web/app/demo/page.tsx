'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import styles from './page.module.css';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

interface DemoSuccess {
  reply?: unknown;
}

interface DemoLimited {
  retryAfterSeconds?: unknown;
}

function focusDemoInput(): void {
  const el = document.getElementById('demo-message');
  if (el instanceof HTMLInputElement) {
    el.focus();
  }
}

export default function DemoPage(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(raw: string): Promise<void> {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || loading) {
      return;
    }
    setLoading(true);
    setNotice(null);
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setDraft('');
    try {
      const res = await fetch('/api/demo/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      const data: unknown = await res.json();
      if (res.status === 429) {
        let seconds = 0;
        if (typeof data === 'object' && data !== null) {
          const v = (data as DemoLimited).retryAfterSeconds;
          if (typeof v === 'number' && Number.isFinite(v)) {
            seconds = v;
          }
        }
        setNotice(`Slow down - retry in ${seconds} seconds.`);
        return;
      }
      if (!res.ok) {
        setNotice('That message was not accepted - edit it and try again.');
        return;
      }
      let reply = 'No reply - try again.';
      if (typeof data === 'object' && data !== null) {
        const v = (data as DemoSuccess).reply;
        if (typeof v === 'string' && v.length > 0) {
          reply = v;
        }
      }
      setMessages((prev) => [...prev, { role: 'bot', text: reply }]);
    } catch {
      setNotice('The demo is unreachable - check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await send(draft);
  }

  return (
    <main className={styles.page}>
      <Card title="Demo">
        <p className={styles.honest}>Scripted preview — the AI builder arrives after signup.</p>
        {messages.length === 0 ? (
          <EmptyState
            message="Say hello - no signup needed."
            actionLabel="Focus the input"
            onAction={focusDemoInput}
          />
        ) : (
          <ul className={styles.list} aria-live="polite">
            {messages.map((m, index) => (
              <li key={index} className={m.role === 'user' ? styles.user : styles.bot}>
                <span className={styles.role}>{m.role === 'user' ? 'You' : 'Demo'}</span>
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        )}
        {loading ? (
          <p className={styles.status} role="status">
            Sending...
          </p>
        ) : null}
        {notice !== null ? (
          <p className={styles.alert} role="alert">
            {notice}
          </p>
        ) : null}
        <form className={styles.form} onSubmit={onSubmit}>
          <Input
            id="demo-message"
            label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Say hello"
            disabled={loading}
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={draft.trim().length === 0 || loading}
          >
            Send
          </Button>
        </form>
      </Card>
    </main>
  );
}
