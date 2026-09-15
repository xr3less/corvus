/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import DemoPage from './page';

const HONEST_LABEL = 'Scripted preview — the AI builder arrives after signup.';
const EMPTY_LABEL = 'Say hello - no signup needed.';

function mockFetchOnce(payload: unknown, status: number, ok: boolean): void {
  const stub = vi.fn().mockResolvedValue({
    status,
    ok,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal('fetch', stub);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('demo page - render', () => {
  it('shows the honest label and empty state', () => {
    mockFetchOnce({ reply: 'x' }, 200, true);
    render(<DemoPage />);
    expect(screen.getByText(HONEST_LABEL)).toBeDefined();
    expect(screen.getByText(EMPTY_LABEL)).toBeDefined();
  });

  it('focuses the input from the empty-state action', () => {
    mockFetchOnce({ reply: 'x' }, 200, true);
    render(<DemoPage />);
    const input = screen.getByLabelText('Message') as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.click(screen.getByRole('button', { name: 'Focus the input' }));
    expect(document.activeElement).toBe(input);
  });
});

describe('demo page - send flow', () => {
  it('sends a message and shows the reply', async () => {
    mockFetchOnce({ reply: 'Hello - I am the Corvus demo.' }, 200, true);
    render(<DemoPage />);
    const input = screen.getByLabelText('Message') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByText('Hello - I am the Corvus demo.')).toBeDefined();
    });
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('submits with the form for keyboard users', async () => {
    mockFetchOnce({ reply: 'Hello - I am the Corvus demo.' }, 200, true);
    render(<DemoPage />);
    const input = screen.getByLabelText('Message') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hi' } });
    const form = screen.getByRole('button', { name: 'Send' }).closest('form');
    if (form !== null) {
      fireEvent.submit(form);
    }
    await waitFor(() => {
      expect(screen.getByText('Hello - I am the Corvus demo.')).toBeDefined();
    });
  });

  it('shows a loading state while awaiting', async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const stub = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', stub);
    render(<DemoPage />);
    const input = screen.getByLabelText('Message') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeDefined();
    });
    release({ status: 200, ok: true, json: () => Promise.resolve({ reply: 'done' }) });
    await waitFor(() => {
      expect(screen.getByText('done')).toBeDefined();
    });
  });

  it('renders the retry line on 429', async () => {
    mockFetchOnce({ error: 'slow down', retryAfterSeconds: 42 }, 429, false);
    render(<DemoPage />);
    const input = screen.getByLabelText('Message') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
    expect(screen.getByRole('alert').textContent).toContain('42');
    expect(screen.getByRole('alert').textContent?.toLowerCase()).toContain('retry');
  });
});
