import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DiffView } from './DiffView';

const CHANGES = [
  {
    id: 'xp-rate',
    kind: 'changed' as const,
    title: 'XP per message',
    before: '5 XP',
    after: '10 XP',
  },
];

describe('DiffView', () => {
  it('routes Accept and Reject per change id', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<DiffView changes={CHANGES} onAccept={onAccept} onReject={onReject} />);
    expect(screen.getByText('Changed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept XP per message' }));
    expect(onAccept).toHaveBeenCalledWith('xp-rate');
    fireEvent.click(screen.getByRole('button', { name: 'Reject XP per message' }));
    expect(onReject).toHaveBeenCalledWith('xp-rate');
  });
});
