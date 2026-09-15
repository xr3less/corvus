import React from 'react';
import { ArrowRight, Play, Check, ShieldCheck } from 'lucide-react';
import { Velaris } from './ui/velaris';

export interface HeroProps {
  onStartTrial?: () => void;
  onExploreSimulator?: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  onStartTrial,
  onExploreSimulator,
}) => {
  return (
    <section id="how-it-works" className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden bg-black">
      {/* WebGL Velaris Living Gradient Background Wrapper */}
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <Velaris
          bg="#000000"
          colors={["#10b981", "#059669", "#064e3b", "#09090b"]}
          speed={1.6}
          grain={0.25}
          height="100%"
          className="h-full w-full"
        />
      </div>

      {/* Subtle radial ambient glow (monochrome, pure luxury, no neon AI slop) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,255,255,0.06),transparent_70%)]"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Hero Top Copy */}
        <div className="text-center max-w-3xl mx-auto space-y-6">
          {/* Badge pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-white/[0.03] text-zinc-300">
            <span>✨ Introducing Corvus v2.1 · Zero Code · Zero Infrastructure</span>
          </div>

          {/* Headline */}
          <h1 className="font-['Plus_Jakarta_Sans',sans-serif] tracking-[-0.03em] font-semibold text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.08]">
            Build Custom AI Discord Bots in Minutes, Not Weeks
          </h1>

          {/* Subheading */}
          <p className="text-base sm:text-lg text-zinc-400 font-normal leading-relaxed max-w-2xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
            Stop juggling fragmented subscriptions across five different bots. Describe your bot's personality, permissions, and logic in plain English—Corvus compiles and deploys it with zero code and zero token leaks.
          </p>

          {/* Action buttons with Button-in-Button Architecture */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href="#pricing"
              onClick={onStartTrial}
              className="w-full sm:w-auto inline-flex items-center justify-center pl-6 pr-2.5 py-2.5 rounded-full text-sm font-semibold bg-white text-black hover:bg-zinc-100 transition-colors group font-['Plus_Jakarta_Sans',sans-serif]"
            >
              <span>Start 3-Day Free Trial</span>
              <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-xs ml-3 group-hover:translate-x-0.5 transition-transform">
                <ArrowRight className="w-3.5 h-3.5 text-black" />
              </span>
            </a>

            <a
              href="#features"
              onClick={onExploreSimulator}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-medium bg-[#141417] hover:bg-[#1c1c20] text-zinc-200 hover:text-white border border-white/10 hover:border-white/25 transition-colors font-['Plus_Jakarta_Sans',sans-serif]"
            >
              <Play className="w-4 h-4 text-zinc-400 fill-current" />
              <span>Interactive Demo</span>
            </a>
          </div>

          {/* Trust Strip */}
          <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-6 pt-3 text-xs text-zinc-400 font-['Plus_Jakarta_Sans',sans-serif]">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Zero token sharing (OAuth2 PKCE)
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-['Geist_Mono',monospace]">14ms</span> gateway response
            </span>
          </div>
        </div>

        {/* Double-Bezel Framed Luxury Showcase Container */}
        <div className="mt-12 sm:mt-16 max-w-5xl mx-auto relative">
          {/* Subtle ambient diffuse glow behind the frame */}
          <div
            aria-hidden="true"
            className="absolute -inset-1 bg-gradient-to-r from-emerald-500/10 via-transparent to-emerald-500/5 blur-2xl -z-10 pointer-events-none"
          />

          {/* Outer Shell (Double-Bezel) */}
          <div className="ring-1 ring-white/10 bg-white/[0.02] p-1.5 sm:p-2 rounded-2xl sm:rounded-[2rem]">
            {/* Inner Core Container */}
            <div className="border border-white/10 rounded-xl sm:rounded-[1.6rem] bg-[#09090b]/90 p-2 sm:p-3 shadow-2xl shadow-black/90 ring-1 ring-white/5 backdrop-blur-md">
              {/* Top bar: clean, subdued status bar (NO traffic light dots) */}
              <div className="px-3 sm:px-4 py-2.5 mb-2 sm:mb-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 text-zinc-300 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-semibold text-white tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">Corvus AI Studio</span>
                  </div>
                  <span className="hidden sm:inline-block text-zinc-600">/</span>
                  <span className="hidden sm:inline-block text-zinc-400 font-['Geist_Mono',monospace] text-[11px] bg-white/[0.03] px-2.5 py-0.5 rounded border border-white/5">
                    corvus.ai/studio/sentinel-prime
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-['Plus_Jakarta_Sans',sans-serif]">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    100% Verified Secure
                  </span>
                </div>
              </div>

              {/* Inner image container */}
              <div className="rounded-xl overflow-hidden border border-white/5 bg-black/60 shadow-inner">
                <img
                  src="assets/images/dashboard-hero.jpg"
                  alt="Corvus AI Studio Dashboard — Real-time bot management and compilation console"
                  className="w-full h-auto object-cover block select-none"
                  loading="eager"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;