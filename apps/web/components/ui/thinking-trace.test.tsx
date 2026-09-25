import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThinkingTrace } from './thinking-trace';

describe('ThinkingTrace', () => {
  const consoleError = vi.spyOn(console, 'error');

  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockClear();
  });

  it('shows the shimmer Düşünüyor header with live elapsed seconds', () => {
    render(
      <ThinkingTrace
        status="thinking"
        reasoning={'Weighing the options\nChecking the rules'}
        startedAt={Date.now()}
      />,
    );
    /* Seconds are aria-hidden (no screen-reader spam), so the role name is
       the bare label and the readout is asserted as text. */
    expect(screen.getByRole('button', { name: 'Düşünüyor' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByText(/· \d+s/)).toBeTruthy();
    expect(screen.getByText('Weighing the options')).toBeTruthy();
    expect(screen.getByText('Checking the rules')).toBeTruthy();
  });

  it('shows no placeholder text before the first streamed line', () => {
    render(<ThinkingTrace status="thinking" reasoning="" startedAt={Date.now()} />);
    expect(screen.getByRole('button', { name: 'Düşünüyor' })).toBeTruthy();
    expect(screen.queryByText('Starting…')).toBeNull();
  });

  it('parks itself collapsed as Düşündü with the measured duration', () => {
    const startedAt = Date.now() - 12_400;
    const { rerender } = render(
      <ThinkingTrace status="thinking" reasoning="Weighing" startedAt={startedAt} />,
    );
    expect(screen.getByRole('button', { name: 'Düşünüyor' })).toBeTruthy();
    rerender(
      <ThinkingTrace
        status="done"
        reasoning="Weighing"
        startedAt={startedAt}
        finishedAt={startedAt + 12_400}
      />,
    );
    const head = screen.getByRole('button', { name: 'Düşündü' });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('· 12s sürdü')).toBeTruthy();
    /* Trace stays mounted for re-reading. */
    expect(screen.getByText('Weighing')).toBeTruthy();
  });

  it('the chevron toggles the trace open and closed', () => {
    const startedAt = Date.now() - 5_000;
    render(
      <ThinkingTrace
        status="done"
        reasoning="Weighing"
        startedAt={startedAt}
        finishedAt={startedAt + 5_000}
      />,
    );
    const head = screen.getByRole('button', { name: 'Düşündü' });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('· 5s sürdü')).toBeTruthy();
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('false');
  });
});
