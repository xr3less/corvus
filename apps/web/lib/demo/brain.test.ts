import { describe, expect, it } from 'vitest';
import { scriptedBrain } from './brain';

const HELP_REPLY = 'I can show templates, pricing, or a welcome demo. Try: what templates exist';
const GREETING_REPLY = 'Hello - I am the Corvus demo. Ask about templates or pricing, or say help';
const TEMPLATE_REPLY =
  '8 templates ship v1: welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy. Fork one after signup';
const PRICING_REPLY =
  'Pro is $10/mo, Studio $29/mo. Trials run 3 days, 1 bot, 100 credits, no card';
const FALLBACK_REPLY =
  'I am a scripted preview - describe your bot after signup and the AI builds it.';

// Turkish mirror of the five replies above. Same facts, same voice rules, same
// gallery vocabulary in the same order — only the sentence language differs.
const TR_HELP_REPLY = 'Şablonları, fiyatları veya demoyu anlatabilirim. Dene: hangi şablonlar var';
const TR_GREETING_REPLY =
  'Merhaba - ben Corvus demo. Şablonlar veya fiyatlar hakkında sorabilirsin, ya da yardım yaz';
const TR_TEMPLATE_REPLY =
  "v1'de 8 şablon var: welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy. Kayıt olunca beğendiğini kopyalayabilirsin";
const TR_PRICING_REPLY = 'Pro $10/ay, Studio $29/ay. Deneme 3 gün, 1 bot, 100 kredi, kart gerekmez';
const TR_FALLBACK_REPLY =
  'Ben senaryolu bir önizlemeyim - kayıt olduktan sonra botunu anlat, yapay zeka onu kurar';

const ALL_EN_REPLIES = [HELP_REPLY, GREETING_REPLY, TEMPLATE_REPLY, PRICING_REPLY, FALLBACK_REPLY];
const ALL_TR_REPLIES = [
  TR_HELP_REPLY,
  TR_GREETING_REPLY,
  TR_TEMPLATE_REPLY,
  TR_PRICING_REPLY,
  TR_FALLBACK_REPLY,
];
const ALL_REPLIES = [...ALL_EN_REPLIES, ...ALL_TR_REPLIES];

// Vocabulary provenance (verified 2026-09-23 against the source of truth on
// disk). TEMPLATE_REPLY answers "what templates exist", so it must name the
// eight *template gallery* categories — nothing else.
//
// Source of truth: apps/gateway/src/db/seed-templates.ts — the 8 seeded rows,
// categories in this exact order, locked by that package's own
// seed-templates.test.ts LOCKED_CATEGORIES. The literal is duplicated here
// rather than imported because @corvus/web must not depend on the gateway
// package; the duplication IS the drift net (same pattern and reasoning as
// packages/ai/src/builder-prompt.parity.test.ts).
//
// The guard covers BOTH language copies: the Turkish reply is a second
// instance of the same drift class (2026-09-24 F16), so it carries its own
// parser and asserts the same set in the same order.
const TEMPLATE_CATEGORIES = [
  'welcome',
  'moderation',
  'tickets',
  'leveling',
  'reaction roles',
  'logging',
  'giveaways',
  'economy',
] as const;

// Runtime kinds (apps/gateway/src/runtime/config.ts:11-20) that name NO
// forkable template. The runtime vocabulary and the gallery vocabulary are
// deliberately different: `xp` / `connector` / `status` are executable kinds,
// not gallery rows a user can open and fork. If one of these words appears in
// the template reply, the demo is describing the runtime engine instead of the
// gallery — the exact drift this guard exists to catch.
//
// Note the inverse trap, proven on disk: `leveling`, `logging` and `economy`
// are REAL gallery categories (and `leveling` / `logging` are real
// VALID_CAPABILITIES in lib/invite/permissions.ts), so "purifying" this reply
// to the runtime vocabulary makes it misdescribe the gallery.
const NON_TEMPLATE_KINDS = ['xp', 'connector', 'status'] as const;

function listedCategories(reply: string): string[] {
  return reply
    .replace(/^8 templates ship v1: /, '')
    .replace(/\. Fork one after signup$/, '')
    .split(', ')
    .map((word) => word.trim());
}

function trListedCategories(reply: string): string[] {
  return reply
    .replace(/^v1'de 8 şablon var: /, '')
    .replace(/\. Kayıt olunca beğendiğini kopyalayabilirsin$/, '')
    .split(', ')
    .map((word) => word.trim());
}

function hasEmojiLike(value: string): boolean {
  return (
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}]/u.test(value) ||
    value.includes('\uFE0F')
  );
}

describe('scriptedBrain - rule triggers', () => {
  it('matches help trigger', async () => {
    await expect(scriptedBrain.reply('help')).resolves.toBe(HELP_REPLY);
  });

  it('matches help case-insensitively', async () => {
    await expect(scriptedBrain.reply('HELP me')).resolves.toBe(HELP_REPLY);
  });

  it('matches greeting triggers', async () => {
    await expect(scriptedBrain.reply('hello there')).resolves.toBe(GREETING_REPLY);
  });

  it('matches template trigger', async () => {
    await expect(scriptedBrain.reply('what templates exist')).resolves.toBe(TEMPLATE_REPLY);
  });

  it('matches pricing trigger', async () => {
    await expect(scriptedBrain.reply('what is the price')).resolves.toBe(PRICING_REPLY);
  });

  it('falls back on unknown input', async () => {
    await expect(scriptedBrain.reply('xyzzy quux')).resolves.toBe(FALLBACK_REPLY);
  });
});

describe('scriptedBrain - first match wins order', () => {
  it('prefers help over greeting', async () => {
    await expect(scriptedBrain.reply('help, hi there')).resolves.toBe(HELP_REPLY);
  });

  it('prefers greeting over pricing on collision', async () => {
    await expect(scriptedBrain.reply('hi, what is the price')).resolves.toBe(GREETING_REPLY);
  });

  it('prefers greeting over template on collision', async () => {
    await expect(scriptedBrain.reply('hello, show templates')).resolves.toBe(GREETING_REPLY);
  });

  it('prefers template over pricing on collision', async () => {
    await expect(scriptedBrain.reply('template price')).resolves.toBe(TEMPLATE_REPLY);
  });

  it('keeps the Turkish rule order too', async () => {
    await expect(scriptedBrain.reply('yardım, merhaba')).resolves.toBe(TR_HELP_REPLY);
    await expect(scriptedBrain.reply('merhaba, fiyat nedir')).resolves.toBe(TR_GREETING_REPLY);
    await expect(scriptedBrain.reply('şablon fiyat')).resolves.toBe(TR_TEMPLATE_REPLY);
  });
});

describe('scriptedBrain - Turkish questions get Turkish answers', () => {
  it('answers a Turkish greeting in Turkish', async () => {
    await expect(scriptedBrain.reply('merhaba')).resolves.toBe(TR_GREETING_REPLY);
    await expect(scriptedBrain.reply('SELAM')).resolves.toBe(TR_GREETING_REPLY);
    await expect(scriptedBrain.reply('nasılsın')).resolves.toBe(TR_GREETING_REPLY);
  });

  it('answers a Turkish help question in Turkish', async () => {
    await expect(scriptedBrain.reply('yardım eder misin')).resolves.toBe(TR_HELP_REPLY);
  });

  it('answers a Turkish template question in Turkish', async () => {
    await expect(scriptedBrain.reply('hangi şablonlar var')).resolves.toBe(TR_TEMPLATE_REPLY);
    await expect(scriptedBrain.reply('sablon var mi')).resolves.toBe(TR_TEMPLATE_REPLY);
  });

  it('answers a Turkish pricing question in Turkish', async () => {
    await expect(scriptedBrain.reply('fiyat nedir')).resolves.toBe(TR_PRICING_REPLY);
    await expect(scriptedBrain.reply('ücret ne kadar')).resolves.toBe(TR_PRICING_REPLY);
  });

  it('answers an unmatched Turkish question with the Turkish fallback', async () => {
    await expect(scriptedBrain.reply('bot nasıl yaparım')).resolves.toBe(TR_FALLBACK_REPLY);
  });

  it('detects Turkish typed without any accented letter', async () => {
    // The whole sentence is pure ASCII: only the word list can catch it.
    await expect(scriptedBrain.reply('fiyat nedir')).resolves.toBe(TR_PRICING_REPLY);
    await expect(scriptedBrain.reply('sablon var mi')).resolves.toBe(TR_TEMPLATE_REPLY);
  });

  it('counts two short-word hits as Turkish without any stem or diacritic', async () => {
    // 'hangi bot var' is pure ASCII with no stem ('hangi' / 'var' are
    // word-only markers) — the pair together is the weak-signal path. A lone
    // 'var' stays English (pinned in the English block below).
    await expect(scriptedBrain.reply('hangi bot var')).resolves.toBe(TR_FALLBACK_REPLY);
  });

  it('detects Turkish from a Turkish-specific accented letter alone', async () => {
    // 'ışık açık' folds to 'isik acik', which is neither a marker stem nor a
    // marker word — the Turkish-specific diacritic (dotless ı, c-cedilla) is
    // the only Turkish signal in the sentence. o-umlaut / u-umlaut alone do
    // NOT count (German 'über', 'Zürich', 'Motörhead' stay English), so this
    // control must use a letter outside that overlap.
    await expect(scriptedBrain.reply('ışık açık')).resolves.toBe(TR_FALLBACK_REPLY);
  });

  it('detects Turkish in upper case, including dotted İ', async () => {
    await expect(scriptedBrain.reply('FİYAT')).resolves.toBe(TR_PRICING_REPLY);
    await expect(scriptedBrain.reply('ŞABLONLAR NELER')).resolves.toBe(TR_TEMPLATE_REPLY);
  });

  it('never returns the English copy for a Turkish question', async () => {
    const pairs: Array<[string, string]> = [
      ['merhaba', GREETING_REPLY],
      ['yardım', HELP_REPLY],
      ['şablonlar', TEMPLATE_REPLY],
      ['fiyat', PRICING_REPLY],
      ['ışık açık', FALLBACK_REPLY],
    ];
    for (const [question, englishReply] of pairs) {
      const reply = await scriptedBrain.reply(question);
      expect(reply).not.toBe(englishReply);
    }
  });
});

describe('scriptedBrain - English questions keep English answers', () => {
  it('does not let the Turkish markers fire inside English words', async () => {
    // Negative controls, one per short marker: 'mi' lives inside 'minimum',
    // 'ne' inside 'one', 'var' inside 'various'. Whole-word matching is what
    // keeps these English — a substring check would silently flip all three to
    // the Turkish table. Bare words on purpose: a longer English sentence can
    // trip one of the *English* substring needles ('hi' inside 'things'), which
    // is pre-existing behaviour and would blur what this control measures.
    await expect(scriptedBrain.reply('minimum')).resolves.toBe(FALLBACK_REPLY);
    await expect(scriptedBrain.reply('one')).resolves.toBe(FALLBACK_REPLY);
    await expect(scriptedBrain.reply('various')).resolves.toBe(FALLBACK_REPLY);
  });

  it('keeps accented non-Turkish English in English', async () => {
    // Regression pins for the F16 reviewer finding: o-umlaut / u-umlaut alone
    // are not Turkish evidence (German/French overlap). Each input also trips
    // an English intent needle, so the wrong language would land on a
    // fact-bearing reply — not the harmless fallback.
    await expect(scriptedBrain.reply('über templates')).resolves.toBe(TEMPLATE_REPLY);
    await expect(scriptedBrain.reply('Zürich trials cost')).resolves.toBe(PRICING_REPLY);
    await expect(scriptedBrain.reply('Motörhead templates')).resolves.toBe(TEMPLATE_REPLY);
  });

  it('keeps bare short ASCII words in English (single weak signal is not enough)', async () => {
    // One short whole-word hit alone must not flip the language table. Two
    // together still count as Turkish (covered by 'sablon var mi' above), but
    // a lone 'var' is plain English technical vocabulary.
    const expected = FALLBACK_REPLY;
    for (const sample of [
      'var',
      'const vs var',
      'what does var do',
      'ne',
      'ne plus ultra',
      'mi casa',
      'mu',
      'mu meson',
      'kac',
    ]) {
      await expect(scriptedBrain.reply(sample)).resolves.toBe(expected);
    }
  });

  it('no ordinary English question flips to Turkish', async () => {
    // D-004 locks the product language to English, so a Turkish reply to an
    // English visitor is a regression in the opposite direction — the one the
    // per-marker controls above cannot see, because they only test the three
    // short markers. This is the sweep: a broad sample of questions an English
    // visitor actually types, none of which may come back Turkish. A Turkish
    // reply is detected by its own diacritics, so this needs no reply table and
    // stays honest if the copy is later reworded.
    const samples = [
      'what templates exist',
      'how much does it cost',
      'show me your pricing',
      'hi there',
      'help me get started',
      'can you build me a moderation bot',
      'is there a free trial',
      'i need a bot for my server',
      'what can you do',
      'tell me about the plans',
      'does it work with discord',
      'minimum effort please',
      'one more question',
      'various things',
      'this is a test',
      'which one is best',
      'no thanks',
      'maybe later',
    ];
    const flipped: string[] = [];
    for (const sample of samples) {
      const reply = await scriptedBrain.reply(sample);
      if (/[çğıöşüÇĞİÖŞÜ]/.test(reply)) {
        flipped.push(`${sample} -> ${reply}`);
      }
    }
    expect(flipped).toEqual([]);
  });

  it('keeps the English intents English', async () => {
    await expect(scriptedBrain.reply('hello there')).resolves.toBe(GREETING_REPLY);
    await expect(scriptedBrain.reply('help me')).resolves.toBe(HELP_REPLY);
    await expect(scriptedBrain.reply('what is the price')).resolves.toBe(PRICING_REPLY);
    await expect(scriptedBrain.reply('show templates')).resolves.toBe(TEMPLATE_REPLY);
  });
});

describe('scriptedBrain - vocabulary provenance (template gallery, not runtime)', () => {
  it('template reply lists exactly the 8 seeded gallery categories, in order', () => {
    expect(listedCategories(TEMPLATE_REPLY)).toEqual([...TEMPLATE_CATEGORIES]);
  });

  it('template reply names no runtime-only kind', () => {
    const lower = ` ${TEMPLATE_REPLY.toLowerCase()} `;
    for (const kind of NON_TEMPLATE_KINDS) {
      // Word-boundary match: `xp` must not fire inside another word.
      expect(lower).not.toMatch(new RegExp(`[^a-z-]${kind}[^a-z-]`));
    }
  });

  it('Turkish template reply lists exactly the same 8 categories, in order', () => {
    expect(trListedCategories(TR_TEMPLATE_REPLY)).toEqual([...TEMPLATE_CATEGORIES]);
  });

  it('Turkish template reply names no runtime-only kind', () => {
    const lower = ` ${TR_TEMPLATE_REPLY.toLowerCase()} `;
    for (const kind of NON_TEMPLATE_KINDS) {
      expect(lower).not.toMatch(new RegExp(`[^a-z-]${kind}[^a-z-]`));
    }
  });

  it('live template trigger returns the pinned gallery reply in both languages', async () => {
    const live = await scriptedBrain.reply('what templates exist');
    expect(listedCategories(live)).toEqual([...TEMPLATE_CATEGORIES]);
    const liveTr = await scriptedBrain.reply('şablonlar');
    expect(trListedCategories(liveTr)).toEqual([...TEMPLATE_CATEGORIES]);
  });

  it('pricing reply states the enforced trial caps verbatim', () => {
    // Product truth: TRIAL_GRANT_CREDITS = 100 + interval '3 days'
    // (lib/auth/session.ts:102,198) and TRIAL_DEAL '1 bot, 100 AI credits'
    // (lib/bots.ts:50). Over-reading trial copy was the class fixed in the
    // 2026-09-23 trialcopy wave — these pins lock that fix.
    expect(PRICING_REPLY).toContain('Trials run 3 days, 1 bot, 100 credits, no card');
    expect(PRICING_REPLY).not.toContain('full Pro');
  });

  it('Turkish pricing reply states the same enforced trial caps', () => {
    // Same product truth as the English pin above, same limits, Turkish words
    // (3 gün / 1 bot / 100 kredi / kart gerekmez = no card). A Turkish reply
    // that over-promised the trial would be the same defect in a second
    // language, so it gets the same two-sided pin.
    expect(TR_PRICING_REPLY).toContain('Deneme 3 gün, 1 bot, 100 kredi, kart gerekmez');
    expect(TR_PRICING_REPLY).not.toContain('tam Pro');
    expect(TR_PRICING_REPLY).not.toContain('sınırsız');
  });

  it('both pricing replies quote the same prices', () => {
    expect(PRICING_REPLY).toContain('Pro is $10/mo, Studio $29/mo');
    expect(TR_PRICING_REPLY).toContain('Pro $10/ay, Studio $29/ay');
  });
});

describe('scriptedBrain - length and voice', () => {
  it('keeps every reply within 280 chars', () => {
    for (const reply of ALL_REPLIES) {
      expect(reply.length).toBeLessThanOrEqual(280);
    }
  });

  it('live replies stay within 280 chars', async () => {
    const samples = ['help', 'hi', 'templates', 'price', 'something else entirely'];
    for (const sample of samples) {
      const reply = await scriptedBrain.reply(sample);
      expect(reply.length).toBeLessThanOrEqual(280);
    }
  });

  it('live Turkish replies stay within 280 chars', async () => {
    const samples = ['yardım', 'merhaba', 'şablonlar', 'fiyat', 'örnek bir şey'];
    for (const sample of samples) {
      const reply = await scriptedBrain.reply(sample);
      expect(reply.length).toBeLessThanOrEqual(280);
    }
  });

  it('uses no exclamation marks in replies', async () => {
    const bang = String.fromCharCode(33);
    for (const reply of ALL_REPLIES) {
      expect(reply).not.toContain(bang);
    }
    const live = await scriptedBrain.reply('hello');
    expect(live).not.toContain(bang);
    const liveTr = await scriptedBrain.reply('merhaba');
    expect(liveTr).not.toContain(bang);
  });

  it('uses no emoji in replies', async () => {
    for (const reply of ALL_REPLIES) {
      expect(hasEmojiLike(reply)).toBe(false);
    }
    const live = await scriptedBrain.reply('what is the price');
    expect(hasEmojiLike(live)).toBe(false);
    const liveTr = await scriptedBrain.reply('fiyat nedir');
    expect(hasEmojiLike(liveTr)).toBe(false);
  });
});
