'use client';

/* Panel interview: server-driven flow over /api/interview/* + /api/spec/patch.
   MOCK_QUESTIONS below are the pre-start idle state only (and the clearly-marked
   fallback when the start request cannot reach the server). Once started, the
   server is the source of truth for next-question/done. */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { DiffView } from '../../components/ui/DiffView';
import type { DiffChange } from '../../components/ui/DiffView';
import { EmptyState } from '../../components/ui/EmptyState';
import { readErrorMessage } from '@/lib/http/refusal';
import styles from './page.module.css';

interface MockQuestion {
  id: string;
  question: string;
  answer: string;
}

const MOCK_QUESTIONS: MockQuestion[] = [
  {
    id: 'q-xp',
    question: 'How much XP does one message earn',
    answer: '10 XP per message, 60 second cooldown.',
  },
  {
    id: 'q-welcome',
    question: 'Where do new members land first',
    answer: 'Channel #welcome, rules post pinned at the top.',
  },
  {
    id: 'q-mods',
    question: 'Who can warn members',
    answer: 'Moderator role and above, 3 warnings mute for 24 hours.',
  },
];

const MOCK_CHANNELS = ['#general', '#mod-log', '#announcements'];

const MOCK_CHANGES: DiffChange[] = [
  { id: 'xp-rate', kind: 'changed', title: 'XP per message', before: '5 XP', after: '10 XP' },
  { id: 'cooldown', kind: 'added', title: 'Cooldown between XP awards', after: '60 seconds' },
  {
    id: 'warn-limit',
    kind: 'changed',
    title: 'Warnings before mute',
    before: '5 warnings',
    after: '3 warnings',
  },
];

interface ServerQuestion {
  id: string;
  prompt: string;
  hint: string;
}

interface RecordedAnswer {
  question: string;
  answer: string;
}

interface DraftHead {
  botId: string;
  version: number;
  draftSpecId: string;
}

/* Refusal readers live in lib/http/refusal.ts (shared import above): a
   KI-033 trial refusal arrives as { error: <code>, message: <the honest
   sentence> } — POST /api/interview/start writes both, so the person reads
   the reason in words instead of a code like 'trial_bot_limit'. `message`
   is preferred for that reason; `error` stays the fallback for the
   code-only shape the other routes in this flow write (answer,
   spec/patch), and a body with neither keeps the caller's own fallback
   rather than printing an empty alert. */

export default function InterviewPage() {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [changes, setChanges] = useState<DiffChange[]>(MOCK_CHANGES);
  const [channel, setChannel] = useState<string>('#general');
  const [botName, setBotName] = useState<string>('');
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<ServerQuestion | null>(null);
  const [answer, setAnswer] = useState<string>('');
  const [answers, setAnswers] = useState<RecordedAnswer[]>([]);
  const [draft, setDraft] = useState<DraftHead | null>(null);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const [offlineFallback, setOfflineFallback] = useState(false);

  const openQuestions = MOCK_QUESTIONS.filter((item) => !skipped.includes(item.id));
  const reviewed = MOCK_CHANGES.length - changes.length;
  const started = interviewId !== null;

  async function handleStart(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (starting) {
      return;
    }
    setStarting(true);
    setError(null);
    setStatus('Starting interview…');
    setOfflineFallback(false);
    let res: Response;
    try {
      res = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botName: botName.trim() }),
      });
    } catch {
      setStarting(false);
      setStatus(null);
      setError('Could not reach the server. Check your connection and try again.');
      setOfflineFallback(true);
      return;
    }
    if (res.status === 401) {
      setStarting(false);
      setStatus(null);
      setLoggedOut(true);
      return;
    }
    if (!res.ok) {
      setStarting(false);
      setStatus(null);
      setError(`Could not start interview: ${await readErrorMessage(res, `error ${res.status}`)}`);
      return;
    }
    const body = (await res.json()) as { interviewId: string; question: ServerQuestion };
    setInterviewId(body.interviewId);
    setCurrentQuestion(body.question);
    setAnswers([]);
    setDraft(null);
    setStarting(false);
    setStatus(null);
  }

  async function handleAnswer(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (sending || interviewId === null || currentQuestion === null) {
      return;
    }
    setSending(true);
    setError(null);
    setStatus('Sending answer…');
    let text = answer.trim();
    if (currentQuestion.id === 'channels' && channel.length > 0 && !text.includes(channel)) {
      text = `${text} [channel: ${channel}]`;
    }
    let res: Response;
    try {
      res = await fetch('/api/interview/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ interviewId, questionId: currentQuestion.id, answer: text }),
      });
    } catch {
      setSending(false);
      setStatus(null);
      setError('Could not reach the server. Check your connection and try again.');
      return;
    }
    if (res.status === 401) {
      setSending(false);
      setStatus(null);
      setLoggedOut(true);
      return;
    }
    if (!res.ok) {
      setSending(false);
      setStatus(null);
      setError(`Could not record answer: ${await readErrorMessage(res, `error ${res.status}`)}`);
      return;
    }
    const body = (await res.json()) as
      | { nextQuestion: ServerQuestion; done?: false }
      | { done: true; draftSpecId: string; version: number };
    const recorded: RecordedAnswer = { question: currentQuestion.id, answer: text };
    if ('done' in body && body.done === true) {
      setAnswers((prev) => [...prev, recorded]);
      setDraft({ botId: interviewId, version: body.version, draftSpecId: body.draftSpecId });
      setCurrentQuestion(null);
      setAnswer('');
      setSending(false);
      setStatus(null);
      return;
    }
    setAnswers((prev) => [...prev, recorded]);
    setCurrentQuestion((body as { nextQuestion: ServerQuestion }).nextQuestion);
    setAnswer('');
    setSending(false);
    setStatus(null);
  }

  async function handleReview(id: string, action: 'accept' | 'reject'): Promise<void> {
    // No draft yet means no version to patch against: local-only review.
    if (draft === null || patchingId !== null) {
      if (draft === null) {
        setChanges((prev) => prev.filter((change) => change.id !== id));
      }
      return;
    }
    const remaining = changes.filter((change) => change.id !== id);
    const behaviors: unknown[] = [
      ...answers.map((entry) => ({ question: entry.question, answer: entry.answer })),
      ...remaining.map((change) => ({
        id: change.id,
        title: change.title,
        before: change.before ?? null,
        after: change.after ?? null,
      })),
    ];
    if (behaviors.length === 0) {
      setChanges(remaining);
      setStatus('Draft ready — nothing left to save.');
      return;
    }
    setPatchingId(id);
    setError(null);
    setStatus('Saving draft…');
    let res: Response;
    try {
      res = await fetch('/api/spec/patch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          botId: draft.botId,
          baseVersion: draft.version,
          behaviors,
          summary: `interview review: ${action} ${id}`,
        }),
      });
    } catch {
      setPatchingId(null);
      setStatus(null);
      setError('Could not reach the server. Your review was kept — try again.');
      return;
    }
    if (res.status === 401) {
      setPatchingId(null);
      setStatus(null);
      setLoggedOut(true);
      return;
    }
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { currentVersion?: unknown };
      const currentVersion =
        typeof body.currentVersion === 'number' ? body.currentVersion : draft.version;
      setDraft({ ...draft, version: currentVersion });
      setPatchingId(null);
      setStatus(null);
      setError(`Draft changed while reviewing (now v${currentVersion}). Try again.`);
      return;
    }
    if (!res.ok) {
      setPatchingId(null);
      setStatus(null);
      setError(
        `Could not save review: ${await readErrorMessage(res, `error ${res.status}`)}. Your review was kept.`,
      );
      return;
    }
    const body = (await res.json()) as { version: number };
    setDraft({ ...draft, version: body.version });
    setChanges(remaining);
    setPatchingId(null);
    setStatus(`Draft v${body.version} saved.`);
  }

  const handleAccept = (id: string): void => {
    void handleReview(id, 'accept');
  };

  const handleReject = (id: string): void => {
    void handleReview(id, 'reject');
  };

  return (
    <main className={styles.wrap}>
      <p className={styles.muted}>Private to you until you publish</p>
      <h1>Panel interview</h1>
      <p>Answer 3 questions. Corvus drafts the changes, you accept or reject each one.</p>
      {loggedOut ? (
        <p role="alert">
          You are logged out. <a href="/api/auth/login">Log in</a> to start an interview.
        </p>
      ) : null}
      {error !== null ? <p role="alert">{error}</p> : null}
      {status !== null ? <p role="status">{status}</p> : null}

      {!started ? (
        <section aria-labelledby="interview-start-heading" className={styles.section}>
          <h2 id="interview-start-heading">Start</h2>
          <form onSubmit={(event) => void handleStart(event)}>
            <Input
              id="interview-bot-name"
              label="Bot name"
              value={botName}
              onChange={(event) => setBotName(event.target.value)}
              placeholder="Study Hall"
              maxLength={32}
              autoComplete="off"
            />
            <Button type="submit" loading={starting}>
              Start interview
            </Button>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="interview-channel-heading" className={styles.section}>
        <h2 id="interview-channel-heading">Where drafts go</h2>
        <Select
          id="interview-channel"
          label="Post drafts to"
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          hint="Drafts land here first, nothing posts without your accept."
        >
          {MOCK_CHANNELS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </section>

      <section aria-labelledby="interview-questions-heading" className={styles.section}>
        <h2 id="interview-questions-heading">Questions</h2>
        {currentQuestion !== null ? (
          <form onSubmit={(event) => void handleAnswer(event)}>
            <p className={styles.questionText}>{currentQuestion.prompt}</p>
            {currentQuestion.hint.length > 0 ? (
              <p className={styles.answer}>{currentQuestion.hint}</p>
            ) : null}
            <Textarea
              id="interview-answer"
              label="Your answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={500}
            />
            <Button type="submit" loading={sending}>
              Send answer
            </Button>
          </form>
        ) : draft !== null ? (
          <p className={styles.done}>
            Draft v{draft.version} ready. <a href={`/dashboard/bots/${draft.botId}`}>View bot</a>
          </p>
        ) : offlineFallback ? (
          <>
            <p role="status">Could not reach the server — showing saved questions.</p>
            <ul className={styles.list}>
              {openQuestions.map((item, index) => (
                <li key={item.id} className={styles.question}>
                  <p className={styles.questionText}>{`${index + 1}. ${item.question}`}</p>
                  <p className={styles.answer}>{item.answer}</p>
                  <Button variant="ghost" onClick={() => setSkipped((prev) => [...prev, item.id])}>
                    Skip
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : openQuestions.length === 0 ? (
          <EmptyState
            message="No open questions — start a new round."
            actionLabel="Ask 3 more questions"
            onAction={() => setSkipped([])}
          />
        ) : (
          <ul className={styles.list}>
            {openQuestions.map((item, index) => (
              <li key={item.id} className={styles.question}>
                <p className={styles.questionText}>{`${index + 1}. ${item.question}`}</p>
                <p className={styles.answer}>{item.answer}</p>
                <Button variant="ghost" onClick={() => setSkipped((prev) => [...prev, item.id])}>
                  Skip
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="interview-drafts-heading" className={styles.section}>
        <h2 id="interview-drafts-heading">Drafts</h2>
        {changes.length === 0 ? (
          <p className={styles.done}>
            3 of 3 drafts reviewed. Publish keeps every accepted change.
          </p>
        ) : (
          <>
            <p className={styles.muted}>{reviewed} of 3 drafts reviewed.</p>
            <DiffView changes={changes} onAccept={handleAccept} onReject={handleReject} />
          </>
        )}
      </section>
    </main>
  );
}
