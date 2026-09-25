export interface DemoBrain {
  reply(text: string): Promise<string>;
}

interface DemoReplies {
  help: string;
  greeting: string;
  template: string;
  pricing: string;
  fallback: string;
}

const HELP_REPLY = 'I can show templates, pricing, or a welcome demo. Try: what templates exist';
const GREETING_REPLY = 'Hello - I am the Corvus demo. Ask about templates or pricing, or say help';
const TEMPLATE_REPLY =
  '8 templates ship v1: welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy. Fork one after signup';
const PRICING_REPLY =
  'Pro is $10/mo, Studio $29/mo. Trials run 3 days, 1 bot, 100 credits, no card';
const FALLBACK_REPLY =
  'I am a scripted preview - describe your bot after signup and the AI builds it.';

// Turkish mirror of every English reply above: same facts (prices, trial caps,
// the eight gallery rows), same 280-char ceiling, same no-exclamation /
// no-emoji voice. The template names stay English in both languages on purpose
// - they are gallery catalog rows, not translatable copy (see
// TEMPLATE_CATEGORIES in brain.test.ts).
const TR_HELP_REPLY = 'Şablonları, fiyatları veya demoyu anlatabilirim. Dene: hangi şablonlar var';
const TR_GREETING_REPLY =
  'Merhaba - ben Corvus demo. Şablonlar veya fiyatlar hakkında sorabilirsin, ya da yardım yaz';
const TR_TEMPLATE_REPLY =
  "v1'de 8 şablon var: welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy. Kayıt olunca beğendiğini kopyalayabilirsin";
const TR_PRICING_REPLY = 'Pro $10/ay, Studio $29/ay. Deneme 3 gün, 1 bot, 100 kredi, kart gerekmez';
const TR_FALLBACK_REPLY =
  'Ben senaryolu bir önizlemeyim - kayıt olduktan sonra botunu anlat, yapay zeka onu kurar';

const ENGLISH_REPLIES: DemoReplies = {
  help: HELP_REPLY,
  greeting: GREETING_REPLY,
  template: TEMPLATE_REPLY,
  pricing: PRICING_REPLY,
  fallback: FALLBACK_REPLY,
};

const TURKISH_REPLIES: DemoReplies = {
  help: TR_HELP_REPLY,
  greeting: TR_GREETING_REPLY,
  template: TR_TEMPLATE_REPLY,
  pricing: TR_PRICING_REPLY,
  fallback: TR_FALLBACK_REPLY,
};

// Turkish-SPECIFIC letters only (both cases). o-umlaut and u-umlaut are
// deliberately excluded here: they overlap German/French spellings (uber,
// Zurich, Motorhead) and flipped English questions to Turkish. They stay in
// toFold below for matching, so 'ucret' / 'ornek' still fold correctly.
const TURKISH_LETTERS = /[çğışÇĞİŞ]/;

// Stems, matched as substrings so Turkish suffixes ride along: 'fiyatı',
// 'şablonlar', 'yardım eder misin'. Written ASCII because the input is folded
// first (see toFold), so every accented spelling lands on these needles.
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
];

// Whole words only: short markers like 'mi', 'ne' or 'var' would otherwise
// fire inside English words ('minimum', 'one', 'various').
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

// ASCII fold for matching only - never for output. NFD plus mark-stripping
// collapses 'şablon' / 'ücret' to 'sablon' / 'ucret', and the dotless ı is
// mapped to i so 'FİYAT' (whose full-case lowercase is i plus a combining dot,
// which would otherwise break the 'fiyat' needle) still matches.
function toFold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function isTurkishQuestion(raw: string, folded: string): boolean {
  // Rule 1 (strong signal): a Turkish-specific diacritic or a Turkish stem.
  // Rule 2 (weak signal): bare short whole words ('var', 'ne', 'mi', 'mu',
  // 'kac') alone are not enough — require at least two of them, so a lone
  // English 'var' / 'ne plus ultra' / 'mi casa' / 'mu meson' stays English.
  if (TURKISH_LETTERS.test(raw) || includesAny(folded, TURKISH_STEMS)) {
    return true;
  }
  const hits = folded.match(new RegExp(TURKISH_WORD_RE.source, 'g'));
  return (hits?.length ?? 0) >= 2;
}

// Ordered rule list, first match wins. Substring, case-insensitive and
// diacritic-folded. The reply language follows the question's language: a
// Turkish question gets the Turkish table, an English one the English table.
export const scriptedBrain: DemoBrain = {
  async reply(text: string): Promise<string> {
    const folded = toFold(text);
    const replies = isTurkishQuestion(text, folded) ? TURKISH_REPLIES : ENGLISH_REPLIES;
    if (folded.includes('help') || includesAny(folded, ['yardim'])) {
      return replies.help;
    }
    if (includesAny(folded, ['hello', 'hi', 'hey', 'selam', 'merhaba', 'nasilsin'])) {
      return replies.greeting;
    }
    if (includesAny(folded, ['template', 'sablon'])) {
      return replies.template;
    }
    if (includesAny(folded, ['price', 'cost', 'fiyat', 'ucret', 'kac para', 'deneme'])) {
      return replies.pricing;
    }
    return replies.fallback;
  },
};
