import React, { useState } from 'react';

export const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubscribed(true);
    setEmail('');
    setTimeout(() => setSubscribed(false), 3500);
  };

  return (
    <footer className="sticky bottom-0 z-0 overflow-hidden bg-black font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Ambient Blurred Artwork */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -inset-[4%]">
          <img
            src="assets/images/pryzm.design/footer3-1087a09b15.webp"
            alt=""
            className="w-full h-full object-cover opacity-40 blur-[12px]"
          />
        </div>
        <div className="absolute inset-0 bg-black/75" />
      </div>

      <div className="relative z-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pt-32 pb-20 sm:px-6 lg:flex-row lg:justify-between lg:gap-16">
          {/* Brand Info */}
          <div className="flex flex-col gap-4">
            <a href="#top" className="flex items-center gap-2.5 text-white w-fit group">
              <div className="w-8 h-8 rounded-lg bg-[#141417] border border-white/10 flex items-center justify-center text-white group-hover:border-white/30 transition-colors">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L3 9l9 7 9-7-9-7z" />
                  <path d="M5 12l7 5 7-5" />
                  <path d="M7 16l5 4 5-4" />
                </svg>
              </div>
              <span className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-lg text-white">CORVUS</span>
            </a>
            <p className="max-w-xs text-xs sm:text-sm text-zinc-400 leading-relaxed">
              The zero-code, AI-native bot development and deployment platform built for Discord communities and gaming networks.
            </p>

            <div className="mt-2 max-w-xs">
              <p className="text-xs font-medium text-zinc-300">Engineering & product release notes</p>
              <form onSubmit={handleSubscribe} className="flex w-full max-w-md items-center gap-1.5 mt-2">
                <label className="sr-only" htmlFor="footEmailInput">Email Address</label>
                <input
                  id="footEmailInput"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-9 min-w-0 flex-1 rounded-full border border-white/10 bg-[#121215] px-4 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
                <button
                  type="submit"
                  className="shrink-0 inline-flex items-center justify-center rounded-full bg-white text-black font-semibold h-9 px-4 text-xs hover:bg-zinc-200 transition-colors"
                >
                  Subscribe
                </button>
              </form>
              {subscribed && (
                <p className="text-[11px] text-emerald-400 mt-1.5 font-sans">✓ Added to developer changelog list!</p>
              )}
            </div>
          </div>

          {/* Navigation Columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-14 lg:gap-20">
            <nav aria-label="Product" className="flex flex-col gap-2.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 font-sans">Product</p>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#how-it-works">How It Works</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#features">Features</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#bento">Security Architecture</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#templates">Blueprints</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#pricing">Pricing</a>
            </nav>
            <nav aria-label="Resources" className="flex flex-col gap-2.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 font-sans">Resources</p>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#faq">Documentation</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#bento">Security Whitepaper</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#features">Discord Gateway</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#how-it-works">Pre-Flight Scanner</a>
            </nav>
            <nav aria-label="Company" className="flex flex-col gap-2.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 font-sans">Company</p>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="https://discord.com" target="_blank" rel="noopener noreferrer">Community Discord</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="https://x.com" target="_blank" rel="noopener noreferrer">X (Twitter)</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#faq">Privacy Policy</a>
              <a className="text-xs sm:text-sm text-zinc-400 transition-colors hover:text-white" href="#faq">Terms of Service</a>
            </nav>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:px-6">
          <p>© 2026 Corvus Inc. All rights reserved.</p>
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-mono text-[11px]">Gateway: 99.98% Uptime · 14ms Latency</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
