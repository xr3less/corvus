'use client';

/* Bot detail page (D-118): header, actions, Overview/Activity/Pre-flight
   tabs, and the AI composer with a live thread. Unknown ids get an honest
   empty state, never a guessed bot. KI-030: empty, not example — no mock
   bots, specs, activity, or pre-flight rows are presented as real data.

   Turkish copy (F6, 2026-09-24): the owner reads Turkish, so every string
   this file renders is Turkish, with the wording mirrored from the shipped
   Turkish on `/dashboard/new` and `/dashboard/bots` (`Tekrar dene`,
   `Giriş yap`, `Önerilen değişiklikler`, `Her değişiklik kredi harcar…`)
   instead of inventing a second wording for the same idea. Two English
   sources stay, both owned by other files: the KI-033 trial sentences
   (byte-locked in `lib/bots.ts`, shared with `/dashboard` and the bots list)
   and everything the shared components render (PromptInput,
   BuilderProgress, ErrorCard, ThinkingTrace, and chat-thread's HTTP-error
   line in `lib/chat/thread.ts`). */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { explain } from '@corvus/spec';
import { PromptInput } from '@/components/ui/ai-chat-input';
import { BuilderProgress } from '@/components/ui/builder-progress';
import { ErrorCard } from '@/components/ui/error-card';
import { Input } from '@/components/ui/Input';
import { ChatAssistantRow } from '@/components/ui/chat-thread';
import { useChatStream } from '@/components/ui/use-chat-stream';
import { stitchBrief } from '@/lib/chat/thread';
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
import { readRefusalMessage } from '@/lib/http/refusal';
import styles from './page.module.css';

/* Owner-language labels (Turkish), matching the bots list page and the
   sidebar rail — 'Canlı' / 'Deneme' / 'Çevrimdışı' name the same states. */
const STATUS_LABEL: Record<BotStatus, string> = {
  online: 'Canlı',
  trial: 'Deneme',
  offline: 'Çevrimdışı',
};

type DetailTab = 'overview' | 'activity' | 'preflight';

const DETAIL_TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Genel bakış' },
  { value: 'activity', label: 'Etkinlik' },
  { value: 'preflight', label: 'Ön kontrol' },
];

function validTab(value: string | null): DetailTab {
  return value === 'activity' || value === 'preflight' ? value : 'overview';
}

/* Starter prompts — a click fills the composer; the composer is the only place a change is sent from. Wording mirrors `/dashboard/new`'s shipped Turkish chips. */
const SUGGESTIONS = ['Karşılama mesajı', 'Moderasyon kuralı', 'XP ödülleri'];

/* loading — request in flight; live — API rows; empty — API said none;
   error — 401/network/anything else, so an honest empty state is shown
   (KI-030: never example rows passed off as the account's data). */
type ActivityState =
  | { status: 'loading' }
  | { status: 'live'; items: LiveActivityItem[] }
  | { status: 'empty' }
  | { status: 'error' };

const ACTIVITY_LIMIT = 20;

const LOGIN_HREF = '/api/auth/login';
/* Same wording the bots list page ships for the same state. */
const LOGGED_OUT_LINE = 'Oturumun kapanmış — yeniden giriş yap, sonra tekrar dene.';
const PREFLIGHT_POLL_MS = 1000;
const PREFLIGHT_TIMEOUT_MS = 60000;
const GUILD_ID_RE = /^\d{17,20}$/;

/* Local-only ids are not on the server, so every write answers 404 — the UI
     says that honestly instead of faking a success. `action` is the Turkish
     gerund of the write being attempted ('yayınlama', 'tarama çalıştırma', …). */
function notSavedYet(action: string): string {
  return `Bu bot henüz sunucuya kaydedilmedi, bu yüzden ${action} kullanılamıyor.`;
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

/* Refusal reader lives in lib/http/refusal.ts (shared import above). This
   page's ONE deliberate difference travels as the call-site option
   ({ allowErrorFallback: false }): every `error` value this route can
   answer is a machine code ('could not start build', 'invalid brief', 'bot
   not found', …) and this page's locked copy already rules that a code is
   shown as the honest generic line instead ("a failed start shows the
   honest error"). So a message wins, and anything else keeps the caller's
   own sentence. */

interface ScanRow {
  /* Severity-aware presentation (E5): red maps to the ErrorCard action card,
     yellow to a secondary fix line, green to a plain pass row. The scan
     semantics behind these (counts, red-block decisions) are unchanged. */
  tone: 'red' | 'yellow' | 'green';
  text: string;
  fix: string | null;
}

function rowToneOf(record: Record<string, unknown>): 'red' | 'yellow' | 'green' {
  const raw =
    typeof record.severity === 'string'
      ? record.severity.toLowerCase()
      : typeof record.tone === 'string'
        ? record.tone.toLowerCase()
        : '';
  if (raw === 'red') return 'red';
  if (raw === 'green') return 'green';
  /* Anything else (yellow, unknown, missing) renders as the caution row —
     identical to the previous pass/warn mapping where only green passed. */
  return 'yellow';
}

function readFixOf(record: Record<string, unknown>): string | null {
  return typeof record.fix === 'string' && record.fix.length > 0 ? record.fix : null;
}

/* Worker rows carry { tone|severity, check, detail, fix }. The fix string is
   consumed by the preflight UI (ErrorCard / secondary line) — never dropped.
   Anything malformed is shown as-is, never dropped silently. */
function toScanRow(row: unknown): ScanRow {
  if (typeof row !== 'object' || row === null) {
    return { tone: 'yellow', text: 'Bir kontrol ayrıntı vermeden bitti.', fix: null };
  }
  const record = row as Record<string, unknown>;
  const check = typeof record.check === 'string' && record.check.length > 0 ? record.check : null;
  const detail =
    typeof record.detail === 'string' && record.detail.length > 0 ? record.detail : null;
  const text =
    check !== null && detail !== null
      ? `${check}: ${detail}`
      : (detail ?? check ?? 'Bir kontrol ayrıntı vermeden bitti.');
  return { tone: rowToneOf(record), text, fix: readFixOf(record) };
}

/* A Red row renders its fix as a card title in the `check: detail` shape the
   page's Red-block publish note already names (`Save blocked — failing
   checks: <check>`); Yellow rows keep the compact one-line shape with the
   fix appended as a secondary line; Green stays a plain pass row. */
function scanRowTitle(row: ScanRow): string {
  return row.tone === 'red' ? `İlgilenilmeli — ${row.text}` : row.text;
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
          <a href={LOGIN_HREF}>Giriş yap</a>
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

  /* Load the server's current draft head. The CALLER gets the loaded data back,
     never only the version: a write that runs in the same turn as this read
     cannot see the state these setters queue, and POST /api/spec/patch is a
     full replacement (the posted behaviors become the new head) — so building
     a patch body from stale closure state is how a save wipes a draft it never
     read.

     The three outcomes are kept apart on purpose. `absent` is the server
     answering definitively that there is no draft to read — nothing to
     protect, and the same two 404 codes the patch route answers with.
     `unreadable` is everything else (failed or aborted read), where the server
     may still hold a draft this page cannot see: a write built on it must be
     refused, not guessed. */
  type DraftRead =
    | { status: 'loaded'; version: number; behaviors: unknown[] }
    | { status: 'absent'; error: string }
    | { status: 'unreadable' };

  async function refreshDraft(botId: string, signal?: AbortSignal): Promise<DraftRead> {
    try {
      const response = await fetch(`/api/spec/draft?botId=${encodeURIComponent(botId)}`, {
        ...(signal === undefined ? {} : { signal }),
      });
      if (signal !== undefined && signal.aborted) return { status: 'unreadable' };
      if (response.status === 404) {
        const body = readJsonPayload(await response.json().catch(() => ({})));
        const code = typeof body.error === 'string' ? body.error : '';
        return { status: 'absent', error: code };
      }
      if (!response.ok) return { status: 'unreadable' };
      const payload = readJsonPayload(await response.json());
      if (signal !== undefined && signal.aborted) return { status: 'unreadable' };
      if (typeof payload.version !== 'number') return { status: 'unreadable' };
      const behaviors = readJsonPayload(payload.spec).behaviors;
      if (!Array.isArray(behaviors)) return { status: 'unreadable' };
      setDraftVersion(payload.version);
      setDraftBehaviors(behaviors);
      return { status: 'loaded', version: payload.version, behaviors };
    } catch {
      return { status: 'unreadable' };
    }
  }

  /* Rollback target derivation (M-10). The draft head is NOT production, so
     the page needs the prod pointer too. No pointer endpoint exists; the
     activity feed (GET /api/bots/[botId]/activity, activity/route.ts:263-271)
     lists every publish/rollback move newest-first, so the latest published
     version is the newest feed item whose kind is publish or rollback. The
     text carries the version as 'Published vN' / 'Rolled back to vN'
     (buildPublishText/buildRollbackText); only that exact shape is read, and
     anything else resolves to null — never guessed. A null means "the pointer
     is unknown", never "there is no production history". */
  function publishedVersionFromFeed(items: unknown): number | null {
    if (!Array.isArray(items)) return null;
    for (const entry of items) {
      if (typeof entry !== 'object' || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (record.kind !== 'publish' && record.kind !== 'rollback') continue;
      if (typeof record.text !== 'string') return null;
      const match = /v(\d+)\s*$/.exec(record.text);
      if (match === null) return null;
      const version = Number(match[1]);
      return Number.isInteger(version) && version >= 1 ? version : null;
    }
    return null;
  }

  async function readPublishedVersion(botId: string): Promise<number | null> {
    try {
      const response = await fetch(`/api/bots/${botId}/activity?limit=${ACTIVITY_LIMIT}`);
      if (!response.ok) return null;
      const payload: unknown = await response.json().catch(() => ({}));
      if (typeof payload !== 'object' || payload === null) return null;
      return publishedVersionFromFeed((payload as Record<string, unknown>).items);
    } catch {
      return null;
    }
  }

  /* The cached draft head when the mount load already landed; otherwise one
     fresh draft read (which also repopulates the cache for the next write). */
  async function readDraftVersion(botId: string): Promise<number | null> {
    if (draftVersion !== null) return draftVersion;
    const read = await refreshDraft(botId);
    return read.status === 'loaded' ? read.version : null;
  }

  async function pollScan(jobId: string): Promise<void> {
    const deadline = Date.now() + PREFLIGHT_TIMEOUT_MS;
    for (;;) {
      if (!scanActive.current) return;
      if (Date.now() > deadline) {
        if (scanActive.current) {
          setScan({ status: 'error', text: 'Tarama çok uzun sürüyor — sonra tekrar dene.' });
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
            text: 'Tarama okunamadı — bağlantını kontrol edip tekrar dene.',
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
            text: 'Tarama bitti ama sonuçlar okunamadı — yeniden çalıştır.',
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
            ? `Tarama bitti: ${counts[2]} yeşil, ${counts[1]} sarı, ${counts[0]} kırmızı.`
            : null,
        });
        return;
      }
      if (state === 'failed') {
        setScan({ status: 'error', text: 'Tarama başarısız oldu — tekrar dene.' });
        return;
      }
      if (state === 'created' || state === 'retry' || state === 'active') {
        continue;
      }
      if (response.status === 404) {
        setScan({ status: 'error', text: 'Tarama kayboldu — yeniden çalıştır.' });
        return;
      }
      setScan({ status: 'error', text: 'Tarama okunamadı — tekrar dene.' });
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
      const read = draftVersion === null ? await refreshDraft(botId) : null;
      const version = draftVersion ?? (read?.status === 'loaded' ? read.version : null);
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
              ? 'Sürüm kaydedildi. Botun Discord’da henüz canlıya alınmadı.'
              : `Sürüm ${published} kaydedildi. Botun Discord’da henüz canlıya alınmadı.`,
        });
        return;
      }
      if (response.status === 409 && payload.reason === 'preflight-red') {
        const failing = failingNames(payload);
        setPublishNote({
          text:
            failing.length > 0
              ? `Kaydetme engellendi — başarısız kontroller: ${failing.join(', ')}. Bunları düzelt ve taramayı yeniden çalıştır.`
              : 'Kaydetme engellendi — bir ön kontrol başarısız. Düzelt ve taramayı yeniden çalıştır.',
        });
        return;
      }
      if (response.status === 409) {
        setPublishNote({ text: 'Taslağı biri değiştirdi — en son sürüm yükleniyor.' });
        const reloaded = await refreshDraft(botId);
        if (reloaded.status === 'loaded') {
          setPublishNote({
            text: `v${reloaded.version} yüklendi — tekrar denemek için Sürümü kaydet’e bas.`,
          });
        }
        return;
      }
      if (response.status === 404) {
        setPublishNote({
          text:
            payload.error === 'no draft yet'
              ? 'Bu bot için henüz taslak yok.'
              : notSavedYet('yayınlama'),
        });
        return;
      }
      setPublishNote({ text: 'Kaydedilemedi — tekrar dene.' });
    } catch {
      setPublishNote({ text: 'Kaydedilemedi — bağlantını kontrol edip tekrar dene.' });
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
      /* M-10: the rollback route accepts ONLY a previously-published version
         strictly older than production (rollback/route.ts:222-234). The draft
         head is NOT production — every save-as-draft inserts a new draft row
         while the prod pointer stays where the last publish left it — so
         `draftVersion - 1` 404s whenever a draft-only save runs ahead of prod
         (publish v5 → save-as-draft v6 must target v5, and v6-minus-one is only
         right by coincidence). No API today exposes the prod pointer, so the
         page asks the activity feed — the one client-visible history of every
         publish/rollback move (activity/route.ts:263-271) — for the latest
         published version, and falls back to draft-minus-one only when the
         feed is unreadable. 'Nothing to roll back to yet' fires only on real
         signals: prod is v1, or the feed is empty AND there is no usable draft
         head. A 404 from the server is its own answer — never the false
         "not saved yet" line (that copy fires only when the bot truly has no
         published version, which the branches above already proved). */
      const prodKnown = await readPublishedVersion(botId);
      const draftKnown = await readDraftVersion(botId);
      let target: number | null = null;
      if (prodKnown === null) {
        /* The feed is unreadable here (or empty: a bot with zero published
           versions has no publish/rollback item to read). Only the empty-feed
           case means "no production history" — and then, with no draft either,
           there is honestly nothing to roll back to; a draft head of v1 means
           the same. When the feed failed but a draft head exists, the legacy
           draft-minus-one is the only number on hand: it still 404s exactly
           when it is wrong, and the 404 branch below reports the server's
           answer honestly instead of the false "not saved yet" line. */
        if (draftKnown === null) {
          setRollbackNote({ text: 'Henüz geri dönebileceğin bir sürüm yok.' });
          return;
        }
        target = draftKnown > 1 ? draftKnown - 1 : null;
        if (target === null) {
          setRollbackNote({ text: 'Henüz geri dönebileceğin bir sürüm yok.' });
          return;
        }
      } else if (prodKnown <= 1) {
        setRollbackNote({ text: 'Henüz geri dönebileceğin bir sürüm yok.' });
        return;
      } else {
        target = prodKnown - 1;
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
        setRollbackNote({ text: `v${restored} sürümüne dönüldü.` });
        return;
      }
      if (response.status === 409) {
        setRollbackNote({ text: 'Taslağı biri değiştirdi — en son sürüm yükleniyor.' });
        const reloaded = await refreshDraft(botId);
        if (reloaded.status === 'loaded') {
          setRollbackNote({
            text: `v${reloaded.version} yüklendi — tekrar denemek için Geri al’a bas.`,
          });
        }
        return;
      }
      if (response.status === 404) {
        const publishedKnown =
          prodKnown ?? (draftKnown !== null && draftKnown > 1 ? draftKnown - 1 : null);
        setRollbackNote({
          text:
            publishedKnown === null
              ? 'Henüz geri dönebileceğin bir sürüm yok.'
              : 'Geri alınamadı — tekrar dene.',
        });
        return;
      }
      setRollbackNote({ text: 'Geri alınamadı — tekrar dene.' });
    } catch {
      setRollbackNote({ text: 'Geri alınamadı — bağlantını kontrol edip tekrar dene.' });
    } finally {
      setRollingBack(false);
    }
  }

  async function runOpen(): Promise<void> {
    if (bot === null || inviteLoading) return;
    const botId = bot.id;
    setInviteLoading(true);
    setInviteNote(null);
    try {
      const response = await fetch(`/api/invite?botId=${encodeURIComponent(botId)}`);
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
      setInviteNote({ text: 'Kurulum bağlantısı hazırlanamadı — tekrar dene.' });
    } catch {
      setInviteNote({
        text: 'Kurulum bağlantısı hazırlanamadı — bağlantını kontrol edip tekrar dene.',
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
        text: 'Sunucu ayarlarındaki sunucu kimliğini gir — 17-20 haneli sayı.',
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
        setScan({ status: 'error', text: notSavedYet('tarama çalıştırma') });
        return;
      }
      setScan({ status: 'error', text: 'Tarama başlatılamadı — tekrar dene.' });
    } catch {
      if (scanActive.current) {
        setScan({
          status: 'error',
          text: 'Tarama başlatılamadı — bağlantını kontrol edip tekrar dene.',
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
            typeof record.reason === 'string' && record.reason.length > 0
              ? record.reason
              : 'tetiklendi';
          list.push({ title, reason });
        });
        setFired(list);
        return;
      }
      if (response.status === 404) {
        setSimNote({
          text:
            payload.error === 'no draft yet'
              ? 'Bu bot için henüz taslak yok.'
              : notSavedYet('simülasyon çalıştırma'),
        });
        return;
      }
      setSimNote({ text: 'Simülasyon çalıştırılamadı — tekrar dene.' });
    } catch {
      setSimNote({ text: 'Simülasyon çalıştırılamadı — bağlantını kontrol edip tekrar dene.' });
    } finally {
      setSimulating(false);
    }
  }

  async function runSaveDraft(): Promise<void> {
    if (bot === null || savingDraft) return;
    const botId = bot.id;
    /* KI-036twin: the streamed thread is content too — stitch thread user
       turns plus the live composer text, exactly like the brief below. The
       composer-only empty return is preserved for the empty stitch. */
    const text = stitchBrief(messages, draft);
    if (text.length === 0) return;
    setSavingDraft(true);
    setPatchNote(null);
    try {
      /* DATA-LOSS GUARD: POST /api/spec/patch replaces the whole head, so the
         behaviors posted here ARE the new draft. When the mount load has not
         landed (404/500/aborted, or a save before it resolves) the local cache
         is empty — posting a note-only array would silently wipe a draft the
         server still holds, and this page has no history UI to recover it.
         So the base comes from what the read RETURNED (not the state it queued,
         which this closure cannot see), and only a DEFINITIVE 'no draft yet'
         read lets a save proceed with no base to append to. */
      const cached = draftBehaviors !== null && draftVersion !== null;
      let base = draftVersion;
      let existing = draftBehaviors;
      if (!cached) {
        const read = await refreshDraft(botId);
        if (read.status === 'unreadable') {
          setPatchNote({
            text: 'Mevcut taslak yüklenemedi — hiçbir şey kaydedilmedi. Tekrar dene.',
          });
          return;
        }
        if (read.status === 'absent') {
          /* The server has no draft to protect (its own 'no draft yet' /
             'not found'), so there is no head to append to and no head to
             overwrite. */
          setPatchNote({
            text:
              read.error === 'no draft yet'
                ? 'Bu bot için henüz taslak yok.'
                : notSavedYet('kaydetme'),
          });
          return;
        }
        base = read.version;
        existing = read.behaviors;
      }
      if (base === null || existing === null) {
        setPatchNote({
          text: 'Mevcut taslak yüklenemedi — hiçbir şey kaydedilmedi. Tekrar dene.',
        });
        return;
      }
      const behaviors = [...existing, { kind: 'note', title: 'Note', detail: text }];
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
        setPatchNote({ text: `Taslak olarak kaydedildi: v${payload.version}.` });
        return;
      }
      if (response.status === 409) {
        setPatchNote({ text: 'Taslağı biri değiştirdi — en son sürüm yükleniyor.' });
        const reloaded = await refreshDraft(botId);
        /* Only claim the reload when it actually happened: a 409 means the
           server holds a head, so anything but 'loaded' is an unread state and
           the honest line above stands. */
        if (reloaded.status === 'loaded') {
          setPatchNote({
            text: 'En son sürüm yüklendi — tekrar denemek için Taslak olarak kaydet’e bas.',
          });
        }
        return;
      }
      if (response.status === 404) {
        setPatchNote({
          text:
            payload.error === 'no draft yet'
              ? 'Bu bot için henüz taslak yok.'
              : notSavedYet('kaydetme'),
        });
        return;
      }
      setPatchNote({ text: 'Kaydedilemedi — tekrar dene.' });
    } catch {
      setPatchNote({ text: 'Kaydedilemedi — bağlantını kontrol edip tekrar dene.' });
    } finally {
      setSavingDraft(false);
    }
  }

  /* Start a real builder run for this bot, from the stitched thread plus the
     text in the composer, then show live progress inline. A local-only bot
     has no server id, so no run can start — that is said plainly, never
     faked. */
  async function runStartBuild(): Promise<void> {
    if (bot === null || startingBuild) return;
    /* KI-036twin: brief is the stitched thread + composer, never the composer
       alone — refined conversation reaches the builder. Guards and ALL
       user-facing copy below are verbatim. */
    const brief = stitchBrief(messages, draft);
    if (brief.length === 0) {
      setBuildNote({ text: 'İstediğin değişikliği anlat, sonra kurulumu başlat.' });
      return;
    }
    if (brief.length > 2000) {
      setBuildNote({ text: 'Kurulum için bu çok uzun — 2000 karakterin altında tut.' });
      return;
    }
    if (writeBotId === null) {
      setBuildNote({ text: notSavedYet('kurulum başlatma') });
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
        setBuildNote({ text: notSavedYet('kurulum başlatma') });
        return;
      }
      /* KI-033: a refused start says what the server said — the trial gate's
         locked sentence, byte for byte — instead of swallowing it behind the
         generic line. Unknown errors keep the generic line. */
      setBuildNote({
        text:
          readRefusalMessage(payload, { allowErrorFallback: false }) ??
          'Kurulum başlatılamadı — tekrar dene.',
      });
    } catch {
      setBuildNote({ text: 'Kurulum başlatılamadı — bağlantını kontrol edip tekrar dene.' });
    } finally {
      setStartingBuild(false);
    }
  }

  const composer = (
    <>
      <div role="group" aria-label="Önerilen değişiklikler" className={threadStyles.suggestionRow}>
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
        placeholder="İstediğin değişikliği anlat…"
        value={draft}
        onChange={setDraft}
        onSubmit={(value, meta) => submit(value, meta.attachments)}
      />
      {/* Honest cost line, same wording as `/dashboard/new`: a change spends
          credits and the amount follows what the change actually costs to
          build — the old "about 1.1" read as a fixed price no run can promise. */}
      <p className={threadStyles.composerCost}>
        Her değişiklik kredi harcar · platform kaynaklı hata olursa tekrar denemek ücretsiz.
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
              ← Tüm botlar
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
              ← Tüm botlar
            </a>
            <div className={styles.empty}>
              <p className={styles.emptyText}>{LOGGED_OUT_LINE}</p>
              <div className={styles.actionRow}>
                <a href={LOGIN_HREF} className={styles.ghostAction}>
                  Giriş yap
                </a>
                <button
                  type="button"
                  className={styles.ghostAction}
                  onClick={() => setLookupNonce((nonce) => nonce + 1)}
                >
                  Tekrar dene
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
            ← Tüm botlar
          </a>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Bu adreste bir bot yok — silinmiş olabilir.</p>
            <a href="/dashboard/bots" className={styles.ghostAction}>
              Botlarına dön
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
            ← Tüm botlar
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
                Aç
              </button>
              {/* D-118 kept the panel interview reachable from this header, but
                  /interview starts a NEW round with the bot name typed in; it
                  cannot resume an existing bot's interview (no botId param, no
                  read-back of answered questions). An enabled button that goes
                  nowhere is not allowed, so it is honestly disabled with the
                  same marker the Upgrade control uses. */}
              <button
                type="button"
                className={styles.ghostAction}
                disabled
                aria-disabled="true"
                title="Yakında"
              >
                Görüşmeyi sürdür · Yakında
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => void runPublish()}
                disabled={publishing}
              >
                Sürümü kaydet
              </button>
              <button
                type="button"
                className={styles.textAction}
                onClick={() => void runRollback()}
                disabled={rollingBack}
              >
                Geri al
              </button>
              <a
                className={styles.ghostAction}
                href={`/dashboard/bots/${encodeURIComponent(bot.id)}/token`}
              >
                Bot jetonu
              </a>
            </div>
            {inviteLoading ||
            inviteUrl !== null ||
            inviteNote !== null ||
            publishNote !== null ||
            rollbackNote !== null ? (
              <div>
                {inviteLoading ? (
                  <p role="status" className={styles.todaySentence}>
                    davet hazırlanıyor…
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
                      Kurulum bağlantısını aç (ortak test uygulaması — kendi botunun kurulumu henüz
                      bağlı değil)
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
          <div role="tablist" aria-label="Bot detayı" className={styles.detailTabs}>
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
              <section aria-label="Bu bot ne yapıyor" className={styles.card}>
                <h2 className={styles.cardTitle}>Bu bot ne yapıyor</h2>
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
                    Henüz açıklama yok — kaydedilen taslak burada anlatacak.
                  </p>
                )}
              </section>
            ) : null}
            {detailTab === 'activity' ? (
              <section aria-label="Son etkinlik" className={styles.card}>
                <div className={styles.panelHead}>
                  <h2 className={styles.cardTitle}>Son etkinlik</h2>
                </div>
                {activity.status === 'loading' ? (
                  <p className={styles.todaySentence}>Etkinlik yükleniyor…</p>
                ) : activity.status === 'live' ? (
                  <ul className={styles.activityList}>
                    {activity.items.map((item, index) => (
                      <li key={`${item.at}-${index}`} className={styles.activityRow}>
                        <span className={styles.activityText}>
                          <span className={styles.activityKind}>{item.kind}</span>
                          {item.text}
                        </span>
                        <span className={styles.activityTime}>
                          {item.credits !== undefined ? `${item.credits} kredi · ` : ''}
                          {formatActivityTime(item.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : activity.status === 'empty' ? (
                  <p className={styles.todaySentence}>Henüz etkinlik yok.</p>
                ) : (
                  <p className={styles.todaySentence}>
                    Etkinlik yüklenemedi — bağlantını kontrol edip tekrar dene.
                  </p>
                )}
              </section>
            ) : null}
            {detailTab === 'preflight' ? (
              <section aria-label="Ön kontrol" className={styles.card}>
                <div className={styles.panelHead}>
                  <h2 className={styles.cardTitle}>Ön kontrol</h2>
                </div>
                {scan.status === 'live' ? (
                  <>
                    {scan.summary !== null ? (
                      <p className={styles.todaySentence}>{scan.summary}</p>
                    ) : null}
                    <ul className={styles.activityList}>
                      {scan.rows.map((row, index) =>
                        row.tone === 'red' ? (
                          <li key={`scan-row-${index}`} className={styles.preflightRow}>
                            <ErrorCard
                              title={scanRowTitle(row)}
                              whatHappened={row.text}
                              fix={row.fix}
                              onRetry={() => void runScan()}
                            />
                          </li>
                        ) : (
                          <li key={`scan-row-${index}`} className={styles.preflightRow}>
                            <span
                              aria-hidden="true"
                              className={`${styles.preDot} ${row.tone === 'green' ? styles.prePass : styles.preWarn}`}
                            />
                            <span>
                              {row.text}
                              {row.tone === 'yellow' && row.fix !== null ? (
                                <>
                                  <br />
                                  <span>{row.fix}</span>
                                </>
                              ) : null}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  </>
                ) : scan.status === 'idle' ? (
                  <p className={styles.todaySentence}>
                    Henüz tarama yok — bir sunucu kimliği gir ve tarama çalıştır.
                  </p>
                ) : null}
                <div className={styles.actionRow}>
                  <Input
                    id="preflight-guild"
                    label="Sunucu kimliği"
                    placeholder="Sunucu kimliği"
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
                    Taramayı çalıştır
                  </button>
                </div>
                {scan.status === 'scanning' ? (
                  <p role="status" className={styles.todaySentence}>
                    Taranıyor…
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
            <ul aria-label="Gönderilen değişiklikler" className={styles.activityList}>
              {messages.map((message) =>
                message.role === 'user' ? (
                  <li key={message.id} className={styles.activityRow}>
                    <span className={styles.activityText}>Sen: {message.text}</span>
                    {message.attachmentCount > 0 ? (
                      <span className={styles.activityTime}>
                        {message.attachmentCount} ek dosya
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
              Katılımı simüle et
            </button>
            {/* KI-036twin: a full thread with an empty composer can still save
                and build — the streamed user turns count, not just the box. */}
            <button
              type="button"
              className={styles.ghostAction}
              onClick={() => void runSaveDraft()}
              disabled={savingDraft || stitchBrief(messages, draft).length === 0}
            >
              Taslak olarak kaydet
            </button>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => void runStartBuild()}
              disabled={startingBuild || stitchBrief(messages, draft).length === 0}
            >
              {startingBuild ? 'Başlatılıyor…' : 'Kurulumu başlat'}
            </button>
          </div>
          {fired !== null ? (
            fired.length > 0 ? (
              <ul aria-label="Simülasyon sonucu" className={styles.activityList}>
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
                Yeni bir üye katıldığında tetiklenecek taslak kaydı yok.
              </p>
            )
          ) : null}
          {simNote !== null ? <ActionNoteLine note={simNote} /> : null}
          {patchNote !== null ? <ActionNoteLine note={patchNote} /> : null}
          {buildNote !== null ? <ActionNoteLine note={buildNote} /> : null}
          {startedRunId !== null ? (
            /* KI-036twin: a started build shows the EXISTING server-polled
               stepper inline — the same shape as the creation page — next to
               the kept ?runId= link. No new timers, no faked phases. */
            <section aria-label="Kurulum ilerlemesi">
              <BuilderProgress runId={startedRunId} />
              <p role="status" className={styles.todaySentence}>
                Kurulum başladı.{' '}
                <a href={`/dashboard?runId=${encodeURIComponent(startedRunId)}`}>
                  Kurulum ilerlemesini aç
                </a>
              </p>
            </section>
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
