import React, { useState } from 'react';

export interface NavbarProps {
  onSimulatorClick?: () => void;
  onDiscordLoginClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onSimulatorClick,
  onDiscordLoginClick,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* 4-Layer Backdrop Filter Blur Stack with Directional Gradient Masks (Pryzm technique) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 sm:h-32">
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 15%, transparent 60%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 15%, transparent 60%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 45%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 45%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-transparent" />
      </div>

      {/* Main Navbar Container */}
      <nav className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main Navigation">
        <div className="flex items-center gap-8">
          {/* Brand Logo & Version Pill */}
          <a href="#top" className="flex items-center gap-2.5 text-white group" aria-label="Corvus Home">
            <div className="w-8 h-8 rounded-lg bg-[#141417] border border-white/10 flex items-center justify-center text-white group-hover:border-white/30 transition-colors">
              {/* Corvus Raven Geometry */}
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L3 9l9 7 9-7-9-7z" />
                <path d="M5 12l7 5 7-5" />
                <path d="M7 16l5 4 5-4" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[17px] tracking-tight text-white">CORVUS</span>
              <span className="font-['Geist_Mono',monospace] text-[10px] text-zinc-400 border border-white/15 bg-white/5 rounded-full px-2 py-0.5">v2.1</span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-7 text-[13.5px] font-['Plus_Jakarta_Sans',sans-serif] text-zinc-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#bento" className="hover:text-white transition-colors">Architecture</a>
            <a href="#templates" className="hover:text-white transition-colors">Showcase</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <a
            href="#features"
            onClick={onSimulatorClick}
            className="hidden sm:inline-flex items-center justify-center bg-[#1c1c1f] hover:bg-[#26262b] border border-white/10 hover:border-white/25 text-zinc-200 hover:text-white rounded-full text-[13px] px-4 py-2 transition-colors font-['Plus_Jakarta_Sans',sans-serif] font-medium"
          >
            Interactive Demo
          </a>

          <a
            href="https://discord.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDiscordLoginClick}
            className="inline-flex items-center justify-center gap-1.5 bg-[#fafafa] hover:bg-white text-black rounded-full font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[13px] px-4 py-2 transition-colors shadow-sm"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            <span>Sign in with Discord</span>
          </a>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-10 h-10 rounded-lg bg-[#141417] border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white"
            aria-label="Toggle Menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 5h14M2 9h14M2 13h14" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="relative z-20 md:hidden border-t border-white/10 px-5 py-5 flex flex-col gap-4 text-[15px] font-['Plus_Jakarta_Sans',sans-serif] bg-black/95 backdrop-blur-xl">
          <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-zinc-200 hover:text-white">Features</a>
          <a href="#bento" onClick={() => setMobileMenuOpen(false)} className="text-zinc-200 hover:text-white">Architecture</a>
          <a href="#templates" onClick={() => setMobileMenuOpen(false)} className="text-zinc-200 hover:text-white">Showcase</a>
          <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-zinc-200 hover:text-white">Pricing</a>
          <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="text-zinc-200 hover:text-white">FAQ</a>
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="py-2.5 text-center text-[14px] bg-[#1c1c1f] text-white rounded-full border border-white/10">
              Interactive Demo
            </a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="py-2.5 text-center text-[14px] bg-white text-black font-semibold rounded-full">
              Sign in with Discord
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
