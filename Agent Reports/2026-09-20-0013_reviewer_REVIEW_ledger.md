# Task Report: overnight-0013-R-ledger
Status: SUCCESS — ledger verified on real Postgres 17; 14/14 tests, fixed 3 test bugs (0003 apply list, scale, ordering); verdict: keep ref_id uuid.
Touched: db/__tests__/0011-billing.test.ts (3 lines); 0011 SQL and v11.ts unchanged
Note: Commit test fixes before CI or gateway suite goes red; launch-blockers flake pre-existing.
