import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatAssistantRow } from './chat-thread';
import type { ThreadRow } from '@/lib/chat/thread';

/* Every string this component renders, in the Turkish the owner reads (F7,
   2026-09-24). One copy of each, so the behaviour tests and the residue guard
   below assert the same bytes instead of two hand-typed spellings drifting
   apart. The spelling mirrors the shipped Turkish cost line on
   `/dashboard/new` (`platform kaynaklı hata…`) rather than inventing a second
   wording for the same idea. */
const COPY = {
  errorFallback: 'Yanıt beklenmedik şekilde kesildi.',
  retry: 'Tekrar dene',
  costKnown: (credits: string) =>
    `Bu yanıt ${credits} kredi harcadı · platform kaynaklı hatalarda tekrar denemek ücretsiz.`,
  costUnknown: 'Bu yanıt çalıştı · sağlayıcı maliyet bildirmedi.',
};

/* English copy this component used to render. Each was a live string on
   screen, so the check fails if one comes back. Caller-supplied prose is not
   in the list: `message.error`, `message.text` and `message.reasoning` reach
   the DOM from outside, so they are data, not this component's copy. */
const ENGLISH_RESIDUE = [
  'This reply ran',
  'provider reported no cost',
  'This reply used',
  'platform failures retry free',
  'The reply stopped unexpectedly.',
  'Retry',
  'Thinking',
  'Thought',
  'took',
];

function assistantRow(overrides: Partial<ThreadRow> = {}): ThreadRow {
  return {
    id: 'a-1',
    role: 'assistant',
    text: '',
    attachmentCount: 0,
    status: 'thinking',
    reasoning: '',
    startedAt: Date.now(),
    ...overrides,
  };
}

describe('ChatAssistantRow', () => {
  const consoleError = vi.spyOn(console, 'error');

  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockClear();
  });

  it('renders the thinking trace while the stream is open', () => {
    render(
      <ChatAssistantRow message={assistantRow({ reasoning: 'weighing' })} onRetry={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Düşünüyor' })).toBeTruthy();
    expect(screen.getByText('weighing')).toBeTruthy();
  });

  it('renders the answer, parked trace, and Turkish spent line when done', () => {
    const startedAt = Date.now() - 8000;
    render(
      <ChatAssistantRow
        message={assistantRow({
          status: 'done',
          text: 'Here.',
          reasoning: 'weighing',
          credits: 0.075,
          startedAt,
          finishedAt: startedAt + 8000,
        })}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText('Here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Düşündü' })).toBeTruthy();
    expect(screen.getByText(COPY.costKnown('0.075'))).toBeTruthy();
  });

  it('renders the honest error with a working Turkish Retry', () => {
    const onRetry = vi.fn();
    render(
      <ChatAssistantRow
        message={assistantRow({ status: 'error', error: 'The provider is busy.' })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('The provider is busy.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COPY.retry }));
    expect(onRetry).toHaveBeenCalledWith('a-1');
  });

  /* The provider reported no cost for this reply: the spent line says so. It
     used to print `0`, which is a fabricated price, and the model's own note
     (`usage-unavailable`) is phrased in English — the owner reads Turkish, so
     the reason is theirs to read too. */
  it('says the provider reported no cost instead of printing a fabricated 0', () => {
    render(
      <ChatAssistantRow
        message={assistantRow({
          status: 'done',
          text: 'Here.',
          credits: 0,
          creditsUnavailable: true,
        })}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText(COPY.costUnknown)).toBeTruthy();
    expect(screen.queryByText(COPY.costKnown('0'))).toBeNull();
  });

  /* The same honest branch without the note: a `done` frame that carries no
     number at all (old lane, dropped usage) is silent about cost, not free. */
  it('stays silent about cost when the done frame carries no credit number', () => {
    render(
      <ChatAssistantRow
        message={assistantRow({ status: 'done', text: 'Here.', credits: undefined })}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText(COPY.costUnknown)).toBeTruthy();
  });

  it('renders the Turkish fallback when the error carries no words of its own', () => {
    render(<ChatAssistantRow message={assistantRow({ status: 'error' })} onRetry={() => {}} />);
    expect(screen.getByText(COPY.errorFallback)).toBeTruthy();
  });

  /* The Turkish pass, guarded: the sweep renders every state this component
     owns with no caller prose in play, so the body it reads is the
     component's own copy. Every string it used to show in English is
     enumerated above; a revert of any line fails here. */
  it('speaks Turkish end to end: no English component copy survives', () => {
    const rows = [
      assistantRow({ id: 't-1', status: 'thinking' }),
      assistantRow({ id: 't-2', status: 'done', text: 'Yanıt.', credits: 0.075 }),
      assistantRow({ id: 't-3', status: 'done', text: 'Yanıt.', creditsUnavailable: true }),
      assistantRow({ id: 't-4', status: 'error' }),
    ];
    render(
      <ul>
        {rows.map((row) => (
          <ChatAssistantRow key={row.id} message={row} onRetry={() => {}} />
        ))}
      </ul>,
    );
    const body = document.body.textContent ?? '';
    for (const english of ENGLISH_RESIDUE) {
      expect(body, `still English: ${english}`).not.toContain(english);
    }
    /* The Turkish copy is actually there, in both branches of the spent line. */
    expect(screen.getByText(COPY.costKnown('0.075'))).toBeTruthy();
    expect(screen.getByText(COPY.costUnknown)).toBeTruthy();
    expect(screen.getByText(COPY.errorFallback)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: COPY.retry })).toHaveLength(1);
  });
});
