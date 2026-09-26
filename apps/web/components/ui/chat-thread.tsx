/* One assistant reply in a chat thread (D-118): thinking trace, streamed
   answer, honest error with Retry, spent line. Both chat pages render their
   user rows themselves (bubble vs activity row differ by design); this owns
   the assistant side once instead of twice.
   Turkish copy (F7, 2026-09-24): the owner reads Turkish, so every string
   this file renders is Turkish — an English control word here is a dead end
   for them. The copy mirrors the shipped Turkish on `/dashboard/new` (its
   `Tekrar dene` retry line and `platform kaynaklı hata…` cost line) instead
   of inventing a second wording for the same idea. This component is shared
   with `/dashboard/bots/[id]`, whose page shell is still English; that makes
   the thread rows Turkish inside an English page, which is recorded for the
   orchestrator rather than silently decided here. */
import type { ReactNode } from 'react';
import { ThinkingTrace } from './thinking-trace';
import { formatCredits, type ThreadRow } from '@/lib/chat/thread';
import styles from './chat-thread.module.css';

export interface ChatAssistantRowProps {
  message: ThreadRow;
  onRetry: (id: string) => void;
  /* Wave 4 pass-through slots (additive, optional): the page composes
     <PlanApprovalCard /> / <BuildStatusRibbon /> and passes the elements
     here. This row owns no approval or status logic — it only renders the
     given nodes inside its own <li> when present. When absent, the existing
     output below is unchanged. */
  approvalCard?: ReactNode;
  statusRibbon?: ReactNode;
}

export function ChatAssistantRow({
  message,
  onRetry,
  approvalCard,
  statusRibbon,
}: ChatAssistantRowProps) {
  return (
    <li className={styles.chatRow}>
      {message.status === 'thinking' ? (
        <ThinkingTrace
          status="thinking"
          reasoning={message.reasoning}
          startedAt={message.startedAt ?? Date.now()}
        />
      ) : (
        <>
          {message.text !== '' ? <p className={styles.chatAnswer}>{message.text}</p> : null}
          {message.status === 'error' ? (
            <div className={styles.chatError}>
              <span>{message.error ?? 'Yanıt beklenmedik şekilde kesildi.'}</span>
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                className={styles.chatRetry}
              >
                Tekrar dene
              </button>
            </div>
          ) : null}
          {message.status === 'done' ? (
            <>
              {message.reasoning ? (
                <ThinkingTrace
                  status="done"
                  reasoning={message.reasoning}
                  startedAt={message.startedAt ?? Date.now()}
                  finishedAt={message.finishedAt}
                />
              ) : null}
              <p className={styles.chatCost}>
                {message.creditsUnavailable || message.credits === undefined
                  ? 'Bu yanıt çalıştı · sağlayıcı maliyet bildirmedi.'
                  : `Bu yanıt ${formatCredits(message.credits)} kredi harcadı · platform kaynaklı hatalarda tekrar denemek ücretsiz.`}
              </p>
            </>
          ) : null}
        </>
      )}
      {approvalCard ?? null}
      {statusRibbon ?? null}
    </li>
  );
}
