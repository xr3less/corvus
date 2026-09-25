# Task Report: testbot-giveaway-fix-r6
Status: SUCCESS — giveaway expiry poll wired; tsc 0, eslint 0, prettier clean.
Touched: MODIFIED games/index.ts (re-export start/stopGiveawayPoll), index.ts (start in ClientReady, stop in shutdown).
Note: Module-global timer is single-process only; poll ticks every 60s by design.
