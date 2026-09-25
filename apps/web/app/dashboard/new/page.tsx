'use client';

/* New-bot chat page (D-118 + KI-027 + verdict auto-start): ChatGPT-style
   thread streaming via the shared hook. Composer stays locked open; chips
   only fill it. Refresh starts a fresh thread by construction.
   Turkish UI: every string THIS PAGE owns is Turkish — the owner writes
   Turkish, so an English control word on the page is a dead end for them.
   Shared components (composer, thread rows, progress steps) still carry
   their own English labels; they serve the bot-detail page too, so their
   copy is not this task's to change.
   KI-027: mint-on-first-submit — the first submit fires POST /api/bots once
   (derived name) without blocking the chat turn (first turn streams with the
   current null id); the minted id is committed to state once no stream is in
   flight and passed to useChatStream, so turn two carries it.
   Verdict auto-start (founder-locked 2026-09-22): no Build button, no
   word-list matcher. When the newest judged user reply immediately follows
   the plan ask line, the page POSTs { botId, turns } to
   /api/builder/verdict exactly once. A `yes` with a runId renders the
   EXISTING BuilderProgress inline plus the ?runId= link. `no`/`unclear` and
   409 are no longer silent: each renders its own short Turkish line, so a
   refused start is never something the person has to guess at. */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PromptInput } from '@/components/ui/ai-chat-input';
import { BuilderProgress, useBuilderProgress } from '@/components/ui/builder-progress';
import { ChatAssistantRow } from '@/components/ui/chat-thread';
import { useChatStream } from '@/components/ui/use-chat-stream';
import threadStyles from '@/components/ui/chat-thread.module.css';
import {
  PLAN_TAIL_MAX as VERDICT_TURN_TAIL_MAX,
  TURN_MAX as VERDICT_TURN_MAX,
  TURNS_MAX as VERDICT_TURNS_MAX,
  boundedView as boundedTurn,
  readRefusalMessage,
} from '@/lib/verdict/bounds';
import styles from './page.module.css';

/* Starter prompts — a click fills the composer; the composer is the only
   place a change is sent from. */
const SUGGESTIONS = ['Karşılama mesajı', 'Moderasyon kuralı', 'XP ödülleri'];

const MINT_FALLBACK_ERROR = 'Botun kaydedilemedi. Sohbetin duruyor — tekrar dene.';
const START_FALLBACK_ERROR = 'Kurulum başlatılamadı. Tekrar dene.';

/* The server refused the verdict with 409 no_plan_asked: the last assistant
   turn it read did not carry the ask line it matches (the route knows the
   English line; a Turkish plan it cannot read comes back this way). The route
   ships that sentence as `message` and the page prefers it, like every other
   refusal here; this constant is the honest fallback for the older code-only
   409 body, byte-identical to the route's own (NO_PLAN_MESSAGE) on purpose.
   Either way the refusal is said out loud instead of swallowed. The remedy is
   real: asking the assistant for the plan again posts it with the locked
   English ask line, and the next short "evet" passes both gates. */
const PLAN_MISSING_MESSAGE =
  'Kurulum başlamadı — plan mesajı okunamadı. Asistandan planı yeniden iste, sonra kısaca “evet” yaz.';

/* The judge answered `no`/`unclear`, so nothing started. Silence here looked
   like a dead control: the person had just replied and could not tell whether
   anything happened. The line keeps the decision with them — approve, or say
   what to change. */
const VERDICT_HINT =
  'Kurulum için onay gerekiyor — kısaca “evet” yaz ya da değiştirmek istediğin yeri yaz.';

/* The plan ask lines the assistant can end a plan with: the English line the
   persona prompt locks verbatim (`Can I start? Reply yes to build.`), plus the
   Turkish forms it uses when it answers in the owner's language — a Turkish
   plan the owner can plainly read used to close this path, because only the
   English line was recognized and nothing told them why. Matching is
   diacritic-folded, so the model's `Başlayayım mı?` and a keyboard's
   `Baslayayim mi?` match the same question. */
const ASK_LINES = ['Can I start?', 'Başlayayım mı?', 'Başlayalım mı?'];

/* Turkish letters folded to their ASCII twins (lowercased first): 'İ' arrives
   from toLowerCase() as 'i' plus a combining dot, so that dot is dropped too. */
const TURKISH_FOLD: Record<string, string> = {
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ç: 'c',
  ö: 'o',
  ü: 'u',
  â: 'a',
  î: 'i',
};

function foldTurkish(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u0307/g, '')
    .replace(/[ışğçöüâî]/g, (letter) => TURKISH_FOLD[letter] ?? letter);
}

/* True when an assistant turn carries any locked ask line. */
function isPlanAsk(text: string): boolean {
  const folded = foldTurkish(text);
  return ASK_LINES.some((line) => folded.includes(foldTurkish(line)));
}

/* Verdict turns tail: last VERDICT_TURNS_MAX rows mapped to role/content, each
   text capped via the shared kept-ends view (boundedTurn from
   lib/verdict/bounds.ts — text that already fits travels untouched, otherwise
   the middle is dropped behind the same marker the route writes, exactly `max`
   chars; a head-only slice silently drops exactly what the route's ask-line
   gate is about — the plan turn ENDS with the ask line — so a long plan used
   to reach the route ask-line-less and come back 409 with nothing shown).
   Sent ending at the judged user row — trailing post-yes assistant replies are
   excluded so the server's last-assistant ask-line check sees the plan, not
   the ack. Bounds live in lib/verdict/bounds.ts (single source of truth);
   the only page-local names are the ask lines. */

function deriveBotName(text: string): string {
  return text.trim().slice(0, 32).trim() || 'Adsız bot';
}

export default function NewBotPage() {
  return (
    <Suspense>
      <NewBotPageInner />
    </Suspense>
  );
}

function NewBotPageInner() {
  const [brief, setBrief] = useState('');
  /* Template-in-chat (E3 — gallery truth): ?template=<slug> seeds the
     composer with a template-derived brief starter — a static fill like the
     chips below (no model call, no verdict/min-trial gate touch). The fetch
     reads the EXISTING GET /api/templates/<slug>; malformed or failed slugs
     leave the composer empty (honest, never invented text).

     NO once-guard here, deliberately. The effect is double-invoked on a page
     load (React Strict Mode is on by default in the App Router), and the first
     invocation is torn down: its cleanup flips `active` to false, so its
     response can never land. A `useRef` once-guard set on that dead run made
     the surviving run bail — measured in the running app: with the guard, the
     fetch fired exactly once and the composer stayed empty for every
     ?template= load; without it, the fetch fires twice and the draft fills.
     The unit test stayed green because its module-level `useSearchParams` mock
     never re-invokes. Re-running is safe: the fetch is idempotent and `setBrief`
     refuses to overwrite a non-empty draft (a person typing mid-fetch wins). */
  const params = useSearchParams();
  const templateSlug = params === null ? null : params.get('template');
  useEffect(() => {
    if (templateSlug === null || templateSlug.trim() === '') return;
    if (!/^[a-z0-9-]{1,64}$/.test(templateSlug)) return;
    let active = true;
    fetch(`/api/templates/${encodeURIComponent(templateSlug)}`)
      .then(async (response) => {
        if (!active || !response.ok) return;
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          return;
        }
        if (!active) return;
        if (typeof payload !== 'object' || payload === null) return;
        const row = payload as Record<string, unknown>;
        if (typeof row.name !== 'string') return;
        const capabilities = Array.isArray(row.capabilities)
          ? row.capabilities.filter((entry): entry is string => typeof entry === 'string')
          : [];
        const starter =
          capabilities.length > 0
            ? `${row.name} gibi bir bot kur: ${capabilities.join(', ')}`
            : `${row.name} gibi bir bot kur`;
        setBrief((current) => (current === '' ? starter : current));
      })
      .catch(() => {
        /* offline template read: composer stays empty, chat works as before */
      });
    return () => {
      active = false;
    };
  }, [templateSlug]);
  const composerRef = useRef<HTMLDivElement>(null);
  /* Draft bot id: null until the first-submit mint lands. The chat hook reads
     the latest id per render through its own ref, so passing state is enough
     — no hook change. */
  const [botId, setBotId] = useState<string | null>(null);
  /* Minted id waiting for a quiet moment: the hook aborts the in-flight
     stream when its botId arg changes, so the id is committed only once no
     stream is open. Observable behavior is identical (first turn uses null,
     second turn carries the id) without dropping the first reply. */
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  /* The judge looked at the reply and did not accept it (`no`/`unclear`), so
     the build did not start. Kept apart from buildError on purpose: nothing
     failed, the decision is still the person's — the line below says how to
     give it. */
  const [verdictHint, setVerdictHint] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  /* Exactly-once mint guard (synchronous ref: a second submit while the first
     mint is still in flight must not re-mint). The mint name still derives
     from the first user message (via mintOnce) — that part is unchanged. */
  const mintAttemptedRef = useRef(false);
  /* Verdict once-guards: buildingRef is the synchronous StrictMode-safe lock
     (set before the async fetch so a double-invoked effect posts once);
     judgedUserIdRef pins the user row already judged so re-renders and later
     streams never re-post for the same reply. A new user reply gets a new id
     and may judge again. */
  const buildingRef = useRef(false);
  const judgedUserIdRef = useRef<string | null>(null);
  /* M-8: id of the user row whose verdict POST died in transport. The judged
     pin is cleared on failure so later turns can judge, but this marker stops
     the settling effect from re-posting for the same row in a loop. */
  const verdictFailedUserIdRef = useRef<string | null>(null);
  /* M-9: runId whose page-owned build poll reached terminal `failed`. The
     verdict effect treats exactly this run as no-run — a later eligible yes
     posts a FRESH verdict and a fresh run starts — while every other non-null
     runId still blocks. runId itself stays set so the honest "Build failed"
     readout keeps rendering. */
  const runFailedRunIdRef = useRef<string | null>(null);
  const { messages, streaming, submit, retry } = useChatStream(botId);
  /* Page-owned poll of the live run: feeds ONLY the M-9 latch reset below.
     The BuilderProgress display runs its own poll; both stop at terminal. */
  const buildPhase = useBuilderProgress(runId).phase;

  useEffect(() => {
    if (!streaming && pendingBotId !== null && botId === null) {
      setBotId(pendingBotId);
      setPendingBotId(null);
    }
  }, [streaming, pendingBotId, botId]);

  /* Model-verdict auto-start: when the latest user reply immediately follows
     the plan ask line, and the bot is saved, and no run exists yet, and no
     stream or verdict is in flight — POST { botId, turns } to
     /api/builder/verdict exactly once. `yes` + runId shows progress; `no` and
     `unclear` render the Turkish re-ask hint, 409 renders its own Turkish
     line; gate bodies surface verbatim; only a transport throw uses the honest
     fallback. M-9 latch below: when the
     page-owned poll of the live run reaches terminal `failed`, that runId is
     marked failed so a LATER eligible yes turn may post a fresh verdict and
     start a fresh run — the same failed row never re-posts (the judged pin is
     left intact as the loop guard, same class as M-8's marker; only a NEW
     eligible user row may post). */
  /* M-9 follow-up: the page-owned poll keeps its last phase across a runId
     change, so the runId under watch is tracked beside the marker. A fresh
     runId clears any marker carried from the previous run, and the stale
     phase still showing the old run's terminal state is ignored — only a
     `failed` observed while watching THIS runId marks it. */
  const latchRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (runId === null) {
      runFailedRunIdRef.current = null;
      latchRunIdRef.current = null;
      return;
    }
    if (latchRunIdRef.current !== runId) {
      latchRunIdRef.current = runId;
      runFailedRunIdRef.current = null;
      return;
    }
    if (buildPhase === 'failed') {
      runFailedRunIdRef.current = runId;
    }
  }, [runId, buildPhase]);

  useEffect(() => {
    if (streaming || building || buildingRef.current) return;
    if (runId !== null && runFailedRunIdRef.current !== runId) return;
    if (messages.length === 0) return;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUser = messages[lastUserIdx];
    if (judgedUserIdRef.current === lastUser.id) return;
    if (verdictFailedUserIdRef.current === lastUser.id) return;
    const prev = messages[lastUserIdx - 1];
    if (!prev || prev.role !== 'assistant' || !isPlanAsk(prev.text)) return;
    if (botId === null) return;
    buildingRef.current = true;
    judgedUserIdRef.current = lastUser.id;
    setBuilding(true);
    setBuildError(null);
    setVerdictHint(null);
    const turns = messages
      .slice(0, lastUserIdx + 1)
      .slice(-VERDICT_TURNS_MAX)
      .filter((row) => row.text.trim() !== '')
      .map((row) => ({
        role: row.role,
        content: boundedTurn(row.text, VERDICT_TURN_MAX, VERDICT_TURN_TAIL_MAX),
      }));
    fetch('/api/builder/verdict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botId, turns }),
    })
      .then(async (response) => {
        if (response.status === 409) {
          /* No plan was asked as far as the server could read. Only `message`
             is read here — never the shared reader: its `error` fallback would
             hand the raw code no_plan_asked to the screen for the older
             code-only body. The route's sentence wins when present; otherwise
             the page's own byte-identical sentence stands in. Swallowing this
             was the defect — a Turkish plan the route's English ask-line gate
             cannot read refused the start with nothing on screen at all. */
          let message = PLAN_MISSING_MESSAGE;
          try {
            const data = (await response.json()) as { message?: unknown };
            if (typeof data.message === 'string' && data.message.trim() !== '') {
              message = data.message;
            }
          } catch {
            /* keep the honest fallback */
          }
          setBuildError(message);
          return;
        }
        if (!response.ok) {
          let message = START_FALLBACK_ERROR;
          try {
            const data = (await response.json()) as unknown;
            message = readRefusalMessage(data) ?? START_FALLBACK_ERROR;
          } catch {
            /* keep the honest fallback */
          }
          setBuildError(message);
          return;
        }
        let data: { verdict?: unknown; runId?: unknown; started?: unknown };
        try {
          data = (await response.json()) as {
            verdict?: unknown;
            runId?: unknown;
            started?: unknown;
          };
        } catch {
          setBuildError(START_FALLBACK_ERROR);
          return;
        }
        if (data.verdict === 'yes' && typeof data.runId === 'string' && data.runId.length > 0) {
          setRunId(data.runId);
        } else {
          /* `no` / `unclear` / { started: false }: nothing was started, so the
             page says so instead of leaving the reply looking ignored. */
          setVerdictHint(VERDICT_HINT);
        }
      })
      .catch(() => {
        setBuildError(START_FALLBACK_ERROR);
        /* M-8: a transport failure must not pin the judged row. The pin is set
           before the POST, so without this reset the still-eligible turn could
           never post again and "Try again" would describe an impossible remedy.
           Clearing re-arms the same ask-line row for a fresh POST once the
           user sends the next turn; the failure marker holds this same row so
           settling alone does not re-post in a loop. */
        judgedUserIdRef.current = null;
        verdictFailedUserIdRef.current = lastUser.id;
      })
      .finally(() => {
        buildingRef.current = false;
        setBuilding(false);
      });
  }, [messages, streaming, building, runId, botId]);

  function mintOnce(text: string) {
    const botName = deriveBotName(text);
    /* Retry affordance (M-7): a previous failure cleared the once-guard, so a
       later submit re-enters here — drop the stale error optimistically; a new
       failure re-sets it below. */
    setMintError(null);
    fetch('/api/bots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botName }),
    })
      .then(async (response) => {
        if (!response.ok) {
          let message = MINT_FALLBACK_ERROR;
          try {
            const data = (await response.json()) as unknown;
            message = readRefusalMessage(data) ?? MINT_FALLBACK_ERROR;
          } catch {
            /* keep the honest fallback */
          }
          setMintError(message);
          /* Failed mint must not latch the once-guard: the next submit retries. */
          mintAttemptedRef.current = false;
          return;
        }
        try {
          const data = (await response.json()) as { botId?: unknown };
          if (typeof data.botId === 'string' && data.botId.length > 0) {
            setPendingBotId(data.botId);
          } else {
            setMintError(MINT_FALLBACK_ERROR);
            mintAttemptedRef.current = false;
          }
        } catch {
          setMintError(MINT_FALLBACK_ERROR);
          mintAttemptedRef.current = false;
        }
      })
      .catch(() => {
        setMintError(MINT_FALLBACK_ERROR);
        mintAttemptedRef.current = false;
      });
  }

  /* First submit mints (fire-and-forget beside the chat turn); every submit —
     including the first — streams exactly as before. */
  function handleSubmit(value: string, attachments: File[]) {
    const text = value.trim();
    if (text === '') return;
    /* The reply supersedes the previous verdict's hint: the person acted on it,
       so it must not sit next to the turn they just sent. */
    setVerdictHint(null);
    if (!mintAttemptedRef.current) {
      mintAttemptedRef.current = true;
      mintOnce(text);
    }
    submit(value, attachments);
  }

  /* Mint race: the plan adjacency holds but the bot id has not landed yet —
     show the saving line and queue no POST. Derived (not state) so it clears
     the moment the id commits. */
  let showSaving = false;
  if (botId === null && runId === null && !building && !streaming && messages.length > 0) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        const before = messages[i - 1];
        if (
          before &&
          before.role === 'assistant' &&
          isPlanAsk(before.text) &&
          judgedUserIdRef.current !== messages[i].id
        ) {
          showSaving = true;
        }
        break;
      }
    }
  }

  /* A chip only fills the composer — it never sends. */
  function applySuggestion(text: string) {
    setBrief(text);
    composerRef.current?.querySelector('textarea')?.focus();
  }

  return (
    <>
      <div className={styles.newTop}>
        <a href="/dashboard/bots" className={styles.backLink}>
          ← Tüm botlar
        </a>
      </div>
      {/* Layout provides shell + main landmark; this page owns scroll + composer. */}
      <div className={styles.newScroll}>
        <div className={styles.newInner}>
          <section aria-label="Yeni botunu anlat" className={styles.hero}>
            <h1 className={styles.heroTitle}>Botun bugün ne yapacak?</h1>
            {messages.length === 0 ? (
              <p className={styles.heroSub}>
                Sade bir dille anlat — taslağı biz yazarız, sen denersin, sonra bir sürüm
                kaydedersin. Discord’da canlıya almak henüz bağlı değil.
              </p>
            ) : null}
          </section>
          {messages.length > 0 ? (
            <ul aria-label="Yeni bot konuşması" className={styles.newThread}>
              {messages.map((message) =>
                message.role === 'user' ? (
                  <li key={message.id} className={styles.newUserRow}>
                    <span className={styles.newUserBubble}>{message.text}</span>
                  </li>
                ) : (
                  <ChatAssistantRow key={message.id} message={message} onRetry={retry} />
                ),
              )}
            </ul>
          ) : null}
          <div>
            <p>
              Anlat, 2-3 soruya cevap ver ve plan doğru görününce “evet” yaz — kurulumu asistan
              kendisi başlatır.
            </p>
            <p>Başarısız bir kurulumdan sonra “evet” yazarsan temiz bir kurulum başlar.</p>
            {showSaving ? <p>Botun kaydediliyor…</p> : null}
            {mintError !== null ? <p role="alert">{mintError}</p> : null}
            {buildError !== null ? <p role="alert">{buildError}</p> : null}
            {verdictHint !== null ? <p role="status">{verdictHint}</p> : null}
            {runId !== null ? (
              <section aria-label="Kurulum ilerlemesi">
                <p role="status">Kurulum başladı — ilerlemeyi aşağıda takip edebilirsin.</p>
                <BuilderProgress runId={runId} />
                <a href={`/dashboard?runId=${runId}`}>Kurulum ilerlemesini aç</a>
              </section>
            ) : null}
          </div>
        </div>
      </div>
      <div className={styles.newAiBar}>
        <div className={styles.newAiInner}>
          {/* Composer-type-but-not-send: the box is never inert, dimmed, or
              pointer-killed — while a reply streams the textarea stays
              editable and only sending is gated (disabled send button +
              blocked Enter inside PromptInput via sendDisabled). The hook's
              streaming ref-guard stays the backstop against a second submit.
              threadStyles.composerNoRing kills every focus/selection ring on
              this composer only (explicit founder order — see the CSS rule);
              the box's focus-within border shift is the sole focus signal. */}
          <div className={threadStyles.composerNoRing}>
            <div
              role="group"
              aria-label="Önerilen değişiklikler"
              className={`${threadStyles.suggestionRow} ${styles.heroSuggestions}`}
            >
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
              placeholder="İstediğin botu anlat…"
              value={brief}
              onChange={setBrief}
              onSubmit={(value, meta) => handleSubmit(value, meta.attachments)}
              forceExpanded
              sendDisabled={streaming}
            />
            {/* Honest cost line: a change spends credits, and the amount follows
                what the change actually costs to build — the old "about 1.1"
                read as a fixed price no run can promise. */}
            <p className={`${threadStyles.composerCost} ${styles.heroCost}`}>
              Her değişiklik kredi harcar · platform kaynaklı hata olursa tekrar denemek ücretsiz.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
