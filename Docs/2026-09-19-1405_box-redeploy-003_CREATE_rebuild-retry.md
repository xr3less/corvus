# Task Report: box-redeploy-003
Status: SUCCESS box rebuilt from 5c6c134 — 5432 CLOSED-timeout, HTTPS 200, parked guards live (4×404, /demo 200).
Touched: box Dockerfiles (checkout+pull), backups/corvus.dump 59273B, retagged web c13d1a4 313MB + gateway c88c762a 638MB, recreated web/gateway/postgres
Note: pg-backup sidecar hangs (0B) — use exec pg_dump workaround, fix service; :3000 plaintext residual live; .env 0600 never catted.
