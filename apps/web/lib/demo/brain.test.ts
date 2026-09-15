import { describe, expect, it } from 'vitest';
import { scriptedBrain } from './brain';

const HELP_REPLY = 'I can show templates, pricing, or a welcome demo. Try: what templates exist';
const GREETING_REPLY = 'Hello - I am the Corvus demo. Ask about templates or pricing, or say help';
const TEMPLATE_REPLY =
  '8 templates ship v1: welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy. Fork one after signup';
const PRICING_REPLY = 'Pro is $10/mo, Studio $29/mo. Trials run 3 days, full Pro, no card';
const FALLBACK_REPLY =
  'I am a scripted preview - describe your bot after signup and the AI builds it.';

const ALL_REPLIES = [HELP_REPLY, GREETING_REPLY, TEMPLATE_REPLY, PRICING_REPLY, FALLBACK_REPLY];

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
    await expect(scriptedBrain.reply('SELAM')).resolves.toBe(GREETING_REPLY);
    await expect(scriptedBrain.reply('merhaba')).resolves.toBe(GREETING_REPLY);
  });

  it('matches template trigger', async () => {
    await expect(scriptedBrain.reply('what templates exist')).resolves.toBe(TEMPLATE_REPLY);
  });

  it('matches ascii template trigger', async () => {
    await expect(scriptedBrain.reply('sablon var mi')).resolves.toBe(TEMPLATE_REPLY);
  });

  it('matches pricing trigger', async () => {
    await expect(scriptedBrain.reply('what is the price')).resolves.toBe(PRICING_REPLY);
    await expect(scriptedBrain.reply('fiyat nedir')).resolves.toBe(PRICING_REPLY);
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

  it('uses no exclamation marks in replies', async () => {
    const bang = String.fromCharCode(33);
    for (const reply of ALL_REPLIES) {
      expect(reply).not.toContain(bang);
    }
    const live = await scriptedBrain.reply('hello');
    expect(live).not.toContain(bang);
  });

  it('uses no emoji in replies', async () => {
    for (const reply of ALL_REPLIES) {
      expect(hasEmojiLike(reply)).toBe(false);
    }
    const live = await scriptedBrain.reply('what is the price');
    expect(hasEmojiLike(live)).toBe(false);
  });
});
