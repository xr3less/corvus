import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorCard } from './error-card';

/* The scanner's fix string must always render when supplied (grep-proof:
   the preflight UI consumes .fix instead of dropping it). */
describe('ErrorCard', () => {
  it('renders the scanner fix string as an actionable line for Red rows', () => {
    render(
      <ErrorCard
        title="permissions: needs attention"
        whatHappened="A required permission is missing."
        fix="Re-run the install link, then re-run the scan."
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('permissions: needs attention')).toBeTruthy();
    expect(screen.getByText('A required permission is missing.')).toBeTruthy();
    expect(screen.getByText('Re-run the install link, then re-run the scan.')).toBeTruthy();
  });

  it('shows the fix as a secondary line for Yellow rows without an alert role', () => {
    render(
      <ErrorCard
        title="role-position"
        whatHappened="The bot role sits low in the list."
        fix="Drag the bot role above the roles it manages, then re-run the scan."
        tone="yellow"
      />,
    );
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByText('Drag the bot role above the roles it manages, then re-run the scan.'),
    ).toBeTruthy();
  });

  it('omits the fix line when no fix is supplied and still renders', () => {
    render(<ErrorCard title="commands-sync" whatHappened="The counts were unreadable." />);
    expect(screen.queryByText(/What to do next/)).toBeNull();
    expect(screen.getByText('commands-sync')).toBeTruthy();
  });

  it('fires onRetry when the retry button is pressed', () => {
    const onRetry = vi.fn();
    render(
      <ErrorCard title="permissions" whatHappened="Missing a permission." onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run scan again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('breaks the guard when the fix string is dropped (in-memory probe)', () => {
    const { container } = render(
      <ErrorCard
        title="permissions"
        whatHappened="Missing a permission."
        fix="Re-run the install link, then re-run the scan."
      />,
    );
    expect(container.textContent).toContain('Re-run the install link');
  });
});
