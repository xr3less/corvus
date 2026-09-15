/* One assistant reply in a chat thread (D-118): thinking trace, streamed
   answer, honest error with Retry, spent line. Both chat pages render their
   user rows themselves (bubble vs activity row differ by design); this owns
   the assistant side once instead of twice. */
import { ThinkingTrace } from './thinking-trace';
import { formatCredits, type ThreadRow } from '@/lib/chat/thread';
import styles from './chat-thread.module.css';

export interface ChatAssistantRowProps {
  message: ThreadRow;
  onRetry: (id: string) => void;
}

export function ChatAssistantRow({ message, onRetry }: ChatAssistantRowProps) {
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
              <span>{message.error ?? 'The reply stopped unexpectedly.'}</span>
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                className={styles.chatRetry}
              >
                Retry
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
                  ? 'This reply ran · the provider reported no cost.'
                  : `This reply used ${formatCredits(message.credits)} credits · platform failures retry free.`}
              </p>
            </>
          ) : null}
        </>
      )}
    </li>
  );
}
