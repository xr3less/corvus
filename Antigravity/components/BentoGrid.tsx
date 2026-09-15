import React from 'react';
import { Shield, Key, Activity, HardDrive, Terminal, Server, Check, X } from 'lucide-react';

export const BentoGrid: React.FC = () => {
  return (
    <section id="bento" className="py-20 md:py-28 border-b border-white/10 bg-black font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-12 space-y-3">
          <h2 className="font-['Plus_Jakarta_Sans',sans-serif] text-3xl sm:text-4xl font-semibold text-white tracking-tight">
            Enterprise-Grade Security Architecture
          </h2>
          <p className="text-zinc-400 text-base leading-relaxed">
            Built from first principles to protect your community from unauthorized takeovers and privilege escalation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Least Privilege Scoping - span 2 */}
          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-[#0c0c0e] p-6 sm:p-8 flex flex-col justify-between hover:border-white/20 transition-colors">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#141417] border border-white/10 flex items-center justify-center text-white">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] text-xl font-semibold text-white">
                Least Privilege Scoping
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                Traditional bots take the lazy shortcut and demand full "Administrator" permissions. Corvus strictly adheres to least-privilege scoping, generating precise granular bitwise permission flags tailored only to declared tasks.
              </p>
            </div>

            {/* Comparison strip */}
            <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/20">
                <div className="font-semibold text-red-400 flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5" />
                  Traditional Bots
                </div>
                <div className="text-zinc-400 text-[11px] mt-1.5 leading-relaxed">
                  Requires Administrator privileges. If the bot token is compromised or leaked, your entire server can be wiped.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Corvus Architecture
                </div>
                <div className="text-zinc-400 text-[11px] mt-1.5 leading-relaxed">
                  Strictly scoped message reading and moderation bitmasks. Zero server-wipe or unauthorized takeover risk.
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Zero Token Sharing - span 1 */}
          <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-6 sm:p-8 flex flex-col justify-between hover:border-white/20 transition-colors">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#141417] border border-white/10 flex items-center justify-center text-white">
                <Key className="w-5 h-5 text-zinc-300" />
              </div>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] text-xl font-semibold text-white">
                Zero Token Sharing
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Never copy-paste raw bot tokens or client secrets into insecure third-party web forms. Direct OAuth2 PKCE handshake authenticates directly with Discord.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="inline-flex items-center gap-2 text-xs text-zinc-300 bg-[#141417] px-3 py-2 rounded-xl border border-white/10 w-full">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>OAuth2 PKCE Handshake · Zero Exposure</span>
              </div>
            </div>
          </div>

          {/* Card 3: Self-Healing Gateway - span 1 */}
          <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-6 sm:p-8 flex flex-col justify-between hover:border-white/20 transition-colors">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#141417] border border-white/10 flex items-center justify-center text-white">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] text-xl font-semibold text-white">
                Self-Healing Gateway
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                High-frequency reconnect daemon intercepts WebSocket socket drops and automatically resyncs gateway events in under 350ms.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Gateway Response:</span>
                <span className="text-emerald-400 font-semibold font-['Geist_Mono',monospace]">14ms · Failover &lt; 350ms</span>
              </div>
            </div>
          </div>

          {/* Card 4: Persistent ACID Database - span 2 */}
          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-[#0c0c0e] p-6 sm:p-8 flex flex-col justify-between hover:border-white/20 transition-colors">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#141417] border border-white/10 flex items-center justify-center text-white">
                <HardDrive className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] text-xl font-semibold text-white">
                Persistent ACID Database
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                Generic bots store state in volatile memory, losing user streaks and XP upon reboots. Every Corvus bot is backed by an isolated Postgres instance with automated point-in-time recovery.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-[#141417] border border-white/10">
                <div className="text-[10px] text-zinc-500 font-medium">XP & Level Ranks</div>
                <div className="text-xs font-semibold text-white mt-1">ACID Ledger</div>
              </div>
              <div className="p-3 rounded-xl bg-[#141417] border border-white/10">
                <div className="text-[10px] text-zinc-500 font-medium">Ticket History</div>
                <div className="text-xs font-semibold text-white mt-1">Encrypted Archive</div>
              </div>
              <div className="p-3 rounded-xl bg-[#141417] border border-white/10">
                <div className="text-[10px] text-zinc-500 font-medium">Custom Commands</div>
                <div className="text-xs font-semibold text-white mt-1">Schema Validated</div>
              </div>
              <div className="p-3 rounded-xl bg-[#141417] border border-white/10">
                <div className="text-[10px] text-zinc-500 font-medium">Daily Snapshots</div>
                <div className="text-xs font-semibold text-white mt-1">Zero Data Loss</div>
              </div>
            </div>
          </div>

          {/* Card 5: Deterministic Logic Compilation - span 1 */}
          <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-6 sm:p-8 flex flex-col justify-between hover:border-white/20 transition-colors">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#141417] border border-white/10 flex items-center justify-center text-white">
                <Terminal className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] text-xl font-semibold text-white">
                Deterministic Logic Compilation
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Natural language prompts compile into deterministic JSON state machines, guaranteeing predictable behavior without runtime hallucinations.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="inline-flex items-center gap-2 text-xs text-zinc-300 bg-[#141417] px-3 py-2 rounded-xl border border-white/10 w-full">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Formal Grammar Verification</span>
              </div>
            </div>
          </div>

          {/* Card 6: Multi-Guild Central Dispatch - span 2 */}
          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-[#0c0c0e] p-6 sm:p-8 flex flex-col justify-between hover:border-white/20 transition-colors">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#141417] border border-white/10 flex items-center justify-center text-white">
                <Server className="w-5 h-5 text-sky-400" />
              </div>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] text-xl font-semibold text-white">
                Multi-Guild Central Dispatch
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                Synchronize rules, command schemas, and staff permissions across multiple guild servers simultaneously from a single unified control plane.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-zinc-400">Manage hundreds of guild instances without configuration drift</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                <Check className="w-3.5 h-3.5" />
                Centralized Multi-Tenant Routing
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BentoGrid;
