import React, { useState } from 'react';
import { Copy, Check, ArrowRight, ExternalLink } from 'lucide-react';

export interface BotTemplate {
  id: string;
  title: string;
  serverType: string;
  category: string;
  categoryColor: string;
  description: string;
  tags: string[];
  imageSrc: string;
  members: string;
}

export const botTemplates: BotTemplate[] = [
  {
    id: 'guardian',
    title: 'Community Guardian',
    serverType: 'General & Gaming Guilds',
    category: 'AUTOMOD',
    categoryColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    description: 'Automated anti-spam, toxic message filtering, raid mitigation, and real-time audit logging.',
    tags: ['anti-spam', 'auto-mute', 'raid-shield'],
    imageSrc: 'assets/images/qbbeqzzqoylaziguwfjx.supabase.co/948ef16f-0d09-439f-b5a3-2def86ef8b64-e05f518ae1.webp',
    members: '18.4k servers active',
  },
  {
    id: 'leveling',
    title: 'XP Economy & Shop',
    serverType: 'Gaming & Esports Hubs',
    category: 'ECONOMY',
    categoryColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    description: 'Chat activity XP gains, virtual economy store, customizable role rewards, and global leaderboards.',
    tags: ['xp-engine', 'virtual-shop', 'custom-roles'],
    imageSrc: 'assets/images/qbbeqzzqoylaziguwfjx.supabase.co/5a5b9b87-7f76-49fa-9c1f-c2d992b93024-f5a9a5ab4d.webp',
    members: '42.1k servers active',
  },
  {
    id: 'ticket',
    title: 'AI Support Desk',
    serverType: 'SaaS & Commerce Communities',
    category: 'SUPPORT',
    categoryColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    description: 'Instant AI ticket deflection, private staff triage threads, and encrypted conversation transcripts.',
    tags: ['ai-deflection', 'transcripts', 'private-threads'],
    imageSrc: 'assets/images/qbbeqzzqoylaziguwfjx.supabase.co/40a7ad40-cbf2-415a-bd56-39b203bab9cf-8a6782c112.webp',
    members: '12.8k servers active',
  },
  {
    id: 'streamer',
    title: 'Live Stream Notifier',
    serverType: 'Twitch, YouTube & Kick Creators',
    category: 'MEDIA',
    categoryColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    description: 'Zero-latency stream online announcements, rich video embeds, and automatic @Live role assignment.',
    tags: ['twitch-webhook', 'stream-alerts', 'auto-role'],
    imageSrc: 'assets/images/qbbeqzzqoylaziguwfjx.supabase.co/e9640c3b-187b-4578-b081-417f8ca78b50-0dcf11e365.webp',
    members: '9.6k servers active',
  },
  {
    id: 'welcome',
    title: 'Welcome & Role Picker',
    serverType: 'Community & Social Clubs',
    category: 'ONBOARDING',
    categoryColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    description: 'Interactive button role selection menus, dynamic banner cards, and server rules acceptance flow.',
    tags: ['button-roles', 'rules-gate', 'welcome-canvas'],
    imageSrc: 'assets/images/qbbeqzzqoylaziguwfjx.supabase.co/6e2100a2-8f63-4143-bc65-343695489c05-581ec61625.webp',
    members: '26.5k servers active',
  },
  {
    id: 'voice',
    title: 'Dynamic Voice Hub',
    serverType: 'Voice Chat & Audio Lounges',
    category: 'AUDIO & VOICE',
    categoryColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    description: 'On-demand temporary voice channels, dynamic room naming, and per-user permission controls.',
    tags: ['temp-channels', 'voice-manager', 'dynamic-rooms'],
    imageSrc: 'assets/images/qbbeqzzqoylaziguwfjx.supabase.co/24a771fc-d9cd-49ac-8e46-c2703c5fb79f-a399817be2.png',
    members: '15.2k servers active',
  },
  {
    id: 'faq',
    title: 'Knowledge Base AI',
    serverType: 'Developer & Education Hubs',
    category: 'AI ASSISTANT',
    categoryColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    description: 'Semantic search powered by RAG, instant docs retrieval, and conversational FAQs with rule citations.',
    tags: ['rag-search', 'ai-docs', 'auto-resolver'],
    imageSrc: 'assets/images/qbbeqzzqoylaziguwfjx.supabase.co/8aa04b3f-d783-4d70-b47b-3c6a710025a1-8ae7895461.png',
    members: '8.3k servers active',
  },
  {
    id: 'giveaway',
    title: 'Tournament & Giveaways',
    serverType: 'Competitive & Prize Communities',
    category: 'EVENTS',
    categoryColor: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
    description: 'Cryptographically verified random roll engine, countdown embeds, and role-conditioned entries.',
    tags: ['fair-lottery', 'countdown-embed', 'giveaways'],
    imageSrc: 'assets/images/qbbeqzzqoylaziguwfjx.supabase.co/6b088bc8-ca3a-441e-8c4e-c2894a6c237c-b3259b7717.png',
    members: '31.0k servers active',
  },
];

export interface BotTemplatesGridProps {
  onCloneTemplate?: (template: BotTemplate) => void;
}

export const BotTemplatesGrid: React.FC<BotTemplatesGridProps> = ({ onCloneTemplate }) => {
  const [clonedId, setClonedId] = useState<string | null>(null);

  const handleClone = (template: BotTemplate) => {
    setClonedId(template.id);
    onCloneTemplate?.(template);
    setTimeout(() => setClonedId(null), 2500);
  };

  return (
    <section id="templates" className="max-w-[1400px] mx-auto px-5 md:px-8 py-20 md:py-28 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-12">
        <div>
          <h2 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-3xl sm:text-4xl text-white tracking-tight">
            Production-Ready Bot Blueprints
          </h2>
          <p className="text-zinc-400 mt-2 text-base max-w-xl leading-relaxed">
            Deploy in seconds with pre-configured rules, custom embeds, and verified permission profiles.
          </p>
        </div>
        <a
          href="#pricing"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-semibold bg-[#141417] hover:bg-[#1f1f24] text-zinc-200 hover:text-white border border-white/10 transition-colors w-fit"
        >
          <span>All Blueprints Included (Start $0)</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* 8 Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {botTemplates.map((item) => (
          <article
            key={item.id}
            className="bg-[#0c0c0e] border border-white/10 hover:border-white/25 rounded-2xl overflow-hidden flex flex-col justify-between transition-colors group"
          >
            <div>
              {/* Bot Avatar Banner with Online Status Indicator */}
              <div className="p-3 relative">
                <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-zinc-900">
                  <img
                    src={item.imageSrc}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  {/* Glowing Status Indicator */}
                  <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-['Plus_Jakarta_Sans',sans-serif] text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Online</span>
                  </div>

                  {/* Category Pill */}
                  <div className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-['Plus_Jakarta_Sans',sans-serif] font-medium border ${item.categoryColor} backdrop-blur-md`}>
                    {item.category}
                  </div>
                </div>
              </div>

              {/* Bot Info Content */}
              <div className="px-4 pb-2 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{item.serverType}</span>
                  <span className="font-['Plus_Jakarta_Sans',sans-serif]">{item.members}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-white text-[15px] leading-snug">
                    {item.title}
                  </h3>
                  <span className="bg-[#5865F2] text-white text-[9px] font-bold px-1 py-0.2 rounded shrink-0">
                    BOT
                  </span>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  {item.description}
                </p>

                {/* Feature Tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-['Plus_Jakarta_Sans',sans-serif] px-2 py-0.5 rounded-md bg-[#141417] text-zinc-400 border border-white/5"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Action Button */}
            <div className="p-4 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => handleClone(item)}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  clonedId === item.id
                    ? 'bg-emerald-400 text-black'
                    : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                }`}
              >
                {clonedId === item.id ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>✓ Blueprint Deployed!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Inspect & Deploy Blueprint</span>
                  </>
                )}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default BotTemplatesGrid;
