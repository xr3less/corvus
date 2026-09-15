import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pill, StatusRow } from './Pills';

describe('Pill', () => {
  it('carries a text label, never color alone', () => {
    const { rerender } = render(<Pill status="online" />);
    expect(screen.getByText('Online')).toBeTruthy();
    rerender(<Pill status="offline" />);
    expect(screen.getByText('Offline')).toBeTruthy();
    rerender(<Pill status="trial" />);
    expect(screen.getByText('Trial')).toBeTruthy();
  });
});

describe('StatusRow', () => {
  it('renders the tone as text plus detail', () => {
    render(<StatusRow tone="red" label="Blocked" detail="Bot role sits below the target role." />);
    expect(screen.getByText('Blocked')).toBeTruthy();
    expect(screen.getByText('Bot role sits below the target role.')).toBeTruthy();
  });
});
