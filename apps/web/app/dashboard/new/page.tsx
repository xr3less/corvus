'use client';

/* New-bot chat page (D-118 + KI-027): ChatGPT-style thread streaming via the
   shared hook. Composer stays locked open; chips only fill it. Refresh starts
   a fresh thread by construction.
   KI-027: mint-on-first-submit — the first submit fires POST /api/bots once
   (derived name) without blocking the chat turn (first turn streams with the
   current null id); the minted id is committed to state once no stream is in
   flight and passed to useChatStream, so turn two carries it. A Build button
   (disabled until the bot id exists) posts { botId, brief } to
   /api/builder/start and renders the ?runId= link. */
import { useEffect, useRef, useState } from 'react';
import { PromptInput } from '@/components/ui/ai-chat-input';
import { ChatAssistantRow } from '@/components/ui/chat-thread';
import { useChatStream } from '@/components/ui/use-chat-stream';
import threadStyles from '@/components/ui/chat-thread.module.css';
import styles from './page.module.css';

/* Starter prompts — a click fills the composer; the composer is the only
   place a change is sent from. */
const SUGGESTIONS = ['Welcome message', 'Moderation rule', 'XP rewards'];

const MINT_FALLBACK_ERROR = 'Could not save your bot. Your chat is kept — try again.';
const START_FALLBACK_ERROR = 'Could not start the build. Try again.';

function deriveBotName(text: string): string {
  return text.trim().slice(0, 32).trim() || 'Untitled bot';
}

export default function NewBotPage() {
  const [brief, setBrief] = useState('');
  const composerRef = useRef<HTMLDivElement>(null);
  /* Draft bot id: null until the first-submit mint lands. The chat hook reads
     the latest id per render through its own ref, so passing state is enough
     — no hook change. */
  const [botId, setBotId] = useState<string | null>(null);
  /* Minted id waiting for a quiet moment: the hook aborts the in-flight
     stream when its botId arg changes, so the id is committed only once no
     stream is open. Observable behavior is identical (first turn uses null,
     second turn carries the id) without dropping the first reply. */
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  /* Exactly-once mint guard (synchronous ref: a second submit while the first
     mint is still in flight must not re-mint) + the first user message, which
     is both the mint name source and the build brief. */
  const mintAttemptedRef = useRef(false);
  const firstBriefRef = useRef<string | null>(null);
  const { messages, streaming, submit, retry } = useChatStream(botId);

  useEffect(() => {
    if (!streaming && pendingBotId !== null && botId === null) {
      setBotId(pendingBotId);
      setPendingBotId(null);
    }
  }, [streaming, pendingBotId, botId]);

  function mintOnce(text: string) {
    const botName = deriveBotName(text);
    fetch('/api/bots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botName }),
    })
      .then(async (response) => {
        if (!response.ok) {
          let message = MINT_FALLBACK_ERROR;
          try {
            const data = (await response.json()) as { error?: unknown };
            if (typeof data.error === 'string' && data.error.trim() !== '') {
              message = data.error;
            }
          } catch {
            /* keep the honest fallback */
          }
          setMintError(message);
          return;
        }
        try {
          const data = (await response.json()) as { botId?: unknown };
          if (typeof data.botId === 'string' && data.botId.length > 0) {
            setPendingBotId(data.botId);
          } else {
            setMintError(MINT_FALLBACK_ERROR);
          }
        } catch {
          setMintError(MINT_FALLBACK_ERROR);
        }
      })
      .catch(() => {
        setMintError(MINT_FALLBACK_ERROR);
      });
  }

  /* First submit mints (fire-and-forget beside the chat turn); every submit —
     including the first — streams exactly as before. */
  function handleSubmit(value: string, attachments: File[]) {
    const text = value.trim();
    if (text === '') return;
    if (!mintAttemptedRef.current) {
      mintAttemptedRef.current = true;
      firstBriefRef.current = text;
      mintOnce(text);
    }
    submit(value, attachments);
  }

  /* Build mirrors the detail page's runStartBuild: brief = first user message
     (same 1..2000 rule as the start route), then the ?runId= link. */
  async function handleBuild() {
    if (botId === null || building) return;
    setBuildError(null);
    const briefText = (firstBriefRef.current ?? '').trim();
    if (briefText.length === 0) {
      setBuildError('Describe your bot in a few words before building.');
      return;
    }
    if (briefText.length > 2000) {
      setBuildError('Keep the brief under 2000 characters.');
      return;
    }
    setBuilding(true);
    try {
      const response = await fetch('/api/builder/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botId, brief: briefText }),
      });
      if (response.status === 401) {
        setBuildError('You are logged out. Log in again to start the build.');
        return;
      }
      if (response.status === 404) {
        setBuildError('This bot is not saved yet. Send a message and try again.');
        return;
      }
      if (!response.ok) {
        let message = START_FALLBACK_ERROR;
        try {
          const data = (await response.json()) as { error?: unknown };
          if (typeof data.error === 'string' && data.error.trim() !== '') {
            message = data.error;
          }
        } catch {
          /* keep the honest fallback */
        }
        setBuildError(message);
        return;
      }
      const data = (await response.json()) as { runId?: unknown };
      if (typeof data.runId === 'string' && data.runId.length > 0) {
        setRunId(data.runId);
      } else {
        setBuildError(START_FALLBACK_ERROR);
      }
    } catch {
      setBuildError(START_FALLBACK_ERROR);
    } finally {
      setBuilding(false);
    }
  }

  /* A chip only fills the composer — it never sends. */
  function applySuggestion(text: string) {
    setBrief(text);
    composerRef.current?.querySelector('textarea')?.focus();
  }

  return (
    <>
      <div className={styles.newTop}>
        <a href="/dashboard/bots" className={styles.backLink}>
          ← All bots
        </a>
      </div>
      {/* Layout provides shell + main landmark; this page owns scroll + composer. */}
      <div className={styles.newScroll}>
        <div className={styles.newInner}>
          <section aria-label="Describe your new bot" className={styles.hero}>
            <h1 className={styles.heroTitle}>What will your bot do today?</h1>
            {messages.length === 0 ? (
              <p className={styles.heroSub}>
                Describe it in plain words — we draft it, you test it, then it goes live.
              </p>
            ) : null}
          </section>
          {messages.length > 0 ? (
            <ul aria-label="New bot conversation" className={styles.newThread}>
              {messages.map((message) =>
                message.role === 'user' ? (
                  <li key={message.id} className={styles.newUserRow}>
                    <span className={styles.newUserBubble}>{message.text}</span>
                  </li>
                ) : (
                  <ChatAssistantRow key={message.id} message={message} onRetry={retry} />
                ),
              )}
            </ul>
          ) : null}
          <div>
            <button type="button" onClick={handleBuild} disabled={botId === null || building}>
              Build this bot
            </button>
            {mintError !== null ? <p role="alert">{mintError}</p> : null}
            {buildError !== null ? <p role="alert">{buildError}</p> : null}
            {runId !== null ? <a href={`/dashboard?runId=${runId}`}>View build progress</a> : null}
          </div>
        </div>
      </div>
      <div className={styles.newAiBar}>
        <div className={styles.newAiInner}>
          <div className={streaming ? threadStyles.composerLocked : undefined} inert={streaming}>
            <div
              role="group"
              aria-label="Suggested changes"
              className={`${threadStyles.suggestionRow} ${styles.heroSuggestions}`}
            >
              {SUGGESTIONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => applySuggestion(label)}
                  className={threadStyles.suggestionChip}
                >
                  {label}
                </button>
              ))}
            </div>
            <PromptInput
              ref={composerRef}
              placeholder="Describe the bot you want…"
              value={brief}
              onChange={setBrief}
              onSubmit={(value, meta) => handleSubmit(value, meta.attachments)}
              forceExpanded
            />
            <p className={`${threadStyles.composerCost} ${styles.heroCost}`}>
              About 1.1 credits per change · platform failures retry free.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
