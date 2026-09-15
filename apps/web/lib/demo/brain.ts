export interface DemoBrain {
  reply(text: string): Promise<string>;
}

const HELP_REPLY = 'I can show templates, pricing, or a welcome demo. Try: what templates exist';
const GREETING_REPLY = 'Hello - I am the Corvus demo. Ask about templates or pricing, or say help';
const TEMPLATE_REPLY =
  '8 templates ship v1: welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy. Fork one after signup';
const PRICING_REPLY = 'Pro is $10/mo, Studio $29/mo. Trials run 3 days, full Pro, no card';
const FALLBACK_REPLY =
  'I am a scripted preview - describe your bot after signup and the AI builds it.';

function includesAny(lower: string, needles: string[]): boolean {
  return needles.some((needle) => lower.includes(needle));
}

// Ordered rule list, first match wins. Substring, case-insensitive.
export const scriptedBrain: DemoBrain = {
  async reply(text: string): Promise<string> {
    const lower = text.toLowerCase();
    if (lower.includes('help')) {
      return HELP_REPLY;
    }
    if (includesAny(lower, ['hello', 'hi', 'hey', 'selam', 'merhaba'])) {
      return GREETING_REPLY;
    }
    if (includesAny(lower, ['template', 'sablon', 'şablon'])) {
      return TEMPLATE_REPLY;
    }
    if (includesAny(lower, ['price', 'cost', 'fiyat', 'ucret', 'ücret'])) {
      return PRICING_REPLY;
    }
    return FALLBACK_REPLY;
  },
};
