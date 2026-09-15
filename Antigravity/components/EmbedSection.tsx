import React from 'react';

export const EmbedSection: React.FC = () => {
  return (
    <section className="max-w-[1400px] mx-auto px-5 md:px-8 py-20 md:py-28 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="max-w-2xl">
        <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-zinc-500 mb-3 font-semibold">SOVEREIGN ARCHITECTURE</p>
        <h2 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[30px] md:text-[46px] leading-tight text-white tracking-[-0.03em]">
          Bespoke Sovereign Architecture,<br />not rented off-the-shelf bots.
        </h2>
        <p className="text-zinc-400 mt-4 leading-relaxed text-[15px] md:text-[16px]">
          When legacy bots disconnect from your server, your community history disappears. In Corvus, your bot is defined as a transparent <span className="text-zinc-200 font-mono">behavior-spec.json</span> file—exportable, portable, and owned entirely by your organization.
        </p>
        <a
          href="#studio"
          className="inline-flex items-center gap-1.5 mt-6 px-5 py-2.5 text-[14px] bg-transparent hover:bg-white/5 border border-white/10 hover:border-white/30 text-white rounded-full font-medium transition-colors"
        >
          Inspect in Studio <span aria-hidden="true">→</span>
        </a>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mt-10">
        {/* Left: JSON Spec Preview */}
        <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[12px] text-zinc-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> behavior-spec.json
            </span>
            <span className="font-sans text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">OPEN SCHEMA v2.1</span>
          </div>
          <pre className="font-mono text-[12.5px] leading-relaxed text-zinc-300 overflow-x-auto p-4 rounded-xl bg-black/60 border border-white/5"><code>{`{
  "$schema": "https://corvus.bot/schema/v2.json",
  "bot": {
    "name": "Corvus Guardian",
    "model": "glm-5.2-flash",
    "triggers": [
      {
        "type": "antispam",
        "action": "timeout",
        "duration_seconds": 300
      },
      {
        "type": "leveling",
        "xp_per_msg": 15
      }
    ],
    "persistence": {
      "engine": "postgres_acid",
      "zero_loss": true
    }
  }
}`}</code></pre>
          <p className="text-[13px] text-zinc-400 mt-4 leading-relaxed font-sans">
            Your bot compiles into an open, deterministic specification. Zero proprietary lock-in or hidden dependencies.
          </p>
        </div>

        {/* Right: Discord Client Frame */}
        <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl overflow-hidden relative min-h-[340px] flex flex-col justify-between p-6">
          <img
            src="assets/images/pryzm.design/signin-f20ce09ebb.webp"
            alt="Live Discord Bot Interface"
            className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
            loading="lazy"
          />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-black/80 border border-white/15 rounded-full px-3 py-1 text-[11px] text-emerald-400 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono">Gateway Live · 14ms Latency</span>
            </div>
            <h3 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-2xl text-white mt-4 tracking-tight">Discord API v10 Native</h3>
            <p className="text-[13px] text-zinc-300 mt-2 max-w-sm font-sans">
              Connects seamlessly via Discord OAuth2 scoped authorization. Zero token sharing, instant server dispatch.
            </p>
          </div>
          <div className="relative z-10 mt-8">
            <div className="p-3.5 rounded-xl bg-black/80 border border-white/10 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs">
                  ✓
                </div>
                <div>
                  <p className="text-xs font-semibold text-white font-sans">Pre-Flight Audit Score</p>
                  <p className="text-[11px] text-zinc-400 font-sans">Role hierarchy 100% conflict-free</p>
                </div>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">100 / 100</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EmbedSection;
