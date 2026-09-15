import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  name: string;
  avatarText: string;
  time: string;
  content: string | React.ReactNode;
}

export const StudioMock: React.FC = () => {
  const [toneValue, setToneValue] = useState<number>(2);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const chatLogRef = useRef<HTMLDivElement>(null);

  const toneLabels: Record<number, string> = {
    1: 'Strict & Direct Moderator',
    2: 'Balanced Community Mod',
    3: 'Helpful Support Desk',
    4: 'Playful Community Mascot',
  };

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'bot',
      name: 'Corvus Guardian',
      avatarText: 'C',
      time: 'Today 21:40',
      content: (
        <div>
          <p>Hello! I am the compiled Corvus bot for this server. Send commands in the chat below to test real-time reflexive behaviors and state transitions.</p>
          <div className="mt-2.5 p-3 rounded-lg border-l-4 border-indigo-500 bg-[#101014] border border-white/5 max-w-lg">
            <p className="text-[12px] font-semibold text-white">💡 Quick Test Commands:</p>
            <p className="text-[12px] text-zinc-400 mt-1">Click the pills below or type directly into the terminal:</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button onClick={() => triggerCommand('!rules')} className="font-mono text-[11px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded transition-colors">!rules</button>
              <button onClick={() => triggerCommand('!xp')} className="font-mono text-[11px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded transition-colors">!xp</button>
              <button onClick={() => triggerCommand('!help')} className="font-mono text-[11px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded transition-colors">!help</button>
              <button onClick={() => triggerCommand('!ticket')} className="font-mono text-[11px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded transition-colors">!ticket</button>
            </div>
          </div>
        </div>
      ),
    },
  ]);

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const triggerCommand = (cmd: string) => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      name: 'Server Owner',
      avatarText: 'YOU',
      time: `Today ${getCurrentTime()}`,
      content: cmd,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const lower = cmd.toLowerCase();
      let replyNode: React.ReactNode = null;

      if (lower.includes('!rule') || lower === 'rules' || lower.includes('!kural')) {
        replyNode = (
          <div className="p-3.5 rounded-lg border-l-4 border-amber-400 bg-[#101014] border border-white/5 max-w-md">
            <p className="font-semibold text-white text-[13px]">📜 Guild Rules</p>
            <ol className="mt-1.5 space-y-1 text-zinc-300 text-[12.5px] list-decimal list-inside">
              <li>Be respectful and constructive to all members.</li>
              <li>Unsolicited promotions, DM spam, and invite links are prohibited.</li>
              <li>Do not mention administrative staff without urgent reason.</li>
              <li>Automated mute applies immediately upon spam detection.</li>
            </ol>
          </div>
        );
      } else if (lower.includes('!xp') || lower.includes('level') || lower.includes('rank')) {
        replyNode = (
          <div className="p-3.5 rounded-lg border-l-4 border-emerald-400 bg-[#101014] border border-white/5 max-w-md">
            <p className="font-semibold text-white text-[13px]">⭐ Level & Experience Ledger</p>
            <div className="mt-2 text-[12.5px] text-zinc-300 space-y-1">
              <div className="flex justify-between"><span>Level:</span> <span className="font-bold text-white">Level 14</span></div>
              <div className="flex justify-between"><span>Total XP:</span> <span className="font-bold text-emerald-400">4,820 / 5,000 XP</span></div>
              <div className="flex justify-between"><span>Guild Rank:</span> <span className="text-amber-300 font-bold">#3 Overall</span></div>
            </div>
            <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div className="bg-emerald-400 h-full w-[86%] rounded-full" />
            </div>
          </div>
        );
      } else if (lower.includes('!yardim') || lower.includes('!help')) {
        replyNode = (
          <div className="p-3.5 rounded-lg border-l-4 border-indigo-500 bg-[#101014] border border-white/5 max-w-md">
            <p className="font-semibold text-white text-[13px]">⚡ Corvus Guardian Command Matrix</p>
            <ul className="mt-1.5 space-y-1 text-[12px] font-mono text-zinc-300">
              <li><span className="text-indigo-400">!rules</span> — Lists active guild rules</li>
              <li><span className="text-emerald-400">!xp</span> — Displays current level, XP, and guild ranking</li>
              <li><span className="text-sky-400">!ticket</span> — Generates a private triage support channel</li>
              <li><span className="text-amber-400">!status</span> — Displays gateway uptime and runtime latency</li>
            </ul>
          </div>
        );
      } else if (lower.includes('!ticket') || lower.includes('destek') || lower.includes('support')) {
        replyNode = (
          <div className="p-3.5 rounded-lg border-l-4 border-sky-400 bg-[#101014] border border-white/5 max-w-md">
            <p className="font-semibold text-sky-400 text-[13px]">🎫 Support Ticket Created</p>
            <p className="text-[12.5px] text-zinc-300 mt-1">
              Your inquiry has been opened in channel <span className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">#ticket-0482</span>. A moderator or AI triage agent will respond shortly.
            </p>
          </div>
        );
      } else {
        replyNode = (
          <p>
            Understood! I am a production bot compiled by Corvus. Received command: <em>"{cmd}"</em>. Type <strong>!help</strong> to view the active command matrix.
          </p>
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'bot',
          name: 'Corvus Guardian',
          avatarText: 'C',
          time: `Today ${getCurrentTime()}`,
          content: replyNode,
        },
      ]);
    }, 400);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const text = inputMessage.trim();
    setInputMessage('');
    triggerCommand(text);
  };

  const handleCompile = () => {
    setIsCompiling(true);
    setTimeout(() => {
      setIsCompiling(false);
    }, 1200);
  };

  return (
    <section id="studio" className="max-w-[1400px] mx-auto px-5 md:px-8 pt-8 pb-16 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0c0c0e] shadow-2xl shadow-black/80">
        {/* Mac Window Titlebar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#121215]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56] inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f] inline-block" />
            <span className="ml-3 text-[12px] font-mono text-zinc-400">corvus-studio v2.1 — [Live Sandbox Simulator]</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-emerald-400 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Gateway Connected
            </span>
            <span className="border border-white/10 rounded px-2 py-0.5 bg-white/5 font-mono">GLM 5.2 Flash</span>
          </div>
        </div>

        {/* 4-Column Grid */}
        <div className="grid md:grid-cols-[54px_260px_1fr_290px] min-h-[640px]">
          {/* Col 1: Left Icon Rail */}
          <div className="hidden md:flex flex-col items-center gap-6 py-6 border-r border-white/10 text-zinc-500 bg-[#0e0e11]">
            <button className="w-9 h-9 rounded-lg bg-white/10 text-white flex items-center justify-center" title="Studio Interview">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
            <button className="w-9 h-9 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center" title="Moderation & Filters">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </button>
            <button className="w-9 h-9 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center" title="Levels & XP Economy">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
            <button className="w-9 h-9 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center" title="Member Onboarding">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            </button>
            <button className="w-9 h-9 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center" title="Support Tickets">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </button>
          </div>

          {/* Col 2: Capabilities Panel */}
          <div className="hidden md:block border-r border-white/10 p-4 bg-[#0e0e11] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-white">Bot Capabilities</p>
              <span className="font-sans text-[10px] text-zinc-400 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">5 Active</span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Triggers active in behavior-spec.json</p>

            <div className="mt-4 space-y-2.5">
              <div className="p-2.5 rounded-xl bg-[#141417] border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-white">Spam & Link Filter</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Auto-Delete + 5m Timeout</p>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141417] border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-white">Automated Role Routing</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Grant @Community on Join</p>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141417] border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-white">Level Up Announcements</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Congratulate in #levels per 100 XP</p>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141417] border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-white">Intelligent Support Tickets</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Private channel on !ticket</p>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141417] border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-white">Rich Welcome Card</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Embed with avatar & guild rank</p>
              </div>
            </div>
          </div>

          {/* Col 3: Center Interactive Discord Chat Simulator */}
          <div className="relative bg-black flex flex-col justify-between min-h-[460px] md:min-h-[640px]">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 text-[11px] text-zinc-300 border-b border-white/10 bg-[#09090b] overflow-x-auto whitespace-nowrap">
              <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                <span className="text-white">#</span> test-sandbox
              </span>
              <span className="text-zinc-600">|</span>
              <button
                onClick={handleCompile}
                className="border border-white/10 hover:border-white/25 rounded-md px-2.5 py-1 text-zinc-300 hover:text-white transition-colors"
              >
                {isCompiling ? '✓ Compiled (1.1 cr)' : '✦ Recompile'}
              </button>
              <button
                onClick={() => setMessages([])}
                className="border border-white/10 hover:border-white/25 rounded-md px-2.5 py-1 text-zinc-300 hover:text-white transition-colors"
              >
                ⟳ Reset
              </button>
              <span className="font-mono text-[10px] text-emerald-400 ml-auto flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 14ms latency
              </span>
            </div>

            {/* Chat Messages */}
            <div ref={chatLogRef} className="p-4 md:p-6 overflow-y-auto space-y-4 flex-1 text-[13.5px]">
              {messages.map((m) => (
                <div key={m.id} className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 font-bold text-[14px] ${
                    m.sender === 'bot'
                      ? 'bg-[#18181c] border-white/15 text-white'
                      : 'bg-zinc-800 border-white/20 text-white text-xs'
                  }`}>
                    {m.avatarText}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{m.name}</span>
                      {m.sender === 'bot' && (
                        <span className="bg-[#5865F2] text-white text-[10px] font-bold px-1.5 py-0.2 rounded font-sans">BOT</span>
                      )}
                      <span className="text-[11px] text-zinc-500 font-mono">{m.time}</span>
                    </div>
                    <div className="mt-1 text-zinc-200 leading-relaxed font-sans">{m.content}</div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="px-3 py-1 text-[11px] text-zinc-400 italic flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" />
                  Corvus Guardian is preparing response...
                </div>
              )}
            </div>

            {/* Input Form */}
            <div className="p-3 md:p-4 border-t border-white/10 bg-[#0a0a0d]">
              <form onSubmit={handleSendMessage} className="relative flex items-center">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Send command to #test-sandbox (!rules, !xp, !ticket)..."
                  className="w-full bg-[#16161a] border border-white/10 rounded-xl px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors pr-20 font-sans"
                />
                <button
                  type="submit"
                  className="absolute right-2 px-3 py-1 bg-white text-black text-[12px] font-semibold rounded-lg hover:bg-zinc-200 transition-colors font-sans"
                >
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Col 4: Right Props Panel */}
          <div className="hidden md:block border-l border-white/10 p-4 text-[12px] bg-[#0e0e11] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-[13px] text-white">Bot Configuration</p>
              <span className="font-mono text-[11px] text-zinc-400">Props</span>
            </div>

            {/* Character Tone Slider */}
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-200">Character Persona</span>
                <span className="font-sans text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                  {toneLabels[toneValue]}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Strict Moderator ⟷ Helpful Assistant</p>
              <input
                type="range"
                min="1"
                max="4"
                value={toneValue}
                onChange={(e) => setToneValue(Number(e.target.value))}
                className="w-full h-1 mt-2.5 cursor-pointer accent-emerald-400"
              />
            </div>

            {/* AI Model Selector */}
            <div className="mt-6">
              <span className="font-medium text-zinc-200">AI Runtime Engine</span>
              <div className="p-2.5 mt-2 rounded-xl bg-[#141417] border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-white">GLM 5.2 Flash</p>
                  <p className="text-[10px] text-zinc-400 font-mono">Ultra-Fast Latency (14ms)</p>
                </div>
                <span className="font-sans text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5">ACTIVE</span>
              </div>
            </div>

            {/* Permissions */}
            <div className="mt-6">
              <span className="font-medium text-zinc-200">Permission Matrix (Pre-Flight)</span>
              <div className="mt-2.5 space-y-2 text-zinc-300">
                <label className="flex items-center justify-between p-2 rounded-lg bg-[#141417] border border-white/5">
                  <span className="text-[11.5px]">Manage Messages</span>
                  <input type="checkbox" defaultChecked className="rounded border-zinc-700 text-white" />
                </label>
                <label className="flex items-center justify-between p-2 rounded-lg bg-[#141417] border border-white/5">
                  <span className="text-[11.5px]">Moderate Members</span>
                  <input type="checkbox" defaultChecked className="rounded border-zinc-700 text-white" />
                </label>
                <label className="flex items-center justify-between p-2 rounded-lg bg-[#141417] border border-white/5">
                  <span className="text-[11.5px]">Manage Roles</span>
                  <input type="checkbox" defaultChecked className="rounded border-zinc-700 text-white" />
                </label>
                <label className="flex items-center justify-between p-2 rounded-lg bg-[#141417] border border-white/5 opacity-60">
                  <span className="text-[11.5px] text-zinc-400">Administrator (ADMINISTRATOR)</span>
                  <span className="text-[10px] font-mono text-red-400 font-semibold">LOCKED</span>
                </label>
              </div>
            </div>

            {/* Cost Badge */}
            <div className="mt-6 p-3 rounded-xl border border-white/10 bg-[#141417]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">Compilation Cost</span>
                <span className="font-mono text-[11px] text-zinc-200">1.1 cr / compilation</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center mt-6">
        <a href="#templates" className="text-[14px] text-zinc-300 hover:text-white transition-colors">
          Explore ready-to-deploy blueprints <span aria-hidden="true">→</span>
        </a>
      </p>
    </section>
  );
};
