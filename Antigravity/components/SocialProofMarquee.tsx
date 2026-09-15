import React from 'react';
import { Check } from 'lucide-react';

export interface TestimonialItem {
  id: string;
  name: string;
  handle: string;
  avatarInitials: string;
  avatarGradient: string;
  community: string;
  memberCount: string;
  quote: string;
  categoryTag: string;
  rating?: number;
}

export const row1Testimonials: TestimonialItem[] = [
  {
    id: 'alex-rivera',
    name: 'Alex Rivera',
    handle: '@alexrivera',
    avatarInitials: 'AR',
    avatarGradient: 'from-indigo-600 to-blue-700',
    community: 'DevHub Global',
    memberCount: '14.2k members',
    quote: "We were burning $40/month on MEE6 and Dyno subscriptions. With Corvus, we deployed a unified custom bot in 3 minutes. The ticket deflection and custom slash commands work flawlessly.",
    categoryTag: '#dev-community',
    rating: 5,
  },
  {
    id: 'sarah-chen',
    name: 'Sarah Chen',
    handle: '@sarahc',
    avatarInitials: 'SC',
    avatarGradient: 'from-emerald-600 to-teal-700',
    community: 'AI Builders Lab',
    memberCount: '8.9k members',
    quote: "The private studio interview is pure magic. I described our server's complex onboarding hierarchy in plain English, and Corvus compiled it into verified discord permissions instantly.",
    categoryTag: '#ai-engineering',
    rating: 5,
  },
  {
    id: 'marcus-vance',
    name: 'Marcus Vance',
    handle: '@marcusv',
    avatarInitials: 'MV',
    avatarGradient: 'from-amber-600 to-red-700',
    community: 'Twitch Partner',
    memberCount: '24k members',
    quote: "Instant live-stream notifications and automated dynamic voice hubs without any lag. The self-healing architecture means zero crashes during our 10k-viewer raids.",
    categoryTag: '#streaming',
    rating: 5,
  },
  {
    id: 'elena-rostova',
    name: 'Elena Rostova',
    handle: '@elena_web3',
    avatarInitials: 'ER',
    avatarGradient: 'from-cyan-600 to-blue-800',
    community: 'Solana Guild',
    memberCount: '12k members',
    quote: "Security was non-negotiable for our Web3 treasury. Zero token sharing via OAuth2 PKCE and least-privilege role scoping gave our mod team complete peace of mind.",
    categoryTag: '#web3-security',
    rating: 5,
  },
  {
    id: 'jessica-taylor',
    name: 'Jessica Taylor',
    handle: '@jessicat',
    avatarInitials: 'JT',
    avatarGradient: 'from-purple-600 to-pink-700',
    community: 'StudySync Global',
    memberCount: '6.5k members',
    quote: "The persistent Postgres state is a game changer. Even after server restarts, students' study streaks, XP balances, and role badges haven't dropped once.",
    categoryTag: '#edtech',
    rating: 5,
  },
];

export const row2Testimonials: TestimonialItem[] = [
  {
    id: 'liam-oconnor',
    name: "Liam O'Connor",
    handle: '@liam_esports',
    avatarInitials: 'LO',
    avatarGradient: 'from-rose-600 to-orange-700',
    community: 'Apex Masters',
    memberCount: '18k members',
    quote: "Automated tournament bracket seeding, fair lottery dispatch, and instant role assignments saved our organizers 15+ hours every weekend.",
    categoryTag: '#esports',
    rating: 5,
  },
  {
    id: 'david-park',
    name: 'David Park',
    handle: '@davidp_design',
    avatarInitials: 'DP',
    avatarGradient: 'from-fuchsia-600 to-purple-800',
    community: 'Figma Collective',
    memberCount: '9.2k members',
    quote: "The custom embed styling and onboarding cards look like they were designed by an elite design agency. It immediately elevated our brand perception.",
    categoryTag: '#design-ops',
    rating: 5,
  },
  {
    id: 'michael-torres',
    name: 'Michael Torres',
    handle: '@mtorres_ops',
    avatarInitials: 'MT',
    avatarGradient: 'from-zinc-600 to-slate-800',
    community: 'Cloud Native Hub',
    memberCount: '11.5k members',
    quote: "The pre-flight security scanner flagged a dangerous role hierarchy conflict before the bot even touched our production guild. Unmatched reliability.",
    categoryTag: '#devops',
    rating: 5,
  },
  {
    id: 'chloe-bennett',
    name: 'Chloe Bennett',
    handle: '@chloeb_music',
    avatarInitials: 'CB',
    avatarGradient: 'from-violet-600 to-indigo-800',
    community: 'Lofi Chill Lounge',
    memberCount: '15.3k members',
    quote: "Our community support desk handles 70% of inbound member inquiries autonomously with the AI knowledge base. Our mod queue is finally calm.",
    categoryTag: '#music-community',
    rating: 5,
  },
  {
    id: 'nathan-drake',
    name: 'Nathan Drake',
    handle: '@ndrake_prompt',
    avatarInitials: 'ND',
    avatarGradient: 'from-teal-600 to-emerald-800',
    community: 'Prompt Engineering Society',
    memberCount: '16.8k members',
    quote: "We fed our 40-page community guidelines into the knowledge base tab. The bot now guides new members with contextual citations 24/7.",
    categoryTag: '#ai-research',
    rating: 5,
  },
];

const DiscordIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const TestimonialCardItem: React.FC<{ item: TestimonialItem }> = ({ item }) => {
  return (
    <div className="w-[350px] sm:w-[380px] shrink-0 select-none text-left rounded-2xl border border-white/10 bg-[#0c0c0f]/90 p-4 sm:p-5 backdrop-blur-md transition-all duration-300 hover:border-white/25 hover:bg-[#131318] shadow-xl shadow-black/60 flex flex-col justify-between font-['Plus_Jakarta_Sans',sans-serif]">
      <div>
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.avatarGradient} flex items-center justify-center font-bold text-xs text-white ring-1 ring-white/10 shrink-0 shadow-inner`}
            >
              {item.avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-white text-sm truncate">{item.name}</div>
              <div className="text-zinc-500 text-xs truncate">{item.handle}</div>
            </div>
          </div>
          {/* Emerald Verified pill */}
          <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-medium whitespace-nowrap shrink-0 flex items-center gap-1 font-['Plus_Jakarta_Sans',sans-serif]">
            <Check className="w-2.5 h-2.5 stroke-[3] text-emerald-400" />
            Verified Bot
          </span>
        </div>

        {/* Community & Member count badge */}
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400 font-medium">
          <DiscordIcon className="w-3.5 h-3.5 text-indigo-400/90 shrink-0" />
          <span className="truncate text-zinc-300 font-medium">{item.community}</span>
          <span className="text-zinc-600">·</span>
          <span className="text-[11px] text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5 shrink-0 font-['Plus_Jakarta_Sans',sans-serif]">
            {item.memberCount}
          </span>
        </div>

        {/* Quote Body */}
        <p className="mt-3 text-[13px] sm:text-[13.5px] leading-relaxed text-zinc-300 font-normal">
          "{item.quote}"
        </p>
      </div>

      {/* Bottom info */}
      <div className="mt-4 pt-3.5 border-t border-white/5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="flex text-emerald-400 text-xs tracking-wider" aria-label="5 out of 5 stars">
            ★★★★★
          </div>
          <span className="text-zinc-400 text-[11px] font-medium font-['Plus_Jakarta_Sans',sans-serif]">5.0 / 5.0</span>
        </div>
        <span className="text-[11px] text-zinc-400 font-medium px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/5 font-['Plus_Jakarta_Sans',sans-serif]">
          {item.categoryTag}
        </span>
      </div>
    </div>
  );
};

export const SocialProofMarquee: React.FC = () => {
  return (
    <section className="py-20 md:py-28 border-y border-white/10 bg-[#050507] overflow-hidden relative font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Ambient subtle background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,rgba(16,185,129,0.03),transparent_70%)]"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12 text-center relative z-10">
        {/* Eyebrow pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/[0.04] text-zinc-300 mb-3 font-['Plus_Jakarta_Sans',sans-serif]">
          <span>PROVEN AT SCALE</span>
        </div>
        {/* Title */}
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white tracking-tight leading-tight max-w-3xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
          Trusted by 500+ Discord Communities Managing 1.8M+ Members
        </h2>
        {/* Subtitle */}
        <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed mt-3 font-['Plus_Jakarta_Sans',sans-serif]">
          Here is how high-growth Discord server owners and technical moderators run autonomous community operations with Corvus.
        </p>
      </div>

      {/* Marquee Wrapper with horizontal gradient fade masks */}
      <div
        className="relative w-full space-y-4 sm:space-y-5 group/marquee"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
        }}
      >
        {/* Row 1: Scrolls Left (5 unique + 5 duplicates) */}
        <div className="marquee-row flex whitespace-nowrap overflow-hidden">
          <div className="flex gap-4 sm:gap-5 animate-marquee-left hover:[animation-play-state:paused] group-hover/marquee:[animation-play-state:paused]">
            {[...row1Testimonials, ...row1Testimonials].map((item, idx) => (
              <TestimonialCardItem key={`row1-${item.id}-${idx}`} item={item} />
            ))}
          </div>
        </div>

        {/* Row 2: Scrolls Right (5 unique + 5 duplicates) */}
        <div className="marquee-row flex whitespace-nowrap overflow-hidden">
          <div className="flex gap-4 sm:gap-5 animate-marquee-right hover:[animation-play-state:paused] group-hover/marquee:[animation-play-state:paused]">
            {[...row2Testimonials, ...row2Testimonials].map((item, idx) => (
              <TestimonialCardItem key={`row2-${item.id}-${idx}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SocialProofMarquee;
