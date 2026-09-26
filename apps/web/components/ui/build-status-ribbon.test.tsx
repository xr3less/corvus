import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BuildStatusRibbon } from './build-status-ribbon';

const BASE = {
  phase: null,
  streaming: false,
  approving: false,
  stopped: false,
  onStop: () => {},
  onResume: () => {},
} as const;

function onlyOnePillWith(text: string): void {
  const pills = screen.getAllByRole('status');
  expect(pills).toHaveLength(1);
  expect(pills[0].textContent).toBe(text);
}

describe('BuildStatusRibbon', () => {
  it('shows Hazır when idle', () => {
    render(<BuildStatusRibbon {...BASE} />);
    onlyOnePillWith('Hazır');
    expect(screen.queryByRole('button', { name: 'Durdur' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devam et' })).toBeNull();
  });

  it('shows Sohbet yazıyor while streaming with no build phase', () => {
    render(<BuildStatusRibbon {...BASE} streaming />);
    onlyOnePillWith('Sohbet yazıyor');
  });

  it('shows Onay gönderiliyor while approving takes precedence over streaming and build phases', () => {
    render(<BuildStatusRibbon {...BASE} streaming approving phase="generating" />);
    onlyOnePillWith('Onay gönderiliyor');
    expect(screen.queryByRole('button', { name: 'Devam et' })).toBeNull();
  });

  it('shows Kurulum sürüyor for each active build phase', () => {
    for (const phase of ['queued', 'generating', 'syncing']) {
      const { unmount } = render(<BuildStatusRibbon {...BASE} phase={phase} />);
      onlyOnePillWith('Kurulum sürüyor');
      expect(screen.getByRole('button', { name: 'Durdur' })).toBeTruthy();
      unmount();
    }
  });

  it('Durdur calls onStop exactly once and issues no fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onStop = vi.fn();
    try {
      render(<BuildStatusRibbon {...BASE} phase="generating" onStop={onStop} />);
      fireEvent.click(screen.getByRole('button', { name: 'Durdur' }));
      expect(onStop).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('Durduruldu shows the honest sentence plus Devam et calling onResume', () => {
    const onResume = vi.fn();
    render(<BuildStatusRibbon {...BASE} phase="generating" stopped onResume={onResume} />);
    onlyOnePillWith('Durduruldu');
    expect(screen.getByText('Sunucudaki kurulum devam eder.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Durdur' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('treats live, failed, and unknown phases as not building', () => {
    for (const phase of ['live', 'failed', 'something-new']) {
      const { unmount } = render(<BuildStatusRibbon {...BASE} phase={phase} />);
      onlyOnePillWith('Hazır');
      expect(screen.queryByRole('button', { name: 'Durdur' })).toBeNull();
      unmount();
    }
  });
});
