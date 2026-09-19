'use client';

/* Bot detail page (D-118): header, actions, Overview/Activity/Pre-flight
   tabs, and the AI composer with a live thread. Unknown ids get an honest
   empty state, never a guessed bot. KI-030: empty, not example — no mock
   bots, specs, activity, or pre-flight rows are presented as real data. */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { explain } from '@corvus/spec';
import { PromptInput } from '@/components/ui/ai-chat-input';
import { Input } from '@/components/ui/Input';
import { ChatAssistantRow } from '@/components/ui/chat-thread';
import { useChatStream } from '@/components/ui/use-chat-stream';
import threadStyles from '@/components/ui/chat-thread.module.css';
import {
  fetchBots,
  formatActivityTime,
  resolveBotId,
  TRIAL_DEAL,
  TRIAL_EXPIRED_MESSAGE,
  type BotStatus,
  type LiveActivityItem,
  type MockBot,
} from '@/lib/bots';
import styles from './page.module.css';

const STATUS_LABEL: Record<BotStatus, string> = {
  online: 'Live',
  trial: 'Trial',
  offline: 'Offline',
};

type DetailTab = 'overview' | 'activity' | 'preflight';

const DETAIL_TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'preflight', label: 'Pre-flight' },
];

function validTab(value: string | null): DetailTab {
  return value === 'activity' || value === 'preflight' ? value : 'overview';
}

/* Starter prompts — a click fills the composer; the composer is the only place a change is sent from. */
const SUGGESTIONS = ['Welcome message', 'Moderation rule', 'XP rewards'];

/* loading — request in flight; live — API rows; empty — API said none;
   error — 401/network/anything else, so an honest empty state is shown
   (KI-030: never example rows passed off as the account's data). */
type ActivityState =
  | { status: 'loading' }
  | { status: 'live'; items: LiveActivityItem[] }
  | { status: 'empty' }
  | { status: 'error' };

const ACTIVITY_LIMIT = 20;

/* One builder run costs about this much; a simulation bills nothing. */
const CREDITS_PER_CHANGE = 1.1;

const LOGIN_HREF = '/api/auth/login';
const LOGGED_OUT_LINE = 'You are logged out — log in again, then try again.';
const PREFLIGHT_POLL_MS = 1000;
const PREFLIGHT_TIMEOUT_MS = 60000;
const GUILD_ID_RE = /^\d{17,20}$/;

/* Local-only ids are not on the server, so every write answers 404 — the UI
     says that honestly instead of faking a success. */
function notSavedYet(action: string): string {
  return `This bot is not saved on the server yet, so ${action} is unavailable.`;
}

interface ActionNote {
  text: string;
  login?: boolean;
}

function readJsonPayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function readJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    return readJsonPayload(await response.json());
  } catch {
    return {};
  }
}

function failingNames(payload: Record<string, unknown>): string[] {
  if (!Array.isArray(payload.failing)) return [];
  return payload.failing.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
}

interface ScanRow {
  tone: 'pass' | 'warn';
  text: string;
}

function rowToneOf(record: Record<string, unknown>): string {
  if (typeof record.severity === 'string') return record.severity.toLowerCase();
  if (typeof record.tone === 'string') return record.tone.toLowerCase();
  return '';
}

/* Worker rows carry { tone|severity, check, detail }. Anything malformed is
   shown as-is, never dropped silently. */
function toScanRow(row: unknown): ScanRow {
  if (typeof row !== 'object' || row === null) {
    return { tone: 'warn', text: 'A check finished with no details.' };
  }
  const record = row as Record<string, unknown>;
  const check = typeof record.check === 'string' && record.check.length > 0 ? record.check : null;
  const detail =
    typeof record.detail === 'string' && record.detail.length > 0 ? record.detail : null;
  const text =
    check !== null && detail !== null
      ? `${check}: ${detail}`
      : (detail ?? check ?? 'A check finished with no details.');
  return { tone: rowToneOf(record) === 'green' ? 'pass' : 'warn', text };
}

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'live'; rows: ScanRow[]; summary: string | null }
  | { status: 'error'; text: string; login?: boolean };

function ActionNoteLine({ note }: { note: ActionNote }) {
  return (
    <p role="status" className={styles.todaySentence}>
      {note.text}
      {note.login === true ? (
        <>
          {' '}
          <a href={LOGIN_HREF}>Log in</a>
        </>
      ) : null}
    </p>
  );
}

function StatusPill({ status }: { status: BotStatus }) {
  return (
    <span className={`${styles.pill} ${styles[`pill-${status}`]}`}>
      <span aria-hidden="true" className={styles.dot} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/* A server id is fetched; a mock key is local-only and never stands in as
   real data. An injected list (tests) is authoritative and never fetched
   over. */
type ListState =
  { status: 'ready'; bots: MockBot[] } | { status: 'loading' } | { status: 'unauthorized' };

function BotDetailInner({
  bots: injectedBots,
  trialExpired: injectedTrialExpired,
}: {
  bots?: MockBot[];
  /* KI-033: the trial clock is server truth (accounts.trial_ends_at) and this
     page is 'use client', so the flag is read from GET /api/session/trial on
     mount — never from the bot rows, and never guessed. An injected prop
     (tests) wins; otherwise absent/fetch-fail means "not expired as far as
     this read knows" and the banner stays off. */
  trialExpired?: boolean;
}) {
  const routeParams = useParams<{ id: string }>();
  const id = typeof routeParams?.id === 'string' ? routeParams.id : '';
  const serverId = resolveBotId(id);

  /* KI-030: empty, not example — an injected list (tests) is authoritative;
     otherwise a server id is fetched and anything else is an unknown id
     (honest empty state), never a mock bot presented as real. */
  const [list, setList] = useState<ListState>(() => {
    if (injectedBots !== undefined) return { status: 'ready', bots: injectedBots };
    if (serverId === null) return { status: 'ready', bots: [] };
    return { status: 'loading' };
  });
  const [lookupNonce, setLookupNonce] = useState(0);

  useEffect(() => {
    if (injectedBots !== undefined || serverId === null) return;
    const controller = new AbortController();
    let active = true;
    setList({ status: 'loading' });
    void fetchBots(controller.signal).then((snapshot) => {
      if (!active) return;
      if (snapshot.unauthorized) {
        setList({ status: 'unauthorized' });
        return;
      }
      setList({ status: 'ready', bots: snapshot.bots });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [injectedBots, serverId, lookupNonce]);

  /* The expiry signal arrives from GET /api/session/trial (never from the bot
     rows). An injected prop (tests) wins outright; otherwise the endpoint is
     read once on mount and any failure resolves to false — fail-open, so a
     down session read can never conjure a banner. */
  const [liveTrialExpired, setLiveTrialExpired] = useState(false);
  useEffect(() => {
    if (injectedTrialExpired !== undefined) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/session/trial', { signal: controller.signal });
        if (!active || !response.ok) return;
        const payload: unknown = await response.json();
        if (!active) return;
        if (typeof payload === 'object' && payload !== null) {
          const flag = (payload as Record<string, unknown>).trialExpired;
          if (typeof flag === 'boolean' && flag) setLiveTrialExpired(true);
        }
      } catch {
        return;
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [injectedTrialExpired]);
  const trialExpired = injectedTrialExpired ?? liveTrialExpired;

  const bot = list.status === 'ready' ? (list.bots.find((entry) => entry.id === id) ?? null) : null;
  /* Writes send only a real server id; a mock key becomes null (D-112). */
  const writeBotId = resolveBotId(bot?.id);
  /* Card deep actions land here (?tab=activity|preflight); anything else is overview. */
  const searchParams = useSearchParams();
  const [detailTab, setDetailTab] = useState<DetailTab>(() => validTab(searchParams.get('tab')));
  const requestedTab = validTab(searchParams.get('tab'));
  useEffect(() => {
    setDetailTab(requestedTab);
  }, [requestedTab]);
  const [draft, setDraft] = useState('');
  const composerRef = useRef<HTMLDivElement>(null);
  const { messages, streaming, submit, retry } = useChatStream(bot?.id ?? null);
  const [activity, setActivity] = useState<ActivityState>({ status: 'loading' });

  /* Wired controls: versions and behaviors come from GET draft when the
     server has this bot; otherwise there is no draft and every write degrades
     to its honest error line. */
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [draftBehaviors, setDraftBehaviors] = useState<unknown[] | null>(null);
  const [publishNote, setPublishNote] = useState<ActionNote | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [rollbackNote, setRollbackNote] = useState<ActionNote | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteWhys, setInviteWhys] = useState<string[]>([]);
  const [inviteNote, setInviteNote] = useState<ActionNote | null>(null);
  const [guildId, setGuildId] = useState('');
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  const scanActive = useRef(false);
  const [simNote, setSimNote] = useState<ActionNote | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [fired, setFired] = useState<{ title: string; reason: string }[] | null>(null);
  const [patchNote, setPatchNote] = useState<ActionNote | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [startingBuild, setStartingBuild] = useState(false);
  const [buildNote, setBuildNote] = useState<ActionNote | null>(null);
  /* The real run id a started build hands back. While null there is no link —
     never a fabricated one (KI-014). */
  const [startedRunId, setStartedRunId] = useState<string | null>(null);

  async function refreshDraft(botId: string, signal?: AbortSignal): Promise<number | null> {
    try {
      const response = await fetch(`/api/spec/draft?botId=${encodeURIComponent(botId)}`, {
        ...(signal === undefined ? {} : { signal }),
      });
      if (signal !== undefined && signal.aborted) return null;
      if (!response.ok) return null;
      const payload = readJsonPayload(await response.json());
      if (signal !== undefined && signal.aborted) return null;
      if (typeof payload.version !== 'number') return null;
      const behaviors = readJsonPayload(payload.spec).behaviors;
      if (!Array.isArray(behaviors)) return null;
      setDraftVersion(payload.version);
      setDraftBehaviors(behaviors);
      return payload.version;
    } catch {
      return null;
    }
  }

  async function pollScan(jobId: string): Promise<void> {
    const deadline = Date.now() + PREFLIGHT_TIMEOUT_MS;
    for (;;) {
      if (!scanActive.current) return;
      if (Date.now() > deadline) {
        if (scanActive.current) {
          setScan({ status: 'error', text: 'The scan is taking too long — try again later.' });
        }
        return;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, PREFLIGHT_POLL_MS);
      });
      if (!scanActive.current) return;
      let response: Response;
      try {
        response = await fetch(`/api/preflight?jobId=${encodeURIComponent(jobId)}`);
      } catch {
        if (scanActive.current) {
          setScan({
            status: 'error',
            text: 'Could not read the scan — check your connection and try again.',
          });
        }
        return;
      }
      if (!scanActive.current) return;
      if (response.status === 401) {
        setScan({ status: 'error', text: LOGGED_OUT_LINE, login: true });
        return;
      }
      const payload = await readJsonSafe(response);
      const state = typeof payload.state === 'string' ? payload.state : '';
      if (state === 'done') {
        const envelope = readJsonPayload(payload.preflight);
        if (!Array.isArray(envelope.rows)) {
          setScan({
            status: 'error',
            text: 'The scan finished, but the results were unreadable — run it again.',
          });
          return;
        }
        const summary = readJsonPayload(envelope.summary);
        const counts = ['red', 'yellow', 'green'].map((key) =>
          typeof summary[key] === 'number' ? summary[key] : null,
        );
        setScan({
          status: 'live',
          rows: envelope.rows.map(toScanRow),
          summary: counts.every((count): count is number => typeof count === 'number')
            ? `Scan finished: ${counts[2]} green, ${counts[1]} yellow, ${counts[0]} red.`
            : null,
        });
        return;
      }
      if (state === 'failed') {
        setScan({ status: 'error', text: 'The scan failed — try again.' });
        return;
      }
      if (state === 'created' || state === 'retry' || state === 'active') {
        continue;
      }
      if (response.status === 404) {
        setScan({ status: 'error', text: 'The scan went missing — run it again.' });
        return;
      }
      setScan({ status: 'error', text: 'Could not read the scan — try again.' });
      return;
    }
  }

  /* A chip only fills its composer — it never sends. Open the composer so the filled
     text is actually visible (the shared input renders collapsed by default). */
  function applySuggestion(text: string) {
    setDraft(text);
    composerRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="Open prompt input"]')
      ?.click();
  }

  /* The real explainer runs over the loaded draft when the server has one —
     the sentences are derived live, not stored. With no draft loaded there is
     no spec to describe, so the overview renders its honest empty state —
     never mock specs passed off as real (KI-030). */
  const explainerSentences = useMemo(() => {
    if (bot === null) return [];
    if (draftBehaviors === null) return [];
    return explain({ version: 1, behaviors: draftBehaviors });
  }, [bot, draftBehaviors]);

  /* Load the draft on mount; a miss leaves no draft — the overview and
     writes stay honest about it. */
  useEffect(() => {
    if (bot === null) return;
    const controller = new AbortController();
    void refreshDraft(bot.id, controller.signal);
    return () => {
      controller.abort();
    };
  }, [bot]);

  /* A scan, invite link, or draft version belongs to one bot — never show
     another bot's results after switching. */
  useEffect(() => {
    scanActive.current = false;
    setScan({ status: 'idle' });
    setGuildId('');
    setDraftVersion(null);
    setDraftBehaviors(null);
    setPublishNote(null);
    setRollbackNote(null);
    setInviteUrl(null);
    setInviteWhys([]);
    setInviteNote(null);
    setSimNote(null);
    setFired(null);
    setPatchNote(null);
    setBuildNote(null);
    setStartedRunId(null);
    setStartingBuild(false);
  }, [bot]);

  /* Fetch the live feed only while the Activity tab is showing. The active flag +
     AbortController drop a response that lands after the bot or tab changed. */
  useEffect(() => {
    if (bot === null || detailTab !== 'activity') return;
    const controller = new AbortController();
    let active = true;
    setActivity({ status: 'loading' });
    fetch(`/api/bots/${bot.id}/activity?limit=${ACTIVITY_LIMIT}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setActivity({ status: 'error' });
          return;
        }
        const payload = (await response.json()) as { items?: LiveActivityItem[] };
        if (!active) return;
        const items = Array.isArray(payload.items) ? payload.items : [];
        setActivity(items.length === 0 ? { status: 'empty' } : { status: 'live', items });
      })
      .catch(() => {
        if (active) setActivity({ status: 'error' });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [bot, detailTab]);

  async function runPublish(): Promise<void> {
    if (bot === null || publishing) return;
    const botId = bot.id;
    setPublishing(true);
    setPublishNote(null);
    try {
      const version = draftVersion ?? (await refreshDraft(botId));
      const response = await fetch('/api/spec/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          version === null ? { botId: writeBotId } : { botId: writeBotId, version },
        ),
      });
      if (response.status === 401) {
        setPublishNote({ text: LOGGED_OUT_LINE, login: true });
        return;
      }
      const payload = await readJsonSafe(response);
      if (response.ok) {
        const published = typeof payload.version === 'number' ? payload.version : version;
        setPublishNote({
          text:
            published === null
              ? 'Version saved. Your bot isn’t live on Discord yet.'
              : `Version ${published} saved. Your bot isn’t live on Discord yet.`,
        });
        return;
      }
      if (response.status === 409 && payload.reason === 'preflight-red') {
        const failing = failingNames(payload);
        setPublishNote({
          text:
            failing.length > 0
              ? `Save blocked — failing checks: ${failing.join(', ')}. Fix them and run the scan again.`
              : 'Save blocked — a pre-flight check is failing. Fix it and run the scan again.',
        });
        return;
      }
      if (response.status === 409) {
        setPublishNote({ text: 'Someone changed the draft — loading the latest version.' });
        const fresh = await refreshDraft(botId);
        if (fresh !== null) {
          setPublishNote({ text: `Loaded v${fresh} — press Save version to retry.` });
        }
        return;
      }
      if (response.status === 404) {
        setPublishNote({
          text:
            payload.error === 'no draft yet'
              ? 'No draft exists for this bot yet.'
              : notSavedYet('publishing'),
        });
        return;
      }
      setPublishNote({ text: 'Could not save — try again.' });
    } catch {
      setPublishNote({ text: 'Could not save — check your connection and try again.' });
    } finally {
      setPublishing(false);
    }
  }

  async function runRollback(): Promise<void> {
    if (bot === null || rollingBack) return;
    const botId = bot.id;
    setRollingBack(true);
    setRollbackNote(null);
    try {
      let known = draftVersion;
      let target = known !== null && known > 1 ? known - 1 : null;
      if (target === null && known === null) {
        known = await refreshDraft(botId);
        if (known !== null && known > 1) target = known - 1;
      }
      if (target === null) {
        setRollbackNote({
          text:
            known !== null && known <= 1
              ? 'Nothing to roll back to yet.'
              : 'Could not roll back — the current version is unknown. Reload and try again.',
        });
        return;
      }
      const response = await fetch('/api/spec/rollback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botId: writeBotId, version: target }),
      });
      if (response.status === 401) {
        setRollbackNote({ text: LOGGED_OUT_LINE, login: true });
        return;
      }
      const payload = await readJsonSafe(response);
      if (response.ok) {
        const restored = typeof payload.version === 'number' ? payload.version : target;
        setRollbackNote({ text: `Rolled back to v${restored}.` });
        return;
      }
      if (response.status === 409) {
        setRollbackNote({ text: 'Someone changed the draft — loading the latest version.' });
        const fresh = await refreshDraft(botId);
        if (fresh !== null) {
          setRollbackNote({ text: `Loaded v${fresh} — press Rollback to retry.` });
        }
        return;
      }
      if (response.status === 404) {
        setRollbackNote({ text: notSavedYet('rolling back') });
        return;
      }
      setRollbackNote({ text: 'Could not roll back — try again.' });
    } catch {
      setRollbackNote({ text: 'Could not roll back — check your connection and try again.' });
    } finally {
      setRollingBack(false);
    }
  }

  async function runOpen(): Promise<void> {
    if (bot === null || inviteLoading) return;
    setInviteLoading(true);
    setInviteNote(null);
    try {
      const response = await fetch('/api/invite');
      const payload = await readJsonSafe(response);
      if (response.ok) {
        const url = typeof payload.url === 'string' ? payload.url : '';
        if (url.length > 0) {
          const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
          const whys: string[] = [];
          for (const entry of permissions) {
            if (typeof entry !== 'object' || entry === null) continue;
            const why = (entry as Record<string, unknown>).why;
            if (typeof why === 'string' && why.length > 0 && !whys.includes(why)) {
              whys.push(why);
            }
          }
          setInviteUrl(url);
          setInviteWhys(whys);
          return;
        }
      }
      setInviteNote({ text: 'Could not prepare the install link — try again.' });
    } catch {
      setInviteNote({
        text: 'Could not prepare the install link — check your connection and try again.',
      });
    } finally {
      setInviteLoading(false);
    }
  }

  async function runScan(): Promise<void> {
    if (bot === null || scan.status === 'scanning') return;
    const trimmedGuild = guildId.trim();
    if (!GUILD_ID_RE.test(trimmedGuild)) {
      setScan({
        status: 'error',
        text: 'Enter the server ID from the server settings — 17 to 20 digits.',
      });
      return;
    }
    scanActive.current = true;
    setScan({ status: 'scanning' });
    try {
      const response = await fetch('/api/preflight/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          botId: writeBotId,
          guildId: trimmedGuild,
          capabilities: ['welcome'],
        }),
      });
      if (!scanActive.current) return;
      if (response.status === 401) {
        setScan({ status: 'error', text: LOGGED_OUT_LINE, login: true });
        return;
      }
      const payload = await readJsonSafe(response);
      if (response.ok && typeof payload.jobId === 'string' && payload.jobId.length > 0) {
        await pollScan(payload.jobId);
        return;
      }
      if (!scanActive.current) return;
      if (response.status === 404) {
        setScan({ status: 'error', text: notSavedYet('running a scan') });
        return;
      }
      setScan({ status: 'error', text: 'Could not start the scan — try again.' });
    } catch {
      if (scanActive.current) {
        setScan({
          status: 'error',
          text: 'Could not start the scan — check your connection and try again.',
        });
      }
    }
  }

  async function runSimulate(): Promise<void> {
    if (bot === null || simulating) return;
    setSimulating(true);
    setSimNote(null);
    setFired(null);
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botId: writeBotId, event: { kind: 'join' } }),
      });
      if (response.status === 401) {
        setSimNote({ text: LOGGED_OUT_LINE, login: true });
        return;
      }
      const payload = await readJsonSafe(response);
      if (response.ok && Array.isArray(payload.fired)) {
        const list: { title: string; reason: string }[] = [];
        payload.fired.forEach((entry: unknown, index: number) => {
          if (typeof entry !== 'object' || entry === null) return;
          const record = entry as Record<string, unknown>;
          const title =
            typeof record.title === 'string' && record.title.length > 0
              ? record.title
              : `#${index}`;
          const reason =
            typeof record.reason === 'string' && record.reason.length > 0 ? record.reason : 'fired';
          list.push({ title, reason });
        });
        setFired(list);
        return;
      }
      if (response.status === 404) {
        setSimNote({
          text:
            payload.error === 'no draft yet'
              ? 'No draft exists for this bot yet.'
              : notSavedYet('running a simulation'),
        });
        return;
      }
      setSimNote({ text: 'Could not run the simulation — try again.' });
    } catch {
      setSimNote({ text: 'Could not run the simulation — check your connection and try again.' });
    } finally {
      setSimulating(false);
    }
  }

  async function runSaveDraft(): Promise<void> {
    if (bot === null || savingDraft) return;
    const botId = bot.id;
    const text = draft.trim();
    if (text.length === 0) return;
    setSavingDraft(true);
    setPatchNote(null);
    try {
      const base = draftVersion ?? (await refreshDraft(botId)) ?? 1;
      const behaviors = [...(draftBehaviors ?? []), { kind: 'note', title: 'Note', detail: text }];
      const response = await fetch('/api/spec/patch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          botId: writeBotId,
          baseVersion: base,
          behaviors,
          summary: text.slice(0, 500),
        }),
      });
      if (response.status === 401) {
        setPatchNote({ text: LOGGED_OUT_LINE, login: true });
        return;
      }
      const payload = await readJsonSafe(response);
      if (response.ok && typeof payload.version === 'number') {
        setDraftVersion(payload.version);
        setDraftBehaviors(behaviors);
        setPatchNote({ text: `Saved as draft v${payload.version}.` });
        return;
      }
      if (response.status === 409) {
        setPatchNote({ text: 'Someone changed the draft — loading the latest version.' });
        const fresh = await refreshDraft(botId);
        if (fresh !== null) {
          setPatchNote({ text: 'Loaded the latest version — press Save as draft to retry.' });
        }
        return;
      }
      if (response.status === 404) {
        setPatchNote({
          text:
            payload.error === 'no draft yet'
              ? 'No draft exists for this bot yet.'
              : notSavedYet('saving'),
        });
        return;
      }
      setPatchNote({ text: 'Could not save — try again.' });
    } catch {
      setPatchNote({ text: 'Could not save — check your connection and try again.' });
    } finally {
      setSavingDraft(false);
    }
  }

  /* Start a real builder run for this bot, from the text in the composer, then
     hand back the link to its live progress. A local-only bot has no server
     id, so no run can start — that is said plainly, never faked. */
  async function runStartBuild(): Promise<void> {
    if (bot === null || startingBuild) return;
    const brief = draft.trim();
    if (brief.length === 0) {
      setBuildNote({ text: 'Describe the change you want, then start the build.' });
      return;
    }
    if (brief.length > 2000) {
      setBuildNote({ text: 'That is too long to build from — keep it under 2000 characters.' });
      return;
    }
    if (writeBotId === null) {
      setBuildNote({ text: notSavedYet('starting a build') });
      return;
    }
    setStartingBuild(true);
    setBuildNote(null);
    setStartedRunId(null);
    try {
      const response = await fetch('/api/builder/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botId: writeBotId, brief }),
      });
      if (response.status === 401) {
        setBuildNote({ text: LOGGED_OUT_LINE, login: true });
        return;
      }
      const payload = await readJsonSafe(response);
      const runId = typeof payload.runId === 'string' ? payload.runId : '';
      if (response.ok && runId.length > 0) {
        setStartedRunId(runId);
        return;
      }
      if (response.status === 404) {
        setBuildNote({ text: notSavedYet('starting a build') });
        return;
      }
      setBuildNote({ text: 'Could not start the build — try again.' });
    } catch {
      setBuildNote({ text: 'Could not start the build — check your connection and try again.' });
    } finally {
      setStartingBuild(false);
    }
  }

  const composer = (
    <>
      <div role="group" aria-label="Suggested changes" className={threadStyles.suggestionRow}>
        {SUGGESTIONS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => applySuggestion(label)}
            className={threadStyles.suggestionChip}
          >
            {label}
          </button>
        ))}
      </div>
      <PromptInput
        ref={composerRef}
        placeholder="Describe a change…"
        value={draft}
        onChange={setDraft}
        onSubmit={(value, meta) => submit(value, meta.attachments)}
      />
      <p className={threadStyles.composerCost}>
        About {CREDITS_PER_CHANGE} credits per change · platform failures retry free.
      </p>
    </>
  );

  if (bot === null) {
    /* A server id is still being fetched — hold the shell, do not guess. */
    if (list.status === 'loading') {
      return (
        <div className={styles.detailScroll}>
          <div className={styles.detailInner}>
            <a href="/dashboard/bots" className={styles.backLink}>
              ← All bots
            </a>
          </div>
        </div>
      );
    }
    /* The list could not be read because the session is gone (D-112): say so
       and offer the fix, instead of showing it as a deleted bot. */
    if (list.status === 'unauthorized') {
      return (
        <div className={styles.detailScroll}>
          <div className={styles.detailInner}>
            <a href="/dashboard/bots" className={styles.backLink}>
              ← All bots
            </a>
            <div className={styles.empty}>
              <p className={styles.emptyText}>{LOGGED_OUT_LINE}</p>
              <div className={styles.actionRow}>
                <a href={LOGIN_HREF} className={styles.ghostAction}>
                  Log in
                </a>
                <button
                  type="button"
                  className={styles.ghostAction}
                  onClick={() => setLookupNonce((nonce) => nonce + 1)}
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.detailScroll}>
        <div className={styles.detailInner}>
          <a href="/dashboard/bots" className={styles.backLink}>
            ← All bots
          </a>
          <div className={styles.empty}>
            <p className={styles.emptyText}>No bot with this address — it may have been deleted.</p>
            <a href="/dashboard/bots" className={styles.ghostAction}>
              Back to your bots
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Layout provides shell + main landmark; this page owns scroll + composer. */}
      <div className={styles.detailScroll}>
        <div className={styles.detailInner}>
          <a href="/dashboard/bots" className={styles.backLink}>
            ← All bots
          </a>
          <div className={styles.detailHead}>
            <div className={styles.detailTitleRow}>
              <span aria-hidden="true" className={styles.rowAvatar}>
                {bot.name.charAt(0)}
              </span>
              <h1 className={styles.detailTitle}>{bot.name}</h1>
              <StatusPill status={bot.status} />
            </div>
            {trialExpired ? (
              <p role="status" className={styles.trialText}>
                {TRIAL_EXPIRED_MESSAGE}
              </p>
            ) : null}
            {bot.status === 'trial' ? <p className={styles.trialText}>{TRIAL_DEAL}</p> : null}
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.ghostAction}
                onClick={() => void runOpen()}
                disabled={inviteLoading}
              >
                Open
              </button>
              <button type="button" className={styles.ghostAction}>
                Continue interview
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => void runPublish()}
                disabled={publishing}
              >
                Save version
              </button>
              <button
                type="button"
                className={styles.textAction}
                onClick={() => void runRollback()}
                disabled={rollingBack}
              >
                Rollback
              </button>
            </div>
            {inviteLoading ||
            inviteUrl !== null ||
            inviteNote !== null ||
            publishNote !== null ||
            rollbackNote !== null ? (
              <div>
                {inviteLoading ? (
                  <p role="status" className={styles.todaySentence}>
                    preparing invite…
                  </p>
                ) : null}
                {inviteUrl !== null ? (
                  <div>
                    <a
                      className={styles.ghostAction}
                      href={inviteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open install link (shared test app — your own bot install isn’t wired yet)
                    </a>
                    {inviteWhys.length > 0 ? (
                      <ul className={styles.activityList}>
                        {inviteWhys.map((why) => (
                          <li key={why} className={styles.activityRow}>
                            <span className={styles.activityText}>{why}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {inviteNote !== null ? <ActionNoteLine note={inviteNote} /> : null}
                {publishNote !== null ? <ActionNoteLine note={publishNote} /> : null}
                {rollbackNote !== null ? <ActionNoteLine note={rollbackNote} /> : null}
              </div>
            ) : null}
          </div>
          <div role="tablist" aria-label="Bot detail" className={styles.detailTabs}>
            {DETAIL_TABS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="tab"
                id={`detail-tab-${entry.value}`}
                aria-selected={detailTab === entry.value}
                aria-controls="detail-tabpanel"
                onClick={() => setDetailTab(entry.value)}
                className={styles.tab}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="detail-tabpanel"
            aria-labelledby={`detail-tab-${detailTab}`}
            className={styles.detailPanel}
          >
            {detailTab === 'overview' ? (
              <section aria-label="What this bot does" className={styles.card}>
                <h2 className={styles.cardTitle}>What this bot does</h2>
                {explainerSentences.length > 0 ? (
                  <ul className={styles.activityList}>
                    {explainerSentences.map((sentence, index) => (
                      <li key={`${bot.id}-sentence-${index}`} className={styles.activityRow}>
                        <span className={styles.activityText}>{sentence}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.todaySentence}>
                    No description yet — the saved draft will describe it here.
                  </p>
                )}
              </section>
            ) : null}
            {detailTab === 'activity' ? (
              <section aria-label="Recent activity" className={styles.card}>
                <div className={styles.panelHead}>
                  <h2 className={styles.cardTitle}>Recent activity</h2>
                </div>
                {activity.status === 'loading' ? (
                  <p className={styles.todaySentence}>Loading live activity…</p>
                ) : activity.status === 'live' ? (
                  <ul className={styles.activityList}>
                    {activity.items.map((item, index) => (
                      <li key={`${item.at}-${index}`} className={styles.activityRow}>
                        <span className={styles.activityText}>
                          <span className={styles.activityKind}>{item.kind}</span>
                          {item.text}
                        </span>
                        <span className={styles.activityTime}>
                          {item.credits !== undefined ? `${item.credits} credits · ` : ''}
                          {formatActivityTime(item.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : activity.status === 'empty' ? (
                  <p className={styles.todaySentence}>No activity yet.</p>
                ) : (
                  <p className={styles.todaySentence}>
                    Could not load activity — check your connection and try again.
                  </p>
                )}
              </section>
            ) : null}
            {detailTab === 'preflight' ? (
              <section aria-label="Pre-flight" className={styles.card}>
                <div className={styles.panelHead}>
                  <h2 className={styles.cardTitle}>Pre-flight</h2>
                </div>
                {scan.status === 'live' ? (
                  <>
                    {scan.summary !== null ? (
                      <p className={styles.todaySentence}>{scan.summary}</p>
                    ) : null}
                    <ul className={styles.activityList}>
                      {scan.rows.map((row, index) => (
                        <li key={`scan-row-${index}`} className={styles.preflightRow}>
                          <span
                            aria-hidden="true"
                            className={`${styles.preDot} ${row.tone === 'pass' ? styles.prePass : styles.preWarn}`}
                          />
                          {row.text}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : scan.status === 'idle' ? (
                  <p className={styles.todaySentence}>
                    No scan yet — enter a server ID and run a scan.
                  </p>
                ) : null}
                <div className={styles.actionRow}>
                  <Input
                    id="preflight-guild"
                    label="Server ID"
                    placeholder="Server ID"
                    value={guildId}
                    onChange={(event) => setGuildId(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className={styles.ghostAction}
                    onClick={() => void runScan()}
                    disabled={scan.status === 'scanning'}
                  >
                    Run scan
                  </button>
                </div>
                {scan.status === 'scanning' ? (
                  <p role="status" className={styles.todaySentence}>
                    Scanning…
                  </p>
                ) : null}
                {scan.status === 'error' ? <ActionNoteLine note={scan} /> : null}
              </section>
            ) : null}
          </div>
        </div>
      </div>
      <div className={styles.aiBar}>
        <div className={styles.aiBarInner}>
          {messages.length > 0 ? (
            <ul aria-label="Submitted changes" className={styles.activityList}>
              {messages.map((message) =>
                message.role === 'user' ? (
                  <li key={message.id} className={styles.activityRow}>
                    <span className={styles.activityText}>You: {message.text}</span>
                    {message.attachmentCount > 0 ? (
                      <span className={styles.activityTime}>
                        {message.attachmentCount} attachment(s)
                      </span>
                    ) : null}
                  </li>
                ) : (
                  <ChatAssistantRow key={message.id} message={message} onRetry={retry} />
                ),
              )}
            </ul>
          ) : null}
          <div className={streaming ? threadStyles.composerLocked : undefined} inert={streaming}>
            {composer}
          </div>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.ghostAction}
              onClick={() => void runSimulate()}
              disabled={simulating}
            >
              Simulate join
            </button>
            <button
              type="button"
              className={styles.ghostAction}
              onClick={() => void runSaveDraft()}
              disabled={savingDraft || draft.trim().length === 0}
            >
              Save as draft
            </button>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => void runStartBuild()}
              disabled={startingBuild || draft.trim().length === 0}
            >
              {startingBuild ? 'Starting…' : 'Start build'}
            </button>
          </div>
          {fired !== null ? (
            fired.length > 0 ? (
              <ul aria-label="Simulation result" className={styles.activityList}>
                {fired.map((entry, index) => (
                  <li key={`fired-${index}`} className={styles.activityRow}>
                    <span className={styles.activityText}>
                      {entry.title} — {entry.reason}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className={styles.todaySentence}>
                No draft entries would fire for a new member joining.
              </p>
            )
          ) : null}
          {simNote !== null ? <ActionNoteLine note={simNote} /> : null}
          {patchNote !== null ? <ActionNoteLine note={patchNote} /> : null}
          {buildNote !== null ? <ActionNoteLine note={buildNote} /> : null}
          {startedRunId !== null ? (
            <p role="status" className={styles.todaySentence}>
              Build started.{' '}
              <a href={`/dashboard?runId=${encodeURIComponent(startedRunId)}`}>Follow the build</a>
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function BotDetailPage({
  bots,
  trialExpired,
}: {
  bots?: MockBot[];
  trialExpired?: boolean;
}) {
  return (
    <Suspense>
      <BotDetailInner bots={bots} trialExpired={trialExpired} />
    </Suspense>
  );
}
