import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatAssistantRow } from './chat-thread';
import type { ThreadRow } from '@/lib/chat/thread';

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
    expect(screen.getByRole('button', { name: 'Thinking' })).toBeTruthy();
    expect(screen.getByText('weighing')).toBeTruthy();
  });

  it('renders the answer, parked trace, and spent line when done', () => {
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
    expect(screen.getByRole('button', { name: 'Thought' })).toBeTruthy();
    expect(screen.getByText(/This reply used 0.075 credits/)).toBeTruthy();
  });

  it('renders the honest error with a working Retry', () => {
    const onRetry = vi.fn();
    render(
      <ChatAssistantRow
        message={assistantRow({ status: 'error', error: 'The provider is busy.' })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('The provider is busy.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('a-1');
  });
});
