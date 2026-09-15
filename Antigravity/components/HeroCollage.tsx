import React, { useEffect, useRef } from 'react';

export interface HeroCollageProps {
  onStartStudioClick?: () => void;
  onViewFlowClick?: () => void;
}

export const HeroCollage: React.FC<HeroCollageProps> = ({
  onStartStudioClick,
  onViewFlowClick,
}) => {
  const collageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || !collageRef.current) return;

    const cards = collageRef.current.querySelectorAll<HTMLDivElement>('.collage-card');
    let isTicking = false;

    const handleScroll = () => {
      if (!isTicking) {
        isTicking = true;
        requestAnimationFrame(() => {
          isTicking = false;
          const scrollY = window.scrollY;
          cards.forEach((card) => {
            const speed = parseFloat(card.dataset.speed || '0');
            card.style.transform = `translate3d(0, ${(scrollY * speed).toFixed(1)}px, 0)`;
          });
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section className="relative overflow-hidden min-h-[920px] md:min-h-[1080px] flex flex-col justify-end bg-black">
      {/* Floating Parallax Bot Cards */}
      <div ref={collageRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* Top Row Cards */}
        <div
          className="collage-card hidden md:block"
          data-speed="-0.06"
          style={{ left: '-3%', top: '3%', width: '11%' }}
        >
          <img src="assets/images/pryzm.design/1-8a802146d6.webp" alt="" />
        </div>

        <div
          className="collage-card"
          data-speed="0.05"
          style={{ left: '15%', top: '6%', width: '12%' }}
        >
          <img src="assets/images/pryzm.design/15-5123652a60.webp" alt="Guardian Bot" />
          <div className="collage-cap font-sans">
            <p className="font-semibold text-white">Guardian Bot · Active</p>
            <p className="text-emerald-400">● Anti-Spam & Moderation</p>
          </div>
        </div>

        <div
          className="collage-card"
          data-speed="-0.03"
          style={{ left: '33%', top: '11%', width: '15%' }}
        >
          <img style={{ aspectRatio: '4/5' }} src="assets/images/pryzm.design/6-3f21c0f6c1.webp" alt="XP Economy" />
          <div className="collage-cap font-sans">
            <p className="font-semibold text-white">XP & Levels · v2.4</p>
            <p className="text-zinc-300">Chat Economy</p>
          </div>
        </div>

        <div
          className="collage-card"
          data-speed="0.07"
          style={{ left: '53%', top: '22%', width: '13%' }}
        >
          <img style={{ aspectRatio: '4/3' }} src="assets/images/pryzm.design/3-2a02a828a1.webp" alt="Support Desk" />
          <div className="collage-cap font-sans">
            <p className="font-semibold text-white">AI Support Desk</p>
            <p className="text-sky-400">● 24/7 Triage Engine</p>
          </div>
        </div>

        <div
          className="collage-card"
          data-speed="-0.05"
          style={{ left: '72%', top: '5%', width: '13%' }}
        >
          <img style={{ aspectRatio: '4/5' }} src="assets/images/pryzm.design/18-6e6d3ed328.webp" alt="Role Picker" />
          <div className="collage-cap font-sans">
            <p className="font-semibold text-white">Onboarding & Roles</p>
            <p className="text-zinc-400">Interactive Verification</p>
          </div>
        </div>

        <div
          className="collage-card hidden md:block"
          data-speed="0.04"
          style={{ right: '-3%', top: '3%', width: '10%' }}
        >
          <img style={{ aspectRatio: '3/4' }} src="assets/images/pryzm.design/19-7bfbba5e18.webp" alt="" />
        </div>

        {/* Mid Row Cards */}
        <div
          className="collage-card"
          data-speed="0.06"
          style={{ left: '14%', top: '38%', width: '11%' }}
        >
          <img style={{ aspectRatio: '1/1' }} src="assets/images/pryzm.design/10-78a1bd812a.webp" alt="Stream Notifier" />
          <div className="collage-cap font-sans">
            <p className="font-semibold text-white">Stream Notifier</p>
            <p className="text-purple-400">● Twitch & YouTube</p>
          </div>
        </div>

        <div
          className="collage-card hidden md:block"
          data-speed="-0.04"
          style={{ right: '3%', top: '31%', width: '10%' }}
        >
          <img style={{ aspectRatio: '4/5' }} src="assets/images/pryzm.design/16-249988f9bf.webp" alt="Events & Giveaways" />
          <div className="collage-cap font-sans">
            <p className="font-semibold text-white">Tournament & Loot</p>
            <p className="text-amber-400">Fair RNG Engine</p>
          </div>
        </div>

        {/* Ambient background cards */}
        <div
          className="collage-card"
          data-speed="-0.07"
          style={{ left: '38%', top: '64%', width: '13%', opacity: 0.6 }}
        >
          <img style={{ aspectRatio: '16/10' }} src="assets/images/pryzm.design/4-7bfa1dcaf8.webp" alt="" />
        </div>

        <div
          className="collage-card hidden md:block"
          data-speed="0.05"
          style={{ right: '7%', top: '60%', width: '11%', opacity: 0.75 }}
        >
          <img style={{ aspectRatio: '4/5' }} src="assets/images/pryzm.design/5-1b4a2eb530.webp" alt="" />
        </div>
      </div>

      {/* Bottom Gradient Fade */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent h-[360px] pointer-events-none" aria-hidden="true" />

      {/* Hero Typography & CTA Block */}
      <div className="relative z-10 max-w-[1400px] mx-auto px-5 md:px-8 pb-16 md:pb-20 w-full font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="max-w-3xl">
            {/* Pill Badge */}
            <p className="inline-flex items-center gap-2 text-[13px] text-zinc-200 border border-white/15 rounded-full px-4 py-1.5 bg-black/60 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">New:</span> Describe your bot in plain English, deploy in minutes
            </p>

            {/* Massive Display H1 */}
            <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[40px] sm:text-[56px] md:text-[80px] lg:text-[84px] leading-[1.02] mt-5 text-white tracking-[-0.03em]">
              Bespoke Discord bots,<br />built in minutes.
            </h1>
          </div>

          {/* Action Row */}
          <div className="md:w-[360px] md:pb-3 flex flex-col items-start">
            <p className="text-zinc-300 text-[15px] md:text-[16px] leading-relaxed">
              Stop paying recurring rental fees for rigid legacy bots. Describe your bot in our studio interview, verify in sandbox, and deploy anywhere.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={onStartStudioClick}
                className="inline-flex items-center justify-center bg-[#fafafa] hover:bg-white text-black rounded-full font-semibold text-[14px] px-6 py-3 transition-transform hover:-translate-y-0.5 shadow-sm"
              >
                Launch Studio <span className="ml-1.5" aria-hidden="true">→</span>
              </button>
              <button
                onClick={onViewFlowClick}
                className="inline-flex items-center justify-center bg-transparent hover:bg-white/5 border border-white/10 hover:border-white/30 text-white rounded-full text-[14px] px-5 py-3 transition-colors font-medium"
              >
                View Workflow <span className="ml-1 text-zinc-400" aria-hidden="true">↗</span>
              </button>
            </div>
            {/* Trust Metric Strip */}
            <div className="mt-6 flex items-center gap-4 text-[12px] text-zinc-500">
              <span className="font-mono">● 14ms Ping</span>
              <span>·</span>
              <span>Zero Token Sharing</span>
              <span>·</span>
              <span className="font-mono">99.98% SLA</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
