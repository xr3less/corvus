'use client';

/* New-bot chat page (D-118): ChatGPT-style thread streaming via the shared
   hook (botId null — no bot exists yet). Composer stays locked open; chips
   only fill it. Refresh starts a fresh thread by construction. */
import { useRef, useState } from 'react';
import { PromptInput } from '@/components/ui/ai-chat-input';
import { ChatAssistantRow } from '@/components/ui/chat-thread';
import { useChatStream } from '@/components/ui/use-chat-stream';
import threadStyles from '@/components/ui/chat-thread.module.css';
import styles from './page.module.css';

/* Starter prompts — a click fills the composer; the composer is the only
   place a change is sent from. */
const SUGGESTIONS = ['Welcome message', 'Moderation rule', 'XP rewards'];

export default function NewBotPage() {
  const [brief, setBrief] = useState('');
  const composerRef = useRef<HTMLDivElement>(null);
  const { messages, streaming, submit, retry } = useChatStream(null);

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
              onSubmit={(value, meta) => submit(value, meta.attachments)}
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
