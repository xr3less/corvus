// Shared refusal-message readers — the single source of truth for turning a
// refusal payload into the honest sentence the person reads.
//
// History: the same message-preferred, error-fallback shape lived as three
// local copies (readRefusalMessage in app/dashboard/bots/[id]/page.tsx,
// readErrorMessage in app/interview/page.tsx, forkErrorMessage in
// app/gallery/page.tsx, mirroring readRefusalMessage in
// lib/verdict/bounds.ts). A fix to one side without the others showed a code
// where a sentence belonged, so all three callers import from here now.
// Pure module: no React, no fetch, no secrets — the async Response twin only
// reads the Response it is handed.

// --- The Turkish refusal table (F15) ----------------------------------------
//
// When a body carries only the machine `error` (the older code-only shape), the
// reader used to hand that token straight to the screen: a person read
// `trial_expired`, `no_plan_asked` or `constructor` where a sentence belonged.
// F15 closes both halves of that: a known code resolves to its Turkish sentence
// below, and an unrecognized code-shaped value resolves to a Turkish generic, so
// a machine token can no longer be what the person sees.
//
// The sentences are bytes this wave already ships, not new copy — one
// situation, one text. `unauthorized`, `no_plan_asked`, `invalid_turns`,
// `invalid bot id`, `bot not found`, `empty_brief`, `database not configured`,
// `could not judge reply`, `could not write brief`, `could not start build` and
// `could not check your AI credits` are the Turkish `message` values of
// app/api/builder/verdict/route.ts, verbatim. The KI-033 codes get Turkish
// twins of the two byte-locked English refusals (those routes' own note:
// translating them is a cross-route copy wave) — and this table is reached ONLY
// when `message` is absent, so it never overrides the locked sentence when the
// server writes one.
//
// A `Map`, not object indexing: a payload whose `error` is 'constructor' or
// 'toString' must land on the same generic as any other unknown code instead of
// handing back an inherited Object member.
const TR_REFUSALS: ReadonlyMap<string, string> = new Map([
  ['unauthorized', 'Oturum bulunamadı — tekrar giriş yap.'],
  ['trial_expired', '3 günlük deneme süren bitti — botların duraklatıldı. Hiçbir şey silinmedi.'],
  ['trial_bot_limit', 'Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi.'],
  // Tier-neutral on purpose: one code refuses both tiers, and naming the trial
  // would be false about the one fact a paying account can see (the reason the
  // routes keep two tier-aware sentences).
  ['trial_budget_exceeded', 'Bu ayın AI kredisi doldu — hiçbir şey silinmedi.'],
  [
    'no_plan_asked',
    'Kurulum başlamadı — plan mesajı okunamadı. Asistandan planı yeniden iste, sonra kısaca “evet” yaz.',
  ],
  ['invalid_turns', 'Sohbet geçmişi geçersiz — sayfayı yenileyip tekrar dene.'],
  ['invalid bot id', 'Bot kimliği geçersiz — sayfayı yenileyip tekrar dene.'],
  ['bot not found', 'Bot bulunamadı — sayfayı yenileyip tekrar dene.'],
  ['empty_brief', 'Kurulum metni boş çıktı — tekrar dene.'],
  ['database not configured', 'Sunucu şu an veritabanına bağlanamıyor.'],
  ['could not judge reply', 'Yanıt değerlendirilemedi — sonra tekrar dene.'],
  ['could not write brief', 'Kurulum metni yazılamadı — sonra tekrar dene.'],
  ['could not start build', 'Kurulum başlatılamadı — tekrar dene.'],
  ['could not check your AI credits', 'AI kredisi kontrol edilemedi — sonra tekrar dene.'],
]);

// What an unrecognized code-shaped value resolves to. A value that carries
// whitespace is a server sentence, not a token, and passes through unchanged:
// several locked suites assert those bytes (gallery's fork 500 'could not fork',
// the interview 422s), and rewriting a real sentence here would be inventing
// copy. A code this table does not know yet is still a code, so it gets the
// generic rather than the screen.
const UNKNOWN_CODE_REFUSAL = 'İstek tamamlanamadı — tekrar dene.';

function resolveRefusalError(error: string): string {
  const code = error.trim();
  const sentence = TR_REFUSALS.get(code);
  if (sentence !== undefined) return sentence;
  return /\s/.test(code) ? code : UNKNOWN_CODE_REFUSAL;
}

// A KI-033 trial refusal arrives as { error: <code>, message: <the honest
// sentence> }: the server writes both, so the person reads the reason in
// words instead of a code. `message` is preferred for that reason; `error`
// is the fallback for the older code-only shape and resolves through the
// Turkish table above, and a body with neither returns null so the caller
// keeps its honest fallback rather than printing an empty alert.
//
// ONE deliberate caller difference is preserved via the option: the bot-detail
// page passes { allowErrorFallback: false } because every `error` value that
// route can answer is a machine code ('could not start build', 'invalid
// brief', 'bot not found', …) and that page's locked copy shows a code as the
// honest generic line instead. So a message wins there, and anything else
// keeps the caller's own sentence.
export function readRefusalMessage(
  payload: unknown,
  options?: { allowErrorFallback?: boolean },
): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as { message?: unknown; error?: unknown };
  if (typeof record.message === 'string' && record.message.trim() !== '') return record.message;
  if (options?.allowErrorFallback === false) return null;
  if (typeof record.error === 'string' && record.error.trim() !== '') {
    return resolveRefusalError(record.error);
  }
  return null;
}

// Async Response twin (interview start/answer/review): reads the body the
// caller hands over and keeps the caller's own fallback when the body carries
// neither field or is not JSON. No fetch — the Response is an argument.
export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const payload = (await res.json()) as unknown;
    return readRefusalMessage(payload) ?? fallback;
  } catch {
    return fallback;
  }
}

// Payload+status twin (gallery fork): a body with neither field degrades to
// the status line. The sentence below is byte-locked by the gallery suite.
export function forkErrorMessage(payload: unknown, status: number): string {
  return readRefusalMessage(payload) ?? `Fork failed (${status}). Try again.`;
}
