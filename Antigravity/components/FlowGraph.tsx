import React from 'react';

export interface FlowGraphProps {
  onStartFlowClick?: () => void;
}

export const FlowGraph: React.FC<FlowGraphProps> = ({ onStartFlowClick }) => {
  return (
    <section id="flow" className="max-w-[1400px] mx-auto px-5 md:px-8 pt-20 pb-16 font-['Plus_Jakarta_Sans',sans-serif]">
      <div>
        <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-zinc-500 mb-3 font-semibold">PIPELINE ARCHITECTURE</p>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div>
            <h2 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[32px] md:text-[52px] leading-[1.05] text-white tracking-[-0.03em]">
              How your bot's brain executes
            </h2>
            <p className="text-zinc-400 mt-3 text-[16px] md:text-[18px] max-w-2xl leading-relaxed font-sans">
              From conversational English specification to low-latency Discord WebSocket gateways—a deterministic, zero-code production pipeline.
            </p>
          </div>
          <button
            onClick={onStartFlowClick}
            className="inline-flex items-center justify-center bg-[#1c1c1f] hover:bg-[#26262b] border border-white/10 hover:border-white/30 text-white rounded-full text-[14px] px-5 py-2.5 transition-colors font-medium shrink-0 font-sans"
          >
            Inspect Pipeline <span className="ml-1" aria-hidden="true">↗</span>
          </button>
        </div>
      </div>

      {/* Dotted Canvas */}
      <div className="relative mt-10 rounded-2xl border border-white/10 overflow-hidden p-6 md:p-12 min-h-[520px] bg-[#070709]"
           style={{ backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
        
        {/* SVG Flow Connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block" fill="none" aria-hidden="true">
          <path d="M 270 140 C 340 140, 370 140, 440 140" stroke="#52525b" strokeWidth="2" strokeDasharray="6 6" />
          <path d="M 680 140 C 740 140, 750 290, 810 290" stroke="#52525b" strokeWidth="2" strokeDasharray="6 6" />
          <path d="M 810 320 C 740 320, 680 430, 440 430" stroke="#52525b" strokeWidth="2" strokeDasharray="6 6" />
          <path d="M 440 430 C 750 430, 850 430, 960 430" stroke="#52525b" strokeWidth="2" strokeDasharray="6 6" />
        </svg>

        {/* Nodes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
          
          {/* Node 1: Studio Interview */}
          <div className="bg-[#111114] border border-white/10 hover:border-white/25 rounded-2xl p-5 transition-all">
            <div className="flex items-center justify-between text-[11px] font-sans">
              <span className="text-zinc-400 font-semibold uppercase">Step 01</span>
              <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-medium">INPUT</span>
            </div>
            <h3 className="font-semibold text-white text-[16px] mt-3 font-sans">Studio Interview</h3>
            <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed font-sans">
              Describe your bot's goals, role allocation logic, and conversational persona in natural language.
            </p>
            <div className="mt-4 p-3 rounded-lg bg-black/60 border border-white/5 text-[11px] text-zinc-400 font-sans">
              <p className="text-white font-medium">💬 "Timeout spam messages for 5 minutes and grant @Community to new members."</p>
            </div>
          </div>

          {/* Node 2: behavior-spec.json */}
          <div className="bg-[#111114] border border-white/10 hover:border-white/25 rounded-2xl p-5 transition-all">
            <div className="flex items-center justify-between text-[11px] font-sans">
              <span className="text-zinc-400 font-semibold uppercase">Step 02</span>
              <span className="text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-medium">CORE</span>
            </div>
            <h3 className="font-semibold text-white text-[16px] mt-3 font-sans">behavior-spec.json</h3>
            <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed font-sans">
              Conversational requirements compile into a deterministic, version-controlled JSON schema.
            </p>
            <div className="mt-4 p-3 rounded-lg bg-black/60 border border-white/5 text-[11px] font-mono text-zinc-300 overflow-x-auto">
              <code>{`{ "tone": "strict", "actions": ["timeout_300s"] }`}</code>
            </div>
          </div>

          {/* Node 3: Pre-flight Test */}
          <div className="bg-[#111114] border border-white/10 hover:border-white/25 rounded-2xl p-5 transition-all">
            <div className="flex items-center justify-between text-[11px] font-sans">
              <span className="text-zinc-400 font-semibold uppercase">Step 03</span>
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">VERIFY</span>
            </div>
            <h3 className="font-semibold text-white text-[16px] mt-3 font-sans">Pre-Flight Security Audit</h3>
            <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed font-sans">
              Scans Discord role hierarchy, channel permissions, and token isolation boundaries before joining.
            </p>
            <div className="mt-4 p-3 rounded-lg bg-black/60 border border-white/5 text-[11px] text-emerald-400 flex items-center justify-between font-sans">
              <span className="font-medium">✓ 4/4 Checks Passed</span>
              <span className="font-mono">100 / 100</span>
            </div>
          </div>

          {/* Node 4: Postgres ACID */}
          <div className="bg-[#111114] border border-white/10 hover:border-white/25 rounded-2xl p-5 transition-all">
            <div className="flex items-center justify-between text-[11px] font-sans">
              <span className="text-zinc-400 font-semibold uppercase">Step 04</span>
              <span className="text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20 font-medium">PERSISTENCE</span>
            </div>
            <h3 className="font-semibold text-white text-[16px] mt-3 font-sans">Postgres ACID Ledger</h3>
            <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed font-sans">
              Member XP records, ticket transcripts, and guild rulesets persist safely in dedicated storage.
            </p>
            <div className="mt-4 p-3 rounded-lg bg-black/60 border border-white/5 text-[11px] text-zinc-400 flex items-center justify-between font-sans">
              <span className="font-mono">Postgres ACID</span>
              <span className="text-sky-400 font-medium">Live Snapshot</span>
            </div>
          </div>

          {/* Node 5: Gateway Dispatch */}
          <div className="bg-[#111114] border border-white/10 hover:border-white/25 rounded-2xl p-5 md:col-span-2 lg:col-span-2 transition-all">
            <div className="flex items-center justify-between text-[11px] font-sans">
              <span className="text-zinc-400 font-semibold uppercase">Step 05</span>
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">DISPATCH</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-3">
              <div>
                <h3 className="font-semibold text-white text-[16px] font-sans">Live Discord Gateway Dispatch</h3>
                <p className="text-[13px] text-zinc-400 mt-1 leading-relaxed font-sans">
                  Self-healing WebSocket architecture connects directly to Discord guilds with 24/7 reliability.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-black/60 border border-white/5 text-[11px] text-zinc-300 shrink-0 font-sans">
                <p className="text-emerald-400 font-bold">● 99.98% Uptime SLA</p>
                <p className="text-zinc-500 mt-0.5 font-mono">14ms Gateway Ping</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default FlowGraph;
