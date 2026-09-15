import React, { useState } from 'react';
import { Check } from 'lucide-react';

export interface PricingProps {
  onSelectPlan?: (planId: string, isYearly: boolean) => void;
}

export const Pricing: React.FC<PricingProps> = ({ onSelectPlan }) => {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <section id="pricing" className="max-w-[1400px] mx-auto px-5 md:px-8 py-20 md:py-28 text-center">
      <div className="max-w-3xl mx-auto space-y-4">
        <h2 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-3xl sm:text-4xl lg:text-5xl text-white tracking-[-0.03em] leading-[1.08]">
          Transparent Pricing Without Per-Guild Hostage Fees
        </h2>
        <p className="text-zinc-400 text-base max-w-xl mx-auto leading-relaxed">
          Stop paying separate monthly subscriptions for 4-5 different bots across every server. Build your bespoke bot once and deploy anywhere from a unified control plane.
        </p>

        {/* Monthly / Yearly Toggle with 20% Discount */}
        <div className="inline-flex items-center gap-1.5 p-1 rounded-full border border-white/10 bg-[#0e0e11] text-xs" role="group" aria-label="Billing Interval">
          <button
            type="button"
            onClick={() => setIsYearly(false)}
            className={`px-4 py-2 rounded-full transition-all font-semibold ${
              !isYearly ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setIsYearly(true)}
            className={`px-4 py-2 rounded-full transition-all font-semibold flex items-center gap-1.5 ${
              isYearly ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>Annual</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-sans font-medium ${
              isYearly ? 'bg-emerald-500/20 text-emerald-700' : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* 3 Clear Tiers */}
      <div className="grid md:grid-cols-3 gap-5 mt-14 text-left max-w-5xl mx-auto items-stretch">
        {/* Tier 1: $0 Trial */}
        <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl p-7 flex flex-col justify-between hover:border-white/20 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-lg font-['Plus_Jakarta_Sans',sans-serif]">Starter Trial</h3>
              <span className="text-[10px] text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded font-sans">
                No Card Required
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="font-['Plus_Jakarta_Sans',sans-serif] text-4xl font-semibold text-white">$0</span>
              <span className="text-zinc-500 text-xs">/ 3-day access</span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              Deploy your first custom Discord bot to production in minutes. No credit card required.
            </p>

            <ul className="text-xs text-zinc-300 mt-6 space-y-3">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>1 active production Discord bot</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>1 connected Discord guild</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>200 AI Studio interview credits</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Full access to all 8 starter blueprints</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Community Discord support</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onSelectPlan?.('free_trial', isYearly)}
            className="w-full text-center mt-8 py-2.5 px-4 text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-colors font-['Plus_Jakarta_Sans',sans-serif]"
          >
            Start 3-Day Free Trial
          </button>
        </div>

        {/* Tier 2: Pro (Popular Badge) */}
        <div className="rounded-2xl p-7 relative flex flex-col justify-between bg-[#121215] border border-white/25 shadow-xl">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-semibold bg-white text-black rounded-full px-3 py-0.5 shadow-md font-['Plus_Jakarta_Sans',sans-serif]">
            Most Popular
          </span>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-lg font-['Plus_Jakarta_Sans',sans-serif]">Corvus Pro</h3>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-sans font-medium">
                Recommended
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="font-['Plus_Jakarta_Sans',sans-serif] text-4xl font-semibold text-white">
                {isYearly ? '$8' : '$10'}
              </span>
              <span className="text-zinc-500 text-xs">
                {isYearly ? '/ month ($96 billed annually)' : '/ month'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              Full capabilities for growing communities, gaming hubs, and multi-channel servers.
            </p>

            <ul className="text-xs text-zinc-200 mt-6 space-y-3">
              <li className="flex items-start gap-2 font-medium text-white">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>2 active production Discord bots</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Up to 5 connected Discord guilds</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>2,000 AI credits (~1,800 compilations)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Persistent Postgres state store (Zero XP/data loss)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>99.98% guaranteed gateway uptime SLA</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Priority developer email & Discord support</span>
              </li>
            </ul>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={() => onSelectPlan?.('pro', isYearly)}
              className="w-full text-center py-3 px-4 text-xs font-semibold bg-white text-black hover:bg-zinc-200 rounded-full transition-colors font-['Plus_Jakarta_Sans',sans-serif]"
            >
              Upgrade to Pro
            </button>
            <p className="text-[11px] text-zinc-500 mt-2.5 text-center">
              Cancel anytime with a single click
            </p>
          </div>
        </div>

        {/* Tier 3: Studio */}
        <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl p-7 flex flex-col justify-between hover:border-white/20 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-lg font-['Plus_Jakarta_Sans',sans-serif]">Corvus Studio</h3>
              <span className="text-[10px] text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded font-sans">
                Networks & Agencies
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="font-['Plus_Jakarta_Sans',sans-serif] text-4xl font-semibold text-white">
                {isYearly ? '$23' : '$29'}
              </span>
              <span className="text-zinc-500 text-xs">
                {isYearly ? '/ month ($276 billed annually)' : '/ month'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              Unrestricted scale and dedicated infrastructure for gaming networks and agency bot fleets.
            </p>

            <ul className="text-xs text-zinc-300 mt-6 space-y-3">
              <li className="flex items-start gap-2 font-medium text-white">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>8 active production Discord bots</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Up to 100 connected Discord guilds</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>6,000 AI credits per month</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Custom webhooks & REST API integration</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Dedicated bot hosting with static egress IP</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>1-on-1 technical onboarding & custom SLA</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onSelectPlan?.('studio', isYearly)}
            className="w-full text-center mt-8 py-2.5 px-4 text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-colors font-['Plus_Jakarta_Sans',sans-serif]"
          >
            Select Studio Plan
          </button>
        </div>
      </div>
    </section>
  );
};

export default Pricing;

