import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import InterviewPage from './page';

const INTERVIEW_ID = '00000000-0000-0000-0000-000000000000';

function startPayload(questionId: string, prompt: string) {
  return { interviewId: INTERVIEW_ID, question: { id: questionId, prompt, hint: '' } };
}

function answerRouter() {
  return vi.fn(async (url: unknown, init?: { body?: unknown }) => {
    const target = String(url);
    if (target.includes('/api/interview/start')) {
      return Response.json(startPayload('purpose', 'What is this bot for?'));
    }
    if (target.includes('/api/interview/answer')) {
      const body = JSON.parse(String((init?.body as string) ?? '{}')) as { questionId?: string };
      const order = ['purpose', 'channels', 'welcome', 'moderation'];
      const next = order[order.indexOf(body.questionId ?? '') + 1];
      if (next === undefined) {
        return Response.json({ done: true, draftSpecId: 'draft-1', version: 1 });
      }
      const prompts: Record<string, string> = {
        channels: 'Which channels?',
        welcome: 'Welcome text?',
        moderation: 'How strict?',
      };
      return Response.json({ nextQuestion: { id: next, prompt: prompts[next], hint: '' } });
    }
    if (target.includes('/api/spec/patch')) {
      return Response.json({ version: 2 });
    }
    throw new Error(`unexpected fetch: ${target}`);
  });
}

async function startInterview() {
  fireEvent.change(screen.getByLabelText('Bot name'), { target: { value: 'Study Hall' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start interview' }));
  await screen.findByText('What is this bot for?');
}

async function answerCurrent(answer: string, buttonName = 'Send answer') {
  fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: answer } });
  fireEvent.click(screen.getByRole('button', { name: buttonName }));
}

describe('interview page', () => {
  it('renders without crashing, shows key copy, and makes no fetch calls', () => {
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<InterviewPage />);
      expect(screen.getByRole('heading', { name: 'Panel interview' })).toBeTruthy();
      expect(screen.getByLabelText('Post drafts to')).toBeTruthy();
      expect(screen.getByText('1. How much XP does one message earn')).toBeTruthy();
      expect(screen.getAllByRole('button', { name: /Accept / })).toHaveLength(3);
      expect(screen.getAllByRole('button', { name: /Reject / })).toHaveLength(3);
      expect(fetchStub).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('shows the empty state after all questions are skipped', () => {
    render(<InterviewPage />);
    screen.getAllByRole('button', { name: 'Skip' }).forEach((button) => fireEvent.click(button));
    expect(screen.getByText('No open questions — start a new round.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask 3 more questions' })).toBeTruthy();
  });

  it('bot-name submit triggers POST /api/interview/start', async () => {
    const fetchStub = answerRouter();
    vi.stubGlobal('fetch', fetchStub);
    try {
      render(<InterviewPage />);
      fireEvent.change(screen.getByLabelText('Bot name'), { target: { value: 'Study Hall' } });
      fireEvent.click(screen.getByRole('button', { name: 'Start interview' }));
      await screen.findByText('What is this bot for?');
      expect(fetchStub).toHaveBeenCalledWith(
        '/api/interview/start',
        expect.objectContaining({ method: 'POST' }),
      );
      const [, init] = fetchStub.mock.calls.find(([url]) =>
        String(url).includes('/api/interview/start'),
      ) as [unknown, { body: string }];
      expect(JSON.parse(init.body)).toMatchObject({ botName: 'Study Hall' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('answer submit triggers POST /api/interview/answer', async () => {
    const fetchStub = answerRouter();
    vi.stubGlobal('fetch', fetchStub);
    try {
      render(<InterviewPage />);
      await startInterview();
      await answerCurrent('A study bot');
      await screen.findByText('Which channels?');
      expect(fetchStub).toHaveBeenCalledWith(
        '/api/interview/answer',
        expect.objectContaining({ method: 'POST' }),
      );
      const [, init] = fetchStub.mock.calls.find(([url]) =>
        String(url).includes('/api/interview/answer'),
      ) as [unknown, { body: string }];
      expect(JSON.parse(init.body)).toMatchObject({
        interviewId: INTERVIEW_ID,
        questionId: 'purpose',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('walks to done, shows the minted draft version with a bot link', async () => {
    const fetchStub = answerRouter();
    vi.stubGlobal('fetch', fetchStub);
    try {
      render(<InterviewPage />);
      await startInterview();
      await answerCurrent('A study bot');
      await screen.findByText('Which channels?');
      await answerCurrent('#general');
      await screen.findByText('Welcome text?');
      await answerCurrent('Read the rules.');
      await screen.findByText('How strict?');
      await answerCurrent('strict');
      await screen.findByText('Draft v1 ready.');
      expect(screen.getByRole('link', { name: 'View bot' })).toHaveProperty(
        'href',
        expect.stringContaining(`/dashboard/bots/${INTERVIEW_ID}`),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('DiffView accept before any draft exists stays local-only (no fetch)', () => {
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    try {
      render(<InterviewPage />);
      fireEvent.click(screen.getAllByRole('button', { name: /Accept / })[0]);
      expect(fetchStub).not.toHaveBeenCalled();
      expect(screen.getAllByRole('button', { name: /Accept / })).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('DiffView accept after done POSTs /api/spec/patch with botId/baseVersion', async () => {
    const fetchStub = answerRouter();
    vi.stubGlobal('fetch', fetchStub);
    try {
      render(<InterviewPage />);
      await startInterview();
      await answerCurrent('A study bot');
      await screen.findByText('Which channels?');
      await answerCurrent('#general');
      await screen.findByText('Welcome text?');
      await answerCurrent('Read the rules.');
      await screen.findByText('How strict?');
      await answerCurrent('strict');
      await screen.findByText('Draft v1 ready.');
      fireEvent.click(screen.getAllByRole('button', { name: /Accept / })[0]);
      await screen.findByText('Draft v2 saved.');
      const [, init] = fetchStub.mock.calls.find(([url]) =>
        String(url).includes('/api/spec/patch'),
      ) as [unknown, { body: string }];
      expect(JSON.parse(init.body)).toMatchObject({ botId: INTERVIEW_ID, baseVersion: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('401 on start shows the logged-out line with a login link', async () => {
    const fetchStub = vi.fn(async () => Response.json({ error: 'unauthorized' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchStub);
    try {
      render(<InterviewPage />);
      fireEvent.change(screen.getByLabelText('Bot name'), { target: { value: 'Study Hall' } });
      fireEvent.click(screen.getByRole('button', { name: 'Start interview' }));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('You are logged out.');
      expect(screen.getByRole('link', { name: 'Log in' })).toHaveProperty(
        'href',
        expect.stringContaining('/api/auth/login'),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
