import React, { useState } from 'react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const faqData: FaqItem[] = [
  {
    id: 'token',
    question: 'Do I ever need to share my bot token or credentials?',
    answer:
      'Never. Corvus never requests, logs, or stores your Discord bot token in plaintext. Bot integration connects entirely via Discord OAuth2 scoped authorizations. The runtime operates under the strict principle of least privilege—accessing only the channels, events, and permissions you explicitly designate.',
  },
  {
    id: 'persistence',
    question: 'What happens to my guild data and XP records if my trial expires?',
    answer:
      'Your state is permanent and safe. Guild configurations, member XP ledgers, and compiled behavior rulesets (behavior-spec.json) are persistently stored in our managed Postgres database. If your subscription ends, your bot gracefully transitions to Sleep Mode. You can reactivate at any time or export your complete state in JSON format.',
  },
  {
    id: 'difference',
    question: 'How does Corvus differ from legacy bots like MEE6 or Dyno?',
    answer:
      'Legacy bots charge per-server hostage fees for rigid, off-the-shelf templates you cannot customize without writing code. With Corvus, you define behavior, personas, and reactive logic in plain natural language. Your bot is 100% bespoke to your community, and a single subscription can deploy across multiple guilds from one control plane.',
  },
  {
    id: 'credits',
    question: 'How do AI credits work for dynamic interactions and moderation?',
    answer:
      'Deterministic core operations (role assignments, slash command routing, XP calculations, and rule enforcement) are 100% free and consume zero credits. AI credits are only utilized when your bot runs intelligent studio interviews or synthesizes dynamic natural language support responses (~1.1 credits per compilation). The 2,000 credits included in Corvus Pro comfortably support standard communities for months.',
  },
  {
    id: 'hierarchy',
    question: 'I already have other bots installed. Will role permissions conflict?',
    answer:
      "No. Corvus features an automated Pre-Flight Permission Audit engine that analyzes your server's role hierarchy and permission flags before joining. It outputs an objective health score (0-100) and pinpoints exactly where in your role hierarchy the bot should sit to avoid collisions with existing bots.",
  },
];

export const FaqAccordion: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>('token');

  const toggleItem = (id: string) => {
    setOpenId((current) => (current === id ? null : id));
  };

  return (
    <section id="faq" className="max-w-3xl mx-auto px-5 py-20 md:py-28">
      <div className="text-center space-y-3 mb-12">
        <h2 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-3xl sm:text-4xl text-white tracking-[-0.03em] leading-[1.08]">
          Frequently Asked Questions
        </h2>
        <p className="text-zinc-400 text-sm sm:text-base">
          Everything you need to know about architecture, token security, and pricing.
        </p>
      </div>

      <div className="space-y-3">
        {faqData.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div
              key={item.id}
              className="bg-[#0c0c0e] border border-white/10 rounded-2xl px-5 transition-colors hover:border-white/20"
            >
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                className="w-full flex items-center justify-between gap-4 py-4 sm:py-5 text-left font-medium text-sm sm:text-[15px] min-h-[48px] text-white focus:outline-none font-['Plus_Jakarta_Sans',sans-serif]"
                aria-expanded={isOpen}
              >
                <span>{item.question}</span>
                <span
                  className={`text-xl leading-none text-zinc-400 transition-transform duration-200 shrink-0 ${
                    isOpen ? 'rotate-45 text-white' : ''
                  }`}
                >
                  +
                </span>
              </button>

              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="overflow-hidden">
                  <p className="pb-5 text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default FaqAccordion;
