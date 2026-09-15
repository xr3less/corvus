import React, { useState } from 'react';
import { MessageSquare, ShieldAlert, Terminal, Database } from 'lucide-react';

interface TabItem {
  id: string;
  title: string;
  desc: string;
  sub: string;
  image: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabItem[] = [
  {
    id: 'interview',
    title: 'Private Studio Interview',
    desc: 'Describe your bot\'s personality, permissions, and moderation workflows in a private studio dashboard—never in public channels.',
    sub: 'behavior_rules.json',
    image: 'assets/images/features/interview-studio.jpg',
    icon: MessageSquare,
  },
  {
    id: 'preflight',
    title: 'Pre-Flight Permission Audit',
    desc: 'Automated role hierarchy and conflict scanner detects privilege escalations and flags conflicting channel overrides before deployment.',
    sub: '100/100 Security Audit',
    image: 'assets/images/features/preflight-scanner.jpg',
    icon: ShieldAlert,
  },
  {
    id: 'simulator',
    title: 'In-Browser Sandbox Simulator',
    desc: 'Test slash commands, AI responses, dynamic buttons, and rich embeds in real time inside a simulated Discord client before installation.',
    sub: 'Sandbox Test Environment',
    image: 'assets/images/features/browser-simulator.jpg',
    icon: Terminal,
  },
  {
    id: 'warehouse',
    title: 'Persistent Postgres State',
    desc: 'Dedicated transactional storage ensures member XP, leveling ranks, ticket transcripts, and moderation logs survive gateway reconnections.',
    sub: 'Postgres ACID Architecture',
    image: 'assets/images/features/database-state.jpg',
    icon: Database,
  },
];

export const FeaturesCarousel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(0);

  return (
    <section id="features" className="py-20 md:py-28 border-b border-white/10 bg-black font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-12 space-y-3">
          <h2 className="font-['Plus_Jakarta_Sans',sans-serif] text-3xl sm:text-4xl font-semibold text-white tracking-tight">
            Engineered for Total Server Autonomy
          </h2>
          <p className="text-zinc-400 text-base leading-relaxed">
            Four architectural breakthroughs that eliminate bot bloat and security vulnerabilities.
          </p>
        </div>

        {/* 2-Column Tailark Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: 4 Interactive Tabs (5 Cols) */}
          <div className="lg:col-span-5 space-y-3">
            {tabs.map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = activeTab === idx;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(idx)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                    isActive
                      ? 'bg-[#121215] border-white/25 shadow-lg'
                      : 'bg-[#0a0a0c] border-white/5 hover:border-white/15 hover:bg-[#0f0f12]'
                  }`}
                >
                  {/* Top Progress bar animation indicator for active tab */}
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 to-indigo-400" />
                  )}

                  <div className="flex items-start gap-4">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                        isActive
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-zinc-400 border-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className={`text-sm font-semibold transition-colors ${isActive ? 'text-white' : 'text-zinc-300'}`}>
                        {tab.title}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        {tab.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Dynamic High-Res Visual Showcase Carousel (7 Cols) with Double-Bezel */}
          <div className="lg:col-span-7">
            <div className="ring-1 ring-white/10 bg-white/[0.02] p-1.5 sm:p-2 rounded-2xl sm:rounded-[2rem]">
              <div className="relative rounded-xl sm:rounded-[1.6rem] border border-white/10 bg-[#09090b]/90 p-2 sm:p-3 shadow-2xl shadow-black/80 ring-1 ring-white/5 backdrop-blur-md">
                {/* Top Bar: Clean, subdued status bar (NO traffic light dots) */}
                <div className="px-3 sm:px-4 py-2.5 mb-2 sm:mb-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 text-zinc-300 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-semibold text-white tracking-tight">{tabs[activeTab].title}</span>
                    </div>
                    <span className="hidden sm:inline-block text-zinc-600">/</span>
                    <span className="hidden sm:inline-block text-zinc-400 font-['Geist_Mono',monospace] text-[11px]">
                      {tabs[activeTab].sub}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-['Plus_Jakarta_Sans',sans-serif] text-zinc-400 border border-white/10 px-2.5 py-0.5 rounded-full bg-white/5">
                      Live Console <span className="font-['Geist_Mono',monospace]">v2.1</span>
                    </span>
                  </div>
                </div>

                {/* Carousel Slide Visuals (Stacked with smooth crossfade) */}
                <div className="relative rounded-xl overflow-hidden border border-white/5 bg-black/60 aspect-[16/10] w-full">
                  {tabs.map((tab, idx) => (
                    <div
                      key={tab.id}
                      className={`absolute inset-0 transition-all duration-500 ease-out ${
                        activeTab === idx
                          ? 'opacity-100 scale-100 pointer-events-auto'
                          : 'opacity-0 scale-[0.98] pointer-events-none'
                      }`}
                    >
                      <img
                        src={tab.image}
                        alt={tab.title}
                        className="w-full h-full object-cover object-top block select-none"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>

                {/* Subdued bottom bar */}
                <div className="mt-2.5 px-3 py-2 flex items-center justify-between text-xs text-zinc-400">
                  <span className="text-[11px] text-zinc-500 font-['Plus_Jakarta_Sans',sans-serif]">Discord API v10 Compatible · Live Preview</span>
                  <span className="font-['Geist_Mono',monospace] text-[11px] text-zinc-400">
                    {`0${activeTab + 1} / 04`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesCarousel;
