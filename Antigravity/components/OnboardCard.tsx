import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck, ArrowRight, Server, RefreshCw } from 'lucide-react';

export const OnboardCard: React.FC = () => {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [selectedServer] = useState('Developers & Gaming Guild');
  const [characterTone, setCharacterTone] = useState<'balanced' | 'strict' | 'friendly'>('balanced');
  const [isSimulatingPreflight, setIsSimulatingPreflight] = useState(false);

  const handleRunPreflight = () => {
    setIsSimulatingPreflight(true);
    setTimeout(() => {
      setIsSimulatingPreflight(false);
    }, 600);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] shadow-2xl overflow-hidden transition-all font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Window Titlebar */}
      <div className="px-4 py-3 bg-[#121215] border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 inline-block"></span>
          <span className="ml-2 text-xs font-medium text-zinc-300 font-sans">Corvus Forge UI — Bot Deployment Console</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Live Gateway Ready
          </span>
        </div>
      </div>

      {/* Interactive 3-Step Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-white/10 bg-[#09090b]">
        {/* Step 1 */}
        <button
          type="button"
          onClick={() => setActiveStep(1)}
          className={`text-left p-3.5 sm:p-4 border-b sm:border-b-0 sm:border-r border-white/10 transition-colors flex items-center justify-between group ${
            activeStep === 1 ? 'bg-white/[0.06]' : 'hover:bg-white/[0.02]'
          }`}
        >
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-sans font-semibold">Step 01</div>
            <div className={`text-xs sm:text-sm font-semibold mt-0.5 ${activeStep === 1 ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
              Guild Selection
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Connected · #general-chat</div>
          </div>
          <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs shrink-0 font-bold">
            ✓
          </span>
        </button>

        {/* Step 2 */}
        <button
          type="button"
          onClick={() => setActiveStep(2)}
          className={`text-left p-3.5 sm:p-4 border-b sm:border-b-0 sm:border-r border-white/10 transition-colors flex items-center justify-between group ${
            activeStep === 2 ? 'bg-white/[0.06]' : 'hover:bg-white/[0.02]'
          }`}
        >
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-sans font-semibold">Step 02</div>
            <div className={`text-xs sm:text-sm font-semibold mt-0.5 ${activeStep === 2 ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
              Persona & Rules
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">AI compiling rules...</div>
          </div>
          <span className="w-5 h-5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-xs shrink-0 font-bold">
            2
          </span>
        </button>

        {/* Step 3 */}
        <button
          type="button"
          onClick={() => setActiveStep(3)}
          className={`text-left p-3.5 sm:p-4 transition-colors flex items-center justify-between group ${
            activeStep === 3 ? 'bg-white/[0.06]' : 'hover:bg-white/[0.02]'
          }`}
        >
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-sans font-semibold">Step 03</div>
            <div className={`text-xs sm:text-sm font-semibold mt-0.5 ${activeStep === 3 ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
              Security Pre-Flight
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">100/100 Health Score</div>
          </div>
          <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs shrink-0 font-bold">
            ★
          </span>
        </button>
      </div>

      {/* Step Content Panels */}
      <div className="p-5 sm:p-7 min-h-[340px] flex flex-col justify-between">
        {/* Step 1: Server Selection Preview */}
        {activeStep === 1 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/40 flex items-center justify-center text-white font-bold text-sm">
                  <Server className="w-5 h-5 text-[#5865F2]" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white font-sans">Target Discord Guild</h4>
                  <p className="text-xs text-zinc-400 font-sans">Securely authorized via OAuth2 PKCE handshake</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-sans">
                ● Authorized (OAuth2 PKCE)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-[#141417] border border-white/10">
                <span className="text-[11px] text-zinc-500 font-sans">Selected Guild:</span>
                <p className="text-sm font-semibold text-white mt-1 flex items-center justify-between">
                  <span>{selectedServer}</span>
                  <span className="text-xs text-zinc-400 font-normal">1,420 members</span>
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Target Channel: <span className="text-white font-mono">#general-chat</span></span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141417] border border-white/10">
                <span className="text-[11px] text-zinc-500 font-sans">Permissions & Access Boundary:</span>
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-zinc-300">
                    <span>Read & Send Messages</span>
                    <span className="text-emerald-400 font-sans font-semibold text-[10px]">GRANTED</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-300">
                    <span>Manage Roles (Below Bot)</span>
                    <span className="text-emerald-400 font-sans font-semibold text-[10px]">GRANTED</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>Administrator (Elevated)</span>
                    <span className="text-emerald-400 font-sans font-semibold text-[10px]">NOT REQUESTED (SAFE)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
              <p className="text-xs text-zinc-400 font-sans">
                No manual token handling required. Bot deploys directly via Discord API v10.
              </p>
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors shrink-0 ml-3 font-sans"
              >
                <span>Proceed: Rules</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Character & Rules Interview */}
        {activeStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/15 flex items-center justify-center text-white font-bold text-xs">
                  C
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white font-sans">Corvus Studio Interview</h4>
                  <p className="text-[11px] text-zinc-400 font-sans">Configure your bot's behavior in private studio without spamming guild members</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {(['strict', 'balanced', 'friendly'] as const).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setCharacterTone(tone)}
                    className={`px-2.5 py-1 rounded-md text-[11px] transition-colors font-medium font-sans ${
                      characterTone === tone
                        ? 'bg-white text-black'
                        : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
                    }`}
                  >
                    {tone === 'strict' ? 'Strict Moderator' : tone === 'balanced' ? 'Balanced Mod' : 'Helpful Assistant'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#141417] border border-white/10 text-zinc-300">
                <div className="text-[10px] font-sans font-semibold text-indigo-400 mb-1">CORVUS AI:</div>
                "Which rules should we activate for your guild? Shall we enable anti-spam filters, dynamic welcome embeds, and the XP chat economy?"
              </div>

              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/15 text-zinc-200 ml-4">
                <div className="text-[10px] font-sans font-semibold text-zinc-400 mb-1">GUILD OWNER (YOU):</div>
                "Yes, delete spam and invite links immediately with a 5-minute timeout. Assign @Community to newcomers and reward active chatters with XP."
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-between">
                <span className="text-[11px] font-sans font-medium">✓ Rules successfully compiled into 'behavior-spec.json'</span>
                <span className="text-[10px] font-mono text-zinc-400">14ms</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="text-xs text-zinc-400 hover:text-white transition-colors font-sans"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors font-sans"
              >
                <span>Proceed: Pre-Flight Audit</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Safe Permissions Pre-flight Scan */}
        {activeStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white font-sans">Pre-Flight Health & Security Audit</h4>
                  <p className="text-[11px] text-zinc-400 font-sans">Role hierarchy order, channel boundary restrictions, and permission conflict analysis</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunPreflight}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white bg-[#141417] border border-white/10"
                  title="Rescan Permissions"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSimulatingPreflight ? 'animate-spin' : ''}`} />
                </button>
                <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded">
                  100 / 100 Score
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#141417] border border-white/10 space-y-2">
                <div className="font-semibold text-white flex items-center gap-1.5 font-sans">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Role Hierarchy Verified</span>
                </div>
                <p className="text-zinc-400 text-[11px] font-sans">
                  Corvus Bot role is safely positioned above @Community and @Muted roles. Zero permission collisions detected.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#141417] border border-white/10 space-y-2">
                <div className="font-semibold text-white flex items-center gap-1.5 font-sans">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Least Privilege (Zero Admin)</span>
                </div>
                <p className="text-zinc-400 text-[11px] font-sans">
                  Bot never requests Administrator permissions. Zero server destruction or credential exposure risk.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#141417] border border-white/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-sans">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-zinc-300">Status: <span className="text-white font-medium">Ready for Deployment</span></span>
                <span className="text-zinc-500 font-mono text-[11px]">· 14ms Latency</span>
              </div>
              <a
                href="#pricing"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-400 text-black font-semibold text-xs hover:bg-emerald-300 transition-colors font-sans"
              >
                <span>Deploy Bot to Guild & Start</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardCard;
