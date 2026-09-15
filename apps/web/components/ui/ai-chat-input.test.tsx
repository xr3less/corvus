import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PromptInput } from './ai-chat-input';

const PLACEHOLDER = 'What should Corvus build?';

describe('PromptInput', () => {
  const consoleError = vi.spyOn(console, 'error');

  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockClear();
  });

  it('renders collapsed with the placeholder', () => {
    render(<PromptInput placeholder={PLACEHOLDER} />);
    expect(screen.getByRole('button', { name: 'Open prompt input' })).toBeTruthy();
    expect(screen.getByLabelText('Prompt')).toBeTruthy();
  });

  it('clicking the collapsed pill opens and focuses the textarea', async () => {
    render(<PromptInput placeholder={PLACEHOLDER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open prompt input' }));
    const textarea = screen.getByLabelText('Prompt');
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
  });

  it('typing + Enter calls onSubmit with the value and meta', async () => {
    const onSubmit = vi.fn();
    render(<PromptInput placeholder={PLACEHOLDER} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open prompt input' }));
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
    fireEvent.change(textarea, { target: { value: 'Draft a launch checklist' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Draft a launch checklist', {
      attachments: [],
    });
  });

  it('renders no model or effort picker controls', () => {
    const { container } = render(<PromptInput placeholder={PLACEHOLDER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open prompt input' }));
    expect(screen.queryByRole('button', { name: /select model/i })).toBeNull();
    expect(screen.queryByText('GPT 5.5')).toBeNull();
    expect(screen.queryByText('Medium')).toBeNull();
    expect(screen.queryByText('Max Effort')).toBeNull();
    expect(screen.queryByText('Low')).toBeNull();
    const html = container.innerHTML;
    expect(html).not.toMatch(/Select model/);
  });

  it('focused container brightens the border with no ring class', async () => {
    render(<PromptInput placeholder={PLACEHOLDER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open prompt input' }));
    const textarea = screen.getByLabelText('Prompt');
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
    /* Walk up to the bordered composer box (the div with border + bg-card). */
    let node = textarea.parentElement;
    let box: HTMLElement | null = null;
    while (node) {
      if (node.className.includes('bg-card') && node.className.includes('border')) {
        box = node as HTMLElement;
        break;
      }
      node = node.parentElement;
    }
    expect(box).not.toBeNull();
    expect(box!.className).toContain('focus-within:border-white/30');
    expect(box!.className).not.toMatch(/ring-/);
  });

  it('mic button is disabled when voice input is unavailable in this browser', () => {
    render(<PromptInput placeholder={PLACEHOLDER} />);
    const mic = screen.getByRole('button', { name: 'Use voice input' });
    expect((mic as HTMLButtonElement).disabled).toBe(true);
    expect(mic.getAttribute('aria-disabled')).toBe('true');
    expect(mic.getAttribute('title')).toBe('Voice input is not available in this browser');
    // Clicking it types nothing and starts no recording.
    fireEvent.click(mic);
    expect(screen.queryByRole('button', { name: 'Stop recording' })).toBeNull();
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
  });

  it('Escape with an empty value collapses back to the pill', async () => {
    render(<PromptInput placeholder={PLACEHOLDER} />);
    const opener = screen.getByRole('button', { name: 'Open prompt input' });
    fireEvent.click(opener);
    const textarea = screen.getByLabelText('Prompt');
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
    fireEvent.keyDown(textarea, { key: 'Escape' });
    await waitFor(() => {
      expect(opener.className).not.toContain('pointer-events-none');
    });
  });

  it('forceExpanded mounts open with no opener and never collapses', async () => {
    const onSubmit = vi.fn();
    render(<PromptInput placeholder={PLACEHOLDER} onSubmit={onSubmit} forceExpanded />);
    /* No collapsed pill exists — the textarea is the surface from mount. */
    expect(screen.queryByRole('button', { name: 'Open prompt input' })).toBeNull();
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
    /* Escape on empty cannot collapse it. */
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Open prompt input' })).toBeNull();
    expect(screen.getByLabelText('Prompt')).toBeTruthy();
    /* Typing + Enter still submits. */
    fireEvent.change(textarea, { target: { value: 'Draft a launch checklist' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
