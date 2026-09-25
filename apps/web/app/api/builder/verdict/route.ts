// POST /api/builder/verdict — model-judged plan acceptance + model-written brief.
//
// Founder-locked 2026-09-22: the MODEL decides from the conversation whether
// the user accepted the plan, and the MODEL writes the builder brief from the
// thread. A bare "yes"/"ok" alone NEVER starts anything (the verdict prompt
// owns that distinction, not a word list).
//
// Gate order mirrors builder/start: session 401 (fail-closed) → KI-033
// trial-clock 403 BEFORE body → 422 botId uuid + turns shape → 404 ownership
// (same bots query incl. soft-deleted exclusion) → KI-033 monthly-allowance
// 403 (with the other pre-model gates, mirroring app/api/chat/route.ts) → the
// posted turns must carry at least one assistant turn, the plan offer itself,
// else 409 no_plan_asked → ONE
// persona-lane call with buildVerdictPrompt (strict JSON; garbage = unclear,
// never throws) → on `yes` a SECOND persona-lane call with buildBriefPrompt →
// clamp brief 1..2000 → INSERT builder_runs + pg-boss send IDENTICAL to
// builder/start. On `no`/`unclear`: 200 { verdict, started:false } with NO row
// and NO job.
//
// The plan trigger is POSITION, never wording (founder lock 2026-09-25, option
// 1): the last assistant turn in the posted tail IS the plan offer, so no
// string a person or a model writes can gate the start. The wording gate this
// route used to carry refused every paraphrase approval — "baslat", "yap",
// "sen karar ver", "you decide" — and the plan re-rendered forever, because an
// approval the accept-line matcher did not recognize never reached the judge at
// all. What starts a build now is the model's own verdict object below, never a
// word list; the 409 fires only when NO assistant turn was posted, which is the
// one case where no plan was ever offered for anyone to accept.
//
// Every refusal keeps its machine `error` code and carries the Turkish
// `message` the owner reads (see the copy block below); the two KI-033 403
// sentences stay byte-locked with the chat and builder/start routes.
//
// Both model calls are metered as persona-run spend (the chat spend shape;
// ledger failures are swallowed so billing can never break the verdict) and
// both are pre-authorized against the account's monthly grant by the same
// checkBudget guard the chat route and the builder worker use — a refused
// request makes NO model call and writes NO spend row. No new billing path, no
// gate reorder; the lane owns keys.
//
// Thread source: the repo's only server-side thread-ish store is
// interview_progress, which holds interview question/answer pairs — not chat
// turns — so it can never supply the plan turn this route judges. The client
// therefore sends a bounded turns tail (12 turns, each up to the SAME 2000-char
// per-turn bound POST /api/chat accepts for history), so a plan the chat route
// will happily store can never be refused here for length alone.
// interview_progress is never read here.

import { NextResponse } from 'next/server';
import { PgBoss } from 'pg-boss';
import type { SendOptions } from 'pg-boss';
import {
  buildBriefPrompt,
  buildVerdictPrompt,
  chat,
  checkBudget,
  isPlanTier,
  recordSpend,
  toCredits,
  type OwnerLanguage,
} from '@corvus/ai';
import {
  DatabaseNotConfiguredError,
  getPool,
  mapDbError,
  requireDatabaseUrl,
} from '../../../../lib/db/pool';
import {
  defaultSessionReader,
  type InterviewSession,
} from '../../../../lib/interview/session-bind';
import { isTrialExpired } from '../../../../lib/auth/session';
import { isPaidTier } from '../../../../lib/bots';
import {
  BRIEF_MAX,
  PLAN_MAX,
  PLAN_TAIL_MAX,
  REPLY_MAX,
  REPLY_TAIL_MAX,
  THREAD_MAX,
  THREAD_TAIL_MAX,
  TURN_MAX,
  TURNS_MAX,
  boundedView,
} from '../../../../lib/verdict/bounds';

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/chat/route.ts).
export { __setPool } from '../../../../lib/db/pool';

export const BUILDER_QUEUE = 'builder';

// Locked wording (KI-033 SPEC, byte-level): the same sentence the chat route,
// the builder/start route and the dashboard banner carry.
const TRIAL_ENDED_MESSAGE = 'Your 3-day trial ended — your bots are paused. Nothing is deleted.';

// Locked wording (KI-033 SPEC, byte-level): the SAME monthly-allowance refusal
// app/api/chat/route.ts writes, so one exhausted account reads one sentence
// wherever the refusal reaches it. Both branches are copies of the chat
// route's copy, byte for byte — a paraphrase here would be a second, drifting
// source of user-facing text.
const TRIAL_BUDGET_MESSAGE =
  'Your 3-day trial has used its 100 AI credits for this month. Nothing is deleted.';

// Same predicate the chat route bills with: a missing or unknown tier reads as
// trial — never as a paid bypass. True means "the trial's allowance applies".
function onTrial(tier: string | null | undefined): boolean {
  return !isPlanTier(tier) || tier === 'trial';
}

// The allowance gate is tier-aware, so its refusal has to be too: tier-blind
// copy would tell a paying account that its 3-day trial ran out, which is false
// about the one fact the person can see. The trial branch names the credit
// count the SPEC locks ("100 credits"); the paid branch takes the number the
// meter actually resolved rather than a remembered one.
function budgetRefusalMessage(tier: string | null | undefined, allowance: number): string {
  if (onTrial(tier)) {
    return TRIAL_BUDGET_MESSAGE;
  }
  return `This month's ${allowance} AI credits are used up. Nothing is deleted.`;
}

// --- The copy the person reads ----------------------------------------------
// Every refusal below keeps its machine `error` code byte-for-byte — clients,
// suites and the page's readRefusalMessage read those — and gains the Turkish
// `message` the owner actually reads: that shared reader prefers `message`, so
// a bare code ('bot not found', 'no_plan_asked') can no longer be what a
// Turkish-speaking owner sees on screen. Deliberately NOT re-worded here: the
// two KI-033 403 sentences above. They are byte-level locked with the chat and
// builder/start routes (one exhausted account reads one sentence wherever the
// refusal reaches it), so translating them is a cross-route copy wave, not a
// one-file edit. The 409 sentence below is the new-bot page's
// PLAN_MISSING_MESSAGE verbatim for the same reason: one situation, one text.
const UNAUTHORIZED_MESSAGE = 'Oturum bulunamadı — tekrar giriş yap.';
const INVALID_BOT_MESSAGE = 'Bot kimliği geçersiz — sayfayı yenileyip tekrar dene.';
const TURNS_MESSAGE = 'Sohbet geçmişi geçersiz — sayfayı yenileyip tekrar dene.';
const BOT_NOT_FOUND_MESSAGE = 'Bot bulunamadı — sayfayı yenileyip tekrar dene.';
const NO_PLAN_MESSAGE =
  'Kurulum başlamadı — plan mesajı okunamadı. Asistandan planı yeniden iste, sonra kısaca “evet” yaz.';
const EMPTY_BRIEF_MESSAGE = 'Kurulum metni boş çıktı — tekrar dene.';
const BOT_READ_FAILED_MESSAGE = 'Bot bilgisi okunamadı — sonra tekrar dene.';
const JUDGE_FAILED_MESSAGE = 'Yanıt değerlendirilemedi — sonra tekrar dene.';
const BRIEF_FAILED_MESSAGE = 'Kurulum metni yazılamadı — sonra tekrar dene.';
const START_FAILED_MESSAGE = 'Kurulum başlatılamadı — tekrar dene.';
const CREDITS_CHECK_MESSAGE = 'AI kredisi kontrol edilemedi — sonra tekrar dene.';
const DB_NOT_CONFIGURED_MESSAGE = 'Sunucu şu an veritabanına bağlanamıyor.';

// Turkish letters folded to their ASCII twins (lowercased first): 'İ' arrives
// from toLowerCase() as 'i' plus a combining dot, so that dot is dropped too.
// Whitespace runs collapse, so a line-broken or double-spaced message reads as
// the same text.
//
// Only the language detector below uses this map now. It used to be the mirror
// of the new-bot page's own copy, both feeding the ask-line gates, and the two
// had to stay in step or a plan could pass one and be refused by the other.
// Those gates are gone (founder lock 2026-09-25, option 1), so what is left is a
// local helper with one job: let a diacritic-free Turkish spelling — 'baslat'
// for 'başlat' — reach the same stem and word needles the accented spelling
// reaches. It is named for that job and not for the deleted gate's twin, so a
// reader grepping for the old gate finds nothing that is still load-bearing.
// The detection behavior itself is unchanged.
const FOLD_TO_ASCII: Record<string, string> = {
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
    .replace(/[ışğçöüâî]/g, (letter) => FOLD_TO_ASCII[letter] ?? letter)
    .replace(/\s+/g, ' ')
    .trim();
}

// --- The owner's language, derived route-side (F3 language plumbing) --------
// The judge and the brief prompts each take an optional `language` and append
// their Turkish guidance only for 'turkish'. Every caller used to omit it, so
// the guidance was unreachable and a Turkish thread was judged by English
// rules. There is no locale anywhere upstream to read instead: the POST body is
// `{ botId, turns }` only, no locale cookie reaches this route, and no language
// column exists — so the turn text itself is the only honest signal, and it is
// derived here rather than sent by the client (no request/response shape
// change).
//
// The shape is lib/demo/brain.ts's detector (strong signal: a Turkish-specific
// letter or a Turkish stem; weak signal: two or more short Turkish words), with
// the stems folded through this route's own FOLD_TO_ASCII so a diacritic-free
// spelling lands on the same needle. It is deliberately conservative: an
// ASCII-only English thread must resolve to 'english', because the guidance
// lands between the `Reply:` and `Answer with EXACTLY` markers the reply-view
// pins slice on. A thread that carries Turkish in EITHER the plan turn or the
// reply reads as Turkish — the guidance names both, and the failure we are
// closing is a Turkish owner judged by English rules.
const TURKISH_LETTERS = /[çğışöüÇĞİŞÖÜ]/;

// Stems, matched as substrings so Turkish suffixes ride along. ASCII because
// the input is folded first (see foldTurkish), so 'şablon' matches 'sablon'.
const TURKISH_STEMS = [
  'merhaba',
  'selam',
  'fiyat',
  'ucret',
  'sablon',
  'yardim',
  'tesekkur',
  'deneme',
  'nasil',
  'goster',
  'anlat',
  'soyle',
  'basla',
  'evet',
  'tamam',
  'olur',
];

// Whole words only: short markers like 'mi', 'ne' or 'var' would otherwise fire
// inside English words ('minimum', 'one', 'various'), so two of them are
// required before they count as Turkish.
const TURKISH_WORDS = [
  'ne',
  'nedir',
  'kac',
  'var',
  'yok',
  'mi',
  'mu',
  'icin',
  'hangi',
  'neler',
  'nerede',
  'nerde',
  'lutfen',
  'degil',
];

const TURKISH_WORD_RE = new RegExp(`(?:^|[^a-z0-9])(${TURKISH_WORDS.join('|')})(?![a-z0-9])`);

function isTurkishText(text: string): boolean {
  const folded = foldTurkish(text);
  if (TURKISH_LETTERS.test(text) || TURKISH_STEMS.some((stem) => folded.includes(stem))) {
    return true;
  }
  return (folded.match(new RegExp(TURKISH_WORD_RE.source, 'g'))?.length ?? 0) >= 2;
}

function deriveLanguage(planText: string, reply: string): OwnerLanguage {
  return isTurkishText(planText) || isTurkishText(reply) ? 'turkish' : 'english';
}

// Appended to both persona calls so the message array is never system-only.
// The GLM backend rejects a `messages` payload that consists of system turns
// alone (HTTP 400 / code 1214) — and every other lane caller in this repo
// already ends with a user turn (app/api/chat/route.ts, the builder worker), so
// the judge and the brief were this repo's only two. The prompt content stays
// in the system turn: this turn only closes the shape, and therefore changes
// what the provider accepts without changing what the prompt says.
const CLOSE_USER_TURN = 'Follow the instructions above.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared verdict kept-ends bounds (values + kept-ends view) live in
// lib/verdict/bounds.ts — the single source of truth the new-bot page imports
// too. Nothing local here; see that module's history note.

// One verdict JSON object is tiny; a 3-8 line brief fits comfortably.
const VERDICT_MAX_TOKENS = 256;
const BRIEF_MAX_TOKENS = 1024;

// One verdict/brief call's worst-case output cost, mirroring chat's
// PERSONA_CALL_CREDITS. Both calls ride the persona lane, whose most expensive
// route is wiro `glm/5-2` at $4.40 / 1M output tokens (lanes.ts), and this
// pre-authorizes BOTH calls at once (VERDICT_MAX_TOKENS + BRIEF_MAX_TOKENS) so
// the one check covers everything `yes` will bill. USD -> credits goes through
// the shared meter, so this file states no credit count of its own.
const PERSONA_MAX_OUTPUT_USD_PER_MTOKEN = 4.4;
const VERDICT_CALL_CREDITS = toCredits(
  ((VERDICT_MAX_TOKENS + BRIEF_MAX_TOKENS) / 1_000_000) * PERSONA_MAX_OUTPUT_USD_PER_MTOKEN,
);

// Credits already spent this calendar month, scoped to the account. Identical
// arithmetic to the chat route's SPENT_CREDITS_SQL (ai_spend has no period
// column, so created_at is the period and the shared allowance is monthly).
const SPENT_CREDITS_SQL =
  'SELECT COALESCE(SUM(credits), 0) AS spent FROM ai_spend ' +
  "WHERE account_id = $1 AND created_at >= date_trunc('month', now())";

// --- Injectable seams (fail-closed, test-only writers) ---

export interface VerdictSession extends InterviewSession {
  trialEndsAt?: Date | string | null;
  tier?: string | null;
}

export interface VerdictSessionReader {
  getSession(req: Request): Promise<VerdictSession | null>;
}

let sessionReader: VerdictSessionReader = defaultSessionReader;

export function __setSessionReader(reader: VerdictSessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = defaultSessionReader;
}

export interface BuilderBoss {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  createQueue(name: string): Promise<unknown>;
  send(name: string, data: object, options?: SendOptions): Promise<string | null>;
}

function defaultBossFactory(): BuilderBoss {
  const boss = new PgBoss({ connectionString: requireDatabaseUrl() });
  return {
    start: () => boss.start(),
    stop: () => boss.stop(),
    createQueue: (name) => boss.createQueue(name),
    send: (name, data, options) => boss.send(name, data, options),
  };
}

let bossFactory: () => BuilderBoss = defaultBossFactory;

export function __setBossFactory(factory: () => BuilderBoss): void {
  bossFactory = factory;
}

export function __resetBossFactory(): void {
  bossFactory = defaultBossFactory;
}

export interface PersonaResult {
  text: string;
  providerCostUsd: number | null;
}

export type PersonaCaller = (
  messages: { role: string; content: string }[],
  maxTokens: number,
) => Promise<PersonaResult>;

async function defaultPersonaCaller(
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<PersonaResult> {
  const result = await chat({ lane: 'persona', messages, maxTokens });
  return { text: result.text, providerCostUsd: result.providerCostUsd };
}

let personaCaller: PersonaCaller = defaultPersonaCaller;

export function __setPersonaCaller(caller: PersonaCaller): void {
  personaCaller = caller;
}

export function __resetPersonaCaller(): void {
  personaCaller = defaultPersonaCaller;
}

// --- Handler ---

interface VerdictTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface VerdictInput {
  botId?: unknown;
  turns?: unknown;
}

function validateTurns(value: unknown): VerdictTurn[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return 'turns must be an array';
  if (value.length > TURNS_MAX) {
    return `turns must hold at most ${TURNS_MAX} turns`;
  }
  const turns: VerdictTurn[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return 'turns must be objects';
    }
    const record = entry as Record<string, unknown>;
    if (record.role !== 'user' && record.role !== 'assistant') {
      return "turn role must be 'user' or 'assistant'";
    }
    if (typeof record.content !== 'string') {
      return 'turn content must be a string';
    }
    const content = record.content.trim();
    if (content === '' || content.length > TURN_MAX) {
      return `turn content must be 1-${TURN_MAX} characters`;
    }
    turns.push({ role: record.role, content });
  }
  return turns;
}

export type Verdict = 'yes' | 'no' | 'unclear';

// A SUM the database could not express as a number is a billing-boundary read
// failure, so it surfaces as NaN and checkBudget throws on it. Returning 0
// instead would silently reset an exhausted month. Mirrors the chat route's
// readSpentCredits.
function readSpentCredits(row: unknown): number {
  if (typeof row === 'object' && row !== null) {
    const value = (row as Record<string, unknown>).spent;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
  }
  return Number.NaN;
}

async function loadSpentCredits(accountId: string): Promise<number> {
  const result = await getPool().query(SPENT_CREDITS_SQL, [accountId]);
  return readSpentCredits(result.rows[0]);
}

// Strict JSON verdict: EXACTLY {"verdict":"yes"|"no"|"unclear"} and nothing
// else. Anything unparseable — garbage, prose, markdown fences — reads as
// `unclear`, never throws, and never starts a build.
function parseVerdict(text: string): Verdict {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    if (typeof parsed === 'object' && parsed !== null) {
      const verdict = (parsed as Record<string, unknown>).verdict;
      if (verdict === 'yes' || verdict === 'no' || verdict === 'unclear') {
        return verdict;
      }
    }
  } catch {
    // Garbage in, unclear out — the caller asks a clarifying question.
  }
  return 'unclear';
}

// Billing must never break the verdict, and the verdict must never silently
// drop a metered call: a ledger failure is logged server-side and swallowed,
// mirroring recordChatSpend in app/api/chat/route.ts.
async function recordVerdictSpend(
  usdCost: number | null,
  accountId: string,
  botId: string,
): Promise<void> {
  try {
    await recordSpend(getPool(), {
      accountId,
      model: 'persona',
      usdCost,
      reason: 'persona-run',
      refId: botId,
    });
  } catch (error) {
    const mapped = mapDbError(error);
    const message = mapped
      ? `verdict: cannot record ai_spend - ${mapped.error}`
      : 'verdict: failed to record ai_spend';
    console.error(message, error);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let session = null;
  try {
    session = await sessionReader.getSession(req);
  } catch {
    session = null;
  }
  if (!session) {
    return NextResponse.json(
      { error: 'unauthorized', message: UNAUTHORIZED_MESSAGE },
      { status: 401 },
    );
  }

  // KI-033: the trial clock gates the WRITE, before the body check — a
  // malformed body must not be able to mask an expired trial as 422, and vice
  // versa. A paid tier bypasses the clock; a missing/unknown tier resolves to
  // the trial path (never to a bypass).
  if (!isPaidTier(session.tier) && isTrialExpired({ trial_ends_at: session.trialEndsAt })) {
    return NextResponse.json(
      { error: 'trial_expired', message: TRIAL_ENDED_MESSAGE },
      { status: 403 },
    );
  }

  let raw: VerdictInput = {};
  try {
    raw = (await req.json()) as VerdictInput;
  } catch {
    raw = {};
  }

  const botId = typeof raw.botId === 'string' ? raw.botId : '';
  if (!UUID_RE.test(botId)) {
    return NextResponse.json(
      { error: 'invalid bot id', message: INVALID_BOT_MESSAGE },
      { status: 422 },
    );
  }

  const turns = validateTurns(raw.turns);
  if (typeof turns === 'string') {
    return NextResponse.json({ error: turns, message: TURNS_MESSAGE }, { status: 422 });
  }

  let owned = false;
  try {
    // Soft-deleted bots are excluded here exactly as builder/start excludes
    // them: a deleted bot must not be judged or enqueued even if its row is
    // still owned by the caller.
    const found = await getPool().query(
      'SELECT id FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1',
      [botId, session.accountId],
    );
    owned = found.rows.length > 0;
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { error: 'database not configured', message: DB_NOT_CONFIGURED_MESSAGE },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: 'could not judge reply', message: BOT_READ_FAILED_MESSAGE },
      { status: 500 },
    );
  }
  if (!owned) {
    return NextResponse.json(
      { error: 'bot not found', message: BOT_NOT_FOUND_MESSAGE },
      { status: 404 },
    );
  }

  // KI-033, allowance: the verdict and brief calls are billable persona turns,
  // so they are pre-authorized exactly as a chat turn is — same guard, same
  // estimate shape, same refusal code and sentence. It sits with the other
  // pre-model gates (after ownership, before the model): a refused request
  // makes NO model call and writes NO spend row, and an account with nothing
  // left is never charged for a verdict it cannot act on. The guard throws on a
  // read failure by design, so an unreadable meter is answered as a failure to
  // check — never as a refusal the route cannot explain, and never as a fake
  // allow.
  let budget: Awaited<ReturnType<typeof checkBudget>>;
  try {
    budget = await checkBudget({
      accountId: session.accountId,
      estimatedCredits: VERDICT_CALL_CREDITS,
      getSpent: () => loadSpentCredits(session.accountId),
      // Unknown/absent tier falls back to the guard's own trial default — the
      // same isPlanTier pre-gate the chat route and the builder worker use, so
      // the guard's prototype-key path can never be reached.
      tier: isPlanTier(session.tier) ? session.tier : undefined,
    });
  } catch (error) {
    const mapped = mapDbError(error);
    if (mapped) {
      // The helper maps only DatabaseNotConfiguredError (see lib/db/map-db-error),
      // so its one response is the same DB-unconfigured refusal the ownership
      // read answers above — same code, same Turkish sentence.
      return NextResponse.json(
        { error: mapped.error, message: DB_NOT_CONFIGURED_MESSAGE },
        { status: mapped.status },
      );
    }
    console.error('verdict: cannot read the monthly allowance', error);
    return NextResponse.json(
      { error: 'could not check your AI credits', message: CREDITS_CHECK_MESSAGE },
      { status: 500 },
    );
  }
  if (!budget.ok) {
    // The verdict carries the allowance the guard actually resolved, so the
    // sentence names a real number instead of a remembered one.
    return NextResponse.json(
      {
        error: 'trial_budget_exceeded',
        message: budgetRefusalMessage(session.tier, budget.allowance),
      },
      { status: 403 },
    );
  }

  // The plan trigger is POSITION, not wording (founder lock 2026-09-25, option
  // 1): the last assistant turn in the posted tail IS the plan offer, and the
  // model's verdict object below is the only thing that decides whether the
  // reply accepted it. No wording gate stands here anymore — the accept-line
  // matcher that used to was refused every paraphrase approval ("baslat", "yap",
  // "sen karar ver", "you decide") before the judge could see it, so the plan
  // re-rendered forever. The 409 is kept for the one case where no plan was ever
  // offered: a tail carrying no assistant turn at all, which is a genuine
  // absence of anything to accept — and, by founder lock, of anything that may
  // start. The sentence the owner reads is byte-identical to the one the old
  // gate wrote: one situation, one text.
  const assistantTurns = turns.filter((turn) => turn.role === 'assistant');
  const planTurn = assistantTurns.length > 0 ? assistantTurns[assistantTurns.length - 1] : null;
  if (!planTurn) {
    return NextResponse.json({ error: 'no_plan_asked', message: NO_PLAN_MESSAGE }, { status: 409 });
  }

  const userTurns = turns.filter((turn) => turn.role === 'user');
  const reply = userTurns.length > 0 ? userTurns[userTurns.length - 1].content : '';

  // The kept-ends views the judge is handed, computed once: the language is
  // derived from exactly the bytes the prompt will carry, so no text the prompt
  // never shows can decide the guidance.
  const planView = boundedView(planTurn.content, PLAN_MAX, PLAN_TAIL_MAX);
  const replyView = boundedView(reply, REPLY_MAX, REPLY_TAIL_MAX);
  const language = deriveLanguage(planView, replyView);

  let verdictText: string;
  let verdictCost: number | null;
  try {
    const called = await personaCaller(
      [
        {
          role: 'system',
          content: buildVerdictPrompt(planView, replyView, language),
        },
        { role: 'user', content: CLOSE_USER_TURN },
      ],
      VERDICT_MAX_TOKENS,
    );
    verdictText = called.text;
    verdictCost = called.providerCostUsd;
  } catch (error) {
    // The lane owns keys: no key, no route, no reply — an honest 500, never a
    // fabricated verdict. The cause is logged first (the shape
    // app/api/chat/route.ts uses): a discarded RouterError hides which lane
    // died and whether the provider refused the payload or the network fell
    // over, and this route's 500 could not tell those apart.
    console.error('verdict: cannot judge the reply', error);
    return NextResponse.json(
      { error: 'could not judge reply', message: JUDGE_FAILED_MESSAGE },
      { status: 500 },
    );
  }
  await recordVerdictSpend(verdictCost, session.accountId, botId);

  const verdict = parseVerdict(verdictText);
  if (verdict !== 'yes') {
    // `no` and `unclear` start nothing: NO builder_runs row, NO boss job. The
    // assistant's own clarifying reply is the UI.
    return NextResponse.json({ verdict, started: false }, { status: 200 });
  }

  // Kept-ends view for the same reason as the plan turn: the thread's END holds
  // the plan and the reply that confirms it, which is what the brief is distilled
  // from. Capped at THREAD_MAX exactly as before, so the billed input is unchanged.
  const threadText = boundedView(
    turns.map((turn) => `${turn.role}: ${turn.content}`).join('\n'),
    THREAD_MAX,
    THREAD_TAIL_MAX,
  );
  let briefRaw: string;
  let briefCost: number | null;
  try {
    const called = await personaCaller(
      [
        { role: 'system', content: buildBriefPrompt(threadText, language) },
        { role: 'user', content: CLOSE_USER_TURN },
      ],
      BRIEF_MAX_TOKENS,
    );
    briefRaw = called.text;
    briefCost = called.providerCostUsd;
  } catch (error) {
    // Same logging rule as the judge's catch above: the cause is what makes a
    // verdict-yes failure diagnosable, and the caller only ever sees the 500.
    console.error('verdict: cannot write the brief', error);
    return NextResponse.json(
      { error: 'could not write brief', message: BRIEF_FAILED_MESSAGE },
      { status: 500 },
    );
  }
  await recordVerdictSpend(briefCost, session.accountId, botId);

  // The builder contract caps the brief at 1..2000 chars; the model is asked
  // for <=1500 but its output is clamped here, not trusted.
  const brief = briefRaw.slice(0, BRIEF_MAX).trim();
  if (brief.length === 0) {
    return NextResponse.json(
      { error: 'empty_brief', message: EMPTY_BRIEF_MESSAGE },
      { status: 422 },
    );
  }

  // From here down the flow is IDENTICAL to builder/start: the row exists
  // before the job does, and an enqueue failure flips it to failed.
  let runId: string;
  try {
    const inserted = await getPool().query<{ id: string }>(
      'INSERT INTO builder_runs (bot_id) VALUES ($1) RETURNING id',
      [botId],
    );
    const id = inserted.rows[0]?.id;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json(
        { error: 'could not start build', message: START_FAILED_MESSAGE },
        { status: 500 },
      );
    }
    runId = id;
  } catch {
    return NextResponse.json(
      { error: 'could not start build', message: START_FAILED_MESSAGE },
      { status: 500 },
    );
  }

  let boss: BuilderBoss;
  try {
    boss = bossFactory();
  } catch (err) {
    await markEnqueueFailed(runId);
    const error =
      err instanceof DatabaseNotConfiguredError
        ? 'database not configured'
        : 'could not start build';
    const message =
      err instanceof DatabaseNotConfiguredError ? DB_NOT_CONFIGURED_MESSAGE : START_FAILED_MESSAGE;
    return NextResponse.json({ error, message }, { status: 500 });
  }
  try {
    await boss.start();
    await boss.createQueue(BUILDER_QUEUE);
    const jobId = await boss.send(
      BUILDER_QUEUE,
      { runId, botId, brief },
      {
        singletonKey: runId,
        retryLimit: 3,
        retryDelay: 30,
        expireInSeconds: 3600,
        deleteAfterSeconds: 604800,
      },
    );
    if (!jobId) {
      await markEnqueueFailed(runId);
      return NextResponse.json(
        { error: 'could not start build', message: START_FAILED_MESSAGE },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { runId, phase: 'queued', verdict: 'yes', briefChars: brief.length },
      { status: 200 },
    );
  } catch {
    await markEnqueueFailed(runId);
    return NextResponse.json(
      { error: 'could not start build', message: START_FAILED_MESSAGE },
      { status: 500 },
    );
  } finally {
    try {
      await boss.stop();
    } catch {
      // Best-effort: the outcome above stands; never mask it.
    }
  }
}

// The row exists before the job does. If enqueueing fails the row would sit
// `queued` forever, so it is flipped to `failed` — identical to builder/start.
async function markEnqueueFailed(runId: string): Promise<void> {
  try {
    await getPool().query(
      "UPDATE builder_runs SET phase = 'failed', detail = $2::jsonb, updated_at = now() WHERE id = $1",
      [runId, JSON.stringify({ error: 'enqueue_failed' })],
    );
  } catch {
    // Caller still receives the generic 500.
  }
}
