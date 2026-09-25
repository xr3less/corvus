import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ATTACHMENT_SEND_UNSUPPORTED,
  MAX_ATTACHMENT_BYTES,
  PromptInput,
  selectAttachments,
} from './ai-chat-input';

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
    if (box === null) throw new Error('Expected composer box to be found');
    expect(box.className).toContain('focus-within:border-white/30');
    expect(box.className).not.toMatch(/ring-/);
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

  /* The new-page streaming send gate: the textarea stays editable while
     sendDisabled, but no send path fires and nothing is cleared. */
  describe('sendDisabled (streaming send gate)', () => {
    function renderGated(
      sendDisabled: boolean,
      onSubmit: (value: string, meta: { attachments: File[] }) => void,
    ) {
      return render(
        <PromptInput
          placeholder={PLACEHOLDER}
          onSubmit={onSubmit}
          forceExpanded
          sendDisabled={sendDisabled}
        />,
      );
    }

    it('textarea stays editable while send is disabled', async () => {
      const onSubmit = vi.fn();
      renderGated(true, onSubmit);
      const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
      await waitFor(() => {
        expect(document.activeElement).toBe(textarea);
      });
      expect(textarea.disabled).toBe(false);
      fireEvent.change(textarea, { target: { value: 'typed mid-stream' } });
      expect(textarea.value).toBe('typed mid-stream');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Enter-to-send does nothing and preserves text while send is disabled', () => {
      const onSubmit = vi.fn();
      renderGated(true, onSubmit);
      const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'do not send yet' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(onSubmit).not.toHaveBeenCalled();
      expect(textarea.value).toBe('do not send yet');
    });

    it('send click does nothing and preserves text while send is disabled', () => {
      const onSubmit = vi.fn();
      renderGated(true, onSubmit);
      const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'do not send yet' } });
      const send = screen.getByRole('button', { name: 'Send prompt' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      expect(send.getAttribute('aria-disabled')).toBe('true');
      expect(send.className).toContain('opacity-50');
      expect(send.className).toContain('cursor-not-allowed');
      fireEvent.click(send);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(textarea.value).toBe('do not send yet');
    });

    it('submit works again once the gate lifts', () => {
      const onSubmit = vi.fn();
      const { rerender } = renderGated(true, onSubmit);
      const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'held draft' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(onSubmit).not.toHaveBeenCalled();
      rerender(
        <PromptInput
          placeholder={PLACEHOLDER}
          onSubmit={onSubmit}
          forceExpanded
          sendDisabled={false}
        />,
      );
      const send = screen.getByRole('button', { name: 'Send prompt' }) as HTMLButtonElement;
      expect(send.disabled).toBe(false);
      expect(send.getAttribute('aria-disabled')).toBeNull();
      fireEvent.keyDown(screen.getByLabelText('Prompt'), { key: 'Enter' });
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith('held draft', { attachments: [] });
    });
  });

  /* M-6: the chat API carries text only, so the composer must never stage an
     attachment and then destroy it — every rejected pick and every refused
     submit says so in words, and nothing the person staged is lost. */
  describe('attachments (M-6 honesty contract)', () => {
    const MB = 1024 * 1024;

    /* jsdom never decodes an image, so the real (async) staging path — which
       waits for `img.onload` before adding a thumbnail — would never run.
       The stub keeps that shape (assign src, then the callback fires) so the
       tests exercise the component's actual code path, not a shortcut. */
    class SettledImage {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    beforeEach(() => {
      vi.stubGlobal('Image', SettledImage);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function imageFile(name: string, bytes: number): File {
      const file = new File(['x'], name, { type: 'image/png' });
      /* jsdom sizes a File from its content; the cap is about the declared
         byte count, so size is set directly rather than allocating 5 MB. */
      Object.defineProperty(file, 'size', { value: bytes });
      return file;
    }

    function pickFiles(input: HTMLInputElement, files: File[]) {
      fireEvent.change(input, { target: { files } });
    }

    /* The cap is the contract's first number, so it is asserted directly:
       a silently changed limit is how a large blob reaches a request body. */
    it('pins the attachment size cap and its exact boundary', () => {
      expect(MAX_ATTACHMENT_BYTES).toBe(5 * MB);

      const atCap = selectAttachments([imageFile('ok.png', MAX_ATTACHMENT_BYTES)], 0, 6);
      expect(atCap.accepted).toHaveLength(1);
      expect(atCap.notice?.text).toBe(ATTACHMENT_SEND_UNSUPPORTED);

      const overCap = selectAttachments([imageFile('big.png', MAX_ATTACHMENT_BYTES + 1)], 0, 6);
      expect(overCap.accepted).toHaveLength(0);
      expect(overCap.notice?.text).toContain('over the 5 MB limit');
      expect(overCap.notice?.assertive).toBe(true);
    });

    it('accounts for every dropped pick: type, size, and count', () => {
      const selection = selectAttachments(
        [
          imageFile('good.png', 1 * MB),
          imageFile('big.png', 9 * MB),
          new File(['x'], 'notes.txt', { type: 'text/plain' }),
        ],
        5,
        6,
      );
      expect(selection.accepted).toHaveLength(1);
      const text = selection.notice?.text ?? '';
      expect(text).toContain('1 file that is not an image');
      expect(text).toContain('1 image over the 5 MB limit');
      expect(text).toContain(ATTACHMENT_SEND_UNSUPPORTED);
    });

    it('an image-only submit is refused in words and destroys nothing', async () => {
      const onSubmit = vi.fn();
      render(<PromptInput placeholder={PLACEHOLDER} onSubmit={onSubmit} forceExpanded />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      pickFiles(input, [imageFile('shot.png', 1 * MB)]);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Open preview of shot.png' })).toBeTruthy(),
      );
      fireEvent.keyDown(screen.getByLabelText('Prompt'), { key: 'Enter' });

      /* Nothing was sent... */
      expect(onSubmit).not.toHaveBeenCalled();
      /* ...and the person is told why, in words. */
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe(ATTACHMENT_SEND_UNSUPPORTED);
      /* ...and the staged image is still on screen, not silently dropped. */
      expect(screen.getByRole('button', { name: 'Open preview of shot.png' })).toBeTruthy();
    });

    it('a text + image submit is refused whole, keeping the typed draft', async () => {
      const onSubmit = vi.fn();
      render(<PromptInput placeholder={PLACEHOLDER} onSubmit={onSubmit} forceExpanded />);
      const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'what is in this picture?' } });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      pickFiles(input, [imageFile('chart.png', 1 * MB)]);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Open preview of chart.png' })).toBeTruthy(),
      );

      const send = screen.getByRole('button', { name: 'Send prompt' });
      fireEvent.click(send);

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toBe(ATTACHMENT_SEND_UNSUPPORTED);
      /* The draft survives the refusal — a refused submit is not a send. */
      expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(
        'what is in this picture?',
      );
      expect(screen.getByRole('button', { name: 'Open preview of chart.png' })).toBeTruthy();
    });

    it('removing the last image clears the notice and unblocks sending', async () => {
      const onSubmit = vi.fn();
      render(<PromptInput placeholder={PLACEHOLDER} onSubmit={onSubmit} forceExpanded />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      pickFiles(input, [imageFile('only.png', 1 * MB)]);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Open preview of only.png' })).toBeTruthy(),
      );
      /* The standing fact is present the moment something is staged. */
      expect(screen.getByRole('status').textContent).toBe(ATTACHMENT_SEND_UNSUPPORTED);

      fireEvent.click(screen.getByRole('button', { name: 'Remove only.png' }));
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

      const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'plain text now' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith('plain text now', { attachments: [] });
    });

    it('an oversized pick is never staged and names the limit', async () => {
      const onSubmit = vi.fn();
      render(<PromptInput placeholder={PLACEHOLDER} onSubmit={onSubmit} forceExpanded />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      pickFiles(input, [imageFile('huge.png', 40 * MB)]);

      expect(screen.queryByRole('button', { name: 'Open preview of huge.png' })).toBeNull();
      expect(screen.getByRole('alert').textContent).toBe(
        'Nothing was added: 1 image over the 5 MB limit.',
      );
    });

    it('the attach control states that sending is not connected yet', () => {
      render(<PromptInput placeholder={PLACEHOLDER} forceExpanded />);
      const attach = screen.getByRole('button', { name: /^Attach image/ });
      expect(attach.getAttribute('aria-label')).toContain('sending is not connected yet');
      expect(attach.getAttribute('title')).toContain('not connected yet');
    });
  });
});
