import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('shows one line and fires its single action', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        message="No bots yet — connect your first server."
        actionLabel="Connect a server"
        onAction={onAction}
      />,
    );
    expect(screen.getByText('No bots yet — connect your first server.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Connect a server' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
