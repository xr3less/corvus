# Already-open product debt (not new in the 2026-09-19 audit)

These were Open before the audit. Confirmed still real. Canonical rows: `Docs/KNOWN_ISSUES.md`.

| ID     | Still real?       | One line                                                                                                                                                                                                                                      |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KI-015 | Yes               | Builder sync write proven on fake pool only — not live PG generate/sync.                                                                                                                                                                      |
| KI-016 | Yes               | `support@corvus.ai` is an assumption. No `/dpa` route. Required before paid launch.                                                                                                                                                           |
| KI-017 | Yes               | Supervisor/relogin proven against fakes only. Needs fleet token + deploy.                                                                                                                                                                     |
| KI-018 | Yes — **amended** | App **is live** at `https://13-140-181-113.nip.io/` (D-136). Stays Open because the deploy is not reproducible from committed git (box-local Dockerfile patch; dirty wave uncommitted; live 5432 still public). “Needs domain” remains false. |
| KI-019 | Open, amended     | Explore agent reported full-tree eslint exit 0 after ignores. Orchestrator did not re-run the gate. Five prettier-excluded files still red by design. Close only after a named `npm run lint` + `npm run format` on HEAD.                     |
| KI-024 | Partial           | CI postgres:17 proven (KI-028). Live Discord + first-stranger build still unproven.                                                                                                                                                           |

Resolved-but-docs-still-talk-as-open (fixed in living files 2026-09-19; numbered 07 still stale — KI-031): KI-010, KI-011, KI-014, KI-025/026/027.
