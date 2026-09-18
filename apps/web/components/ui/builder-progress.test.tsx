import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { BuilderProgress } from './builder-progress';

const here = dirname(fileURLToPath(import.meta.url));
const STEP_LABELS = ['Queued', 'Generating', 'Syncing', 'Live'] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function currentStep(label: string): string | null {
  return screen.getByText(label).closest('li')?.getAttribute('aria-current') ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BuilderProgress', () => {
  it('shows all four phases with Queued highlighted while the run is queued', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ runId: 'r', phase: 'queued', detail: {} })),
    );
    render(<BuilderProgress runId="r" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    for (const label of STEP_LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(currentStep('Queued')).toBe('step');
    expect(currentStep('Live')).toBeNull();
  });

  it('polls every 2s while non-terminal and stops once Live is reached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ phase: 'queued', detail: {} }))
      .mockResolvedValueOnce(jsonResponse({ phase: 'generating', detail: {} }))
      .mockResolvedValueOnce(jsonResponse({ phase: 'live', detail: {} }));
    vi.stubGlobal('fetch', fetchMock);

    render(<BuilderProgress runId="r" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentStep('Queued')).toBe('step');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(currentStep('Generating')).toBe('step');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(currentStep('Live')).toBe('step');
    expect(currentStep('Generating')).toBeNull();

    // Terminal: no further timers are scheduled.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shows the API error text verbatim and stops polling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'run not found' }, 404));
    vi.stubGlobal('fetch', fetchMock);

    render(<BuilderProgress runId="r" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('alert').textContent).toBe('run not found');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error instead of freezing blank when a 200 has no usable phase', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: {} }));
    vi.stubGlobal('fetch', fetchMock);

    render(<BuilderProgress runId="r" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('alert').textContent).toBe('Unexpected builder phase');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats an unknown phase name outside the allowlist as an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ phase: 'teleporting' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<BuilderProgress runId="r" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('alert').textContent).toBe('Unexpected builder phase');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows honest text for the terminal failed phase and stops polling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ phase: 'failed', detail: {} }));
    vi.stubGlobal('fetch', fetchMock);

    render(<BuilderProgress runId="r" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('status').textContent).toBe('Build failed');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the honest empty state without any run and never polls', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<BuilderProgress runId={null} />);

    expect(screen.getByText('No run started')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables its decorative motion under prefers-reduced-motion', () => {
    const css = readFileSync(join(here, 'builder-progress.module.css'), 'utf8');
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});
