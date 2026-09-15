# PROJECT STATUS

## Status: LIVE

> The top banner always reflects the current moment. Whoever finishes a task updates this. The founder is briefed in conversation, in plain language.

---

## Current state — 2026-09-15

Debt wave DONE (D-126, 8 agents): /privacy + /terms live and footer-linked (KI-006 closed); /pryzm de-quarantined, clone-pryzm deleted (KI-011 closed); dashboard live-bound via GET /api/bots with mock fallback (KI-010 closed); V1-7 progress backend (jobs table + builder queue + poll UI, model call stubbed); V1-9 supervisor (crash counter + backoff + quarantine, prod wiring open); deploy pipeline ready (compose + GHCR + SSH, needs domain + secrets + first real run). Merged: typecheck clean, gateway 143 + web 483 green, 0 failed. Founder review next.

Mock-debt wave DONE (D-124): dead buttons wired to real APIs (gallery fork/list, detail publish/rollback/invite/preflight/simulate/draft+patch, interview start/answer, rail logout), Upgrade honest-disabled, footer delinked, vote route prod-guarded. Full suite green (436+), all routes live 200. Founder review next.

- 2026-09-14 — Rail instant everywhere (D-125, L-019): gallery's bare Suspense removed after 3 falsified hypotheses; rail inline on all 5 routes incl. creation pages; production build passes; 436 green.
- 2026-09-14 — Rail font unified: rail owns its Geist import (was inheriting Geist on dashboard vs Public Sans on gallery); identical typeface on all routes; 437 green.

New-bot creation is now a ChatGPT-style chat (D-107): the circled "Your draft" card + 4-step list are out, each submit streams a metered reply (botId null) with Thinking/Retry/spent line, composer pinned at the bottom and locked open (D-109). The beam trial is removed after a no-show verdict (D-108/D-110). Both chats are real pages under one rail layout (D-118/D-119): `/dashboard/new`, `/dashboard/bots/[id]`, Auto-only composer (fake pickers deleted), no blue focus glow. 400 tests green, all routes live-verified 200. Founder review next.

---

## At a glance

| Dimension        | State                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs system      | set up (v1.3.0, all 11 docs filled 2026-09-07)                                                                                                                       |
| Strategy locked? | yes — tiers/credits/trial/ICP/scope + K2/K3 + Scale caps (D-032/D-033)                                                                                               |
| Building?        | UI bindings landed 2026-09-14 (gallery fork/list, detail publish/rollback/preflight/simulate/draft, interview, logout; D-124 wave) — next V1-7 async progress + V1-9 |
| Deployed?        | box live (provisioned), no app yet                                                                                                                                   |
| Validated?       | category yes (competitor revenue); Corvus execution — trial funnel will tell                                                                                         |

---

## Recent changes (newest first)

> Keep the last ~10 meaningful changes. Older history lives in `DECISIONS.md`.

- 2026-09-15 — Debt wave DONE (D-126): KI-006 (/privacy + /terms, footer-linked) + KI-010 (dashboard live-bound, GET /api/bots) + KI-011 (/pryzm self-contained, clone-pryzm 69 files deleted) closed; V1-7 progress backend + V1-9 supervisor built; deploy pipeline ready (Dockerfiles built + run-proven). Merged typecheck clean, gateway 143 + web 483 green, 0 failed.
- 2026-09-15 — Supervisor on duty (D-127): Gateway.relogin + start.ts wiring (audit/restart-via-vault), preservation test mutation-proven, reviewer PASS; gateway 151 + web 483 green.
- 2026-09-15 — Builder calls the real model (D-128): @corvus/ai shared lanes, worker brief-to-draft with ai_spend metering, fenced-JSON contract live-proven ($0.0035/2-behavior spec), reviewer PASS; ai 34 + gateway 162 + web 451 green.
- 2026-09-14 — Landing port DONE (D-120, KI-008 closed): `Antigravity/index.html` → production `/` (stack-pure, copy 1:1, CTAs wired, reviewer PASS, live 200; pryzm-winner retired to out-of-repo backup).
- 2026-09-14 — Hero canvas fix (L-018): `loseContext` in cleanup killed the context on StrictMode remount → line removed, gates green. Needs a FULL page reload (F5) in open tabs — hot-reload alone cannot revive the dead context.
- 2026-09-14 — Bots list split (D-121): `/dashboard/bots` is its own page (moved verbatim), home keeps overview only, `?view=bots` redirects, 402 tests green, all routes live 200.
- 2026-09-14 — Gallery cards match landing (D-122, reviewer PASS): tile + pills + chips + Fork/Forked, behavior/copy untouched, `/gallery` live 200.
- 2026-09-14 — Gallery rail fix: stale `/dashboard#bots`/`/dashboard#home` hrefs → real routes (`/dashboard/bots`, `/dashboard`); remaining home anchors verified present; 402 green.
- 2026-09-14 — Rail unified (D-123, reviewer PASS): one shared `dashboard-rail` for dashboard + gallery (local copies deleted, icon-centering bug fixed); served menu byte-identical on all 3 routes; 407 green.

- 2026-09-13 — Dashboard sadeleştirme ve sekmeli mimari (D-091): Kurucunun sol menü görsel referansı birebir uygulandı (`My server` + `Pro`, 7 temiz sekme). Ekrana yığılan teknik jargonlar ve formüller silindi, tek sayfa kalabalığı 7 ferah görünüme bölündü; bağımsız denetçi PASS (8/8 test).
- 2026-09-13 — Dashboard Scraphe mimarisiyle yeniden inşa edildi (D-090): Scraphe projesinin düzeni uygulandı (D-091 ile sadeleştirilerek geliştirildi).
- 2026-09-13 — Demo ilerleme SÖKÜLDÜ (D-106): kurucu reddetti (yanlış yer + çirkin); statik listeye dönüldü, dosya silindi; gerçek-zamanlı sohbet sağlam.
- 2026-09-13 — Gerçek-zamanlı sohbet (D-105): thinking→akan cevap, persona hattı, sayaç bağlı; 384 PASS. Canlı deneme giriş ister.
- 2026-09-13 — BuildProgress (D-104): düşünme animasyonu + Queued→Live fazlar (demo sürücülü, örnek işaretli); 58 test PASS; bakış sende.
- 2026-09-13 — New-bot fullscreen (D-103): liste sade + tam-ekran üretim penceresi + gönder-taslak düzeltmesi; 59 test PASS; bakış sende.
- 2026-09-13 — Creation Bolt-anatomisi (D-102): büyük ortalı composer + isimsiz model + adımsız sahte kontrol yok; 47 test PASS; bakış sende.
- 2026-09-13 — Bots ayrı görünüm (D-101): büyük composer + liste; gönder → boş üretim sayfası; 43 test PASS; bakış sende.
- 2026-09-13 — Bot kartları Recent ritmi (D-100): medya kutusu + zaman + Open/Activity/Pre-flight menüsü; 37 test PASS; bakış sende.
- 2026-09-13 — V1-7 kısmi DONE (D-099): bot-açıklayıcı + aktivite akışı (22/22 canlı), review PASS. Açık: async builder ilerlemesi.
- 2026-09-13 — V1-3 publish/rollback backend DONE (D-098): rotalar + Red kuralı + boot + audit migration; race test 10/10; review PASS. Sırada V1-7.
- 2026-09-13 — Cleanup (D-097): 8 park rota + 15 yedek silindi (48 dosya, yedekli); clone-pryzm duruyor (KI-011).
- 2026-09-13 — Gallery Scraphe ritmi (D-096): arama + kategori hapları + kart ızgarası, fork aynı, reviewer PASS 376; bakış sende.
- 2026-09-13 — Dashboard dash-home port (D-095, app `/dashboard` — sandbox D-090…D-094 hattından ayrı): Get-started 2/4 + 3'lü bot kartları + This-week/Pre-flight, review FAIL (2 ölü düğme) → fix (chip composer'ı doldurur, Connect kaydırır) → PASS 26 test; bakış sende.
- 2026-09-13 — Component picker Faz A (D-089): `/pick` 10 input + oylar dosyada + `/pick/results`; reviewer PASS; oylar sıfırlandı, kurucu seçimi bekleniyor.
- 2026-09-13 — Dashboard ref-rhythm rebuild (D-088): founder refs left-aligned grid (4 stats + Today/Pre-flight + Your bots + templates), reviewer PASS 358, live 200; taste verdict open.
- 2026-09-13 — Dashboard taste verdict (D-087, L-016): ortalanmış sade ev kurucu gözüyle reddedildi (kategoriler isteniyor, ortalama istenmiyor); yeni yön açık, bu gece yapım yok.
- 2026-09-13 — Dashboard sparse rebuild (D-086): yoğun 3 bölme kalktı, rakip ritmi geldi (sade ev + ayrı detay); full web 355 passed + reviewer PASS, canlı doğrulandı; yedek `page.backup-pre-sparse-2026-09-13.*`.
- 2026-09-13 — Dashboard IA restructure (D-085): 20 rakip görselden çıkarılan harita uygulandı (gruplu menü + sekmeli detay + sıralama + Görüşme botun içine); 20/20 test + reviewer PASS, canlı /dashboard doğrulandı; yedek `page.backup-2026-09-13.*` alındı.
- 2026-09-12 — UX dalgası (5 yol, 7 önizleme `ux-*`): hepsi render-doğrulamalı görüldü; kazanan desenler kilitlendi (Today cümlesi + aciliyet sırası + harcama-öncesi ücret + cause→fix→proof); port başladı (önce Today+aciliyet).
- 2026-09-12 — Scraphe çalıntıları (`steal-detail/templates.html`, 35 ekran/5 ajan): yayın-cümlesi + ücret-dürüstlüğü + sonuç-satırı desenleri; uydurma 3. kontrol satırı yakalanıp gerçek amber satırla değiştirildi; render doğrulandı.
- 2026-09-12 — Sade set birleşti (5 sayfa: plain-bots/detail/interview/settings + templates-simple, 4 menü; Activity/Pre-flight detaya gömüldü, Settings'e gerçek plan kartları): hepsi render-doğrulandı, açıklama kesilmeleri temizlendi.
- 2026-09-12 — Create-chat önizlemesi (`Antigravity/create-chat.html`): ayrı bot-oluşturma penceresi (ortada sohbet + çipler, yanda dürüst özet + adımlar); render doğrulandı.
- 2026-09-12 — Sade Templates önizlemesi (`Antigravity/templates-simple.html`): kurucunun çizimi birebir (menü + arama + tek tip 8 kart, gerçek isimler, çipler açıklamadan); kategori tekrarı temizlendi; render doğrulandı.
- 2026-09-12 — Dashboard full-token sweep: pill/dot/card/row/nav/field/tray/send/meter/grays all match `Antigravity/dashboard.html` 1:1 across the whole route (D-068); copy/logic unchanged, tabs/upgrade untouched; typecheck + lint + 7/7 tests green, review PASS.
- 2026-09-12 — Dashboard Sentinel style port: detail header + Trial pill + header buttons match `Antigravity/dashboard.html` tray/amber/8px tokens 1:1 (D-068); copy/logic unchanged; typecheck + lint + 7/7 dashboard tests green, independent review PASS.

- 2026-09-12 — App dashboard cleanup (D-084): real Lucide rail icons (empty boxes out), glass feather-masks deleted (ghosted buttons fixed); 7/7 tests + typecheck + lint green.
- 2026-09-12 — Dashboard lead change (D-083): app dashboard (`apps/web/app/dashboard`, localhost:3000) is the lead; dated backups in-folder, typecheck green; sandbox dashboards parked.
- 2026-09-12 — dashboard.html rebuilt on app 3-pane shell (D-082, backup kept): rail + bot list + ambient detail from localhost dashboard; content flattened (no nested cards, marquee → calm grid, static checklist); contest a/b files untouched.
- 2026-09-12 — Dashboard verdict (D-081): B wins as lead, C deleted (bytes in dated backup, no git yet), A parked until B locks.
- 2026-09-12 — Dashboard 3-track contest done (D-080): dashboard-a/b/c.html all PASS independent review (tokens, honesty, no fake controls); taste verdict open, losers deleted at verdict.
- 2026-09-12 — Dashboard sandbox live (`Antigravity/dashboard.html`, D-079): sidebar + onboard checklist + stats + bot table/tabs + capability carousel + 2-row ideas marquee; example-marked, zero fake controls; port wiring tracked as KI-010.
- 2026-09-12 — Bento block 2 panel restyled (D-078): fake stats → "overnight update" event list, no numbers left; real screenshots later with V1 UI.
- 2026-09-12 — Template cards restyled (D-077, backup pre-tiles kept): supabase hotlinks out, inline Discord-mark tiles in; fake "Online" pills → "Template"; real art later with real templates.
- 2026-09-12 — Antigravity honesty follow-up DONE (D-076, backup `Antigravity/index.backup-2026-09-12.html`): KI-009 closed + 9 same-class finds fixed (sahte sayaçlar, 200-kredi hatası, Annual düğmesi, sahte newsletter, ölü linkler, mojibake); yasaklı-kalıp taraması TEMİZ; 1304 → 1221 satır. Sign-in linkleri portta bağlanacak (KI-008).
- 2026-09-12 — Antigravity landing cleanup wave DONE (D-075): sahte 10 testimonial + fake trust strip + newsletter form + #features Tailark carousel + #cta "60 Seconds Away" + footer sahte uptime söküldü; bento Vercel-rhythm 3 bloğa non-coder kopyayla yeniden yazıldı ("Your server. Your bot. No surprises." / "Always on. Always remembered." / "Describe it. We build it."); sayfa 7 → 5 bölüm; 7 nav linki #features→#bento; L-015 eklendi (ICP voice ≠ reference voice). KI-008 + KI-009 açık.
- 2026-09-11 — Dashboard prototipi canlı (`/proto-dashboard` park rota: yalıtımlı Tailwind, preflight yok, 6 paket; izolasyon kanıtlı; reviewer PASS, ci exit 0)
- 2026-09-11 — Koyu düğme sisteme girdi (flow-cta değerleri `04` + stil sayfasında örnek; 9/9 tutuyor; reviewer PASS, ci exit 0)
- 2026-09-11 — Stil sayfası canlı (`/design-language` park rota: 04'ün örnekli hali, 20/20 değer tutuyor; reviewer PASS, ci exit 0)
- 2026-09-11 — Tasarım dili dosyalandı (`04` lead snapshot: ölçülen token/yazı/ritim, DRAFT kalıyor)
- 2026-09-11 — Gerçek fiyatlar yayında (D-072: Trial/$0-Pro/$10-Studio/$29 Codehagen ritminde, Pryzm $9/$81 gitti; reviewer PASS, ci exit 0)
- 2026-09-11 — Zemin tek parça siyah (D-071: 4 bant hero tokenına, kartlar kontrastını korudu; reviewer PASS, ci exit 0)
- 2026-09-11 — Hero birebir ölçülerde (D-070: gerçek koddan 41 değer çıkarıldı, 41/41 uygulandı, sıfır kopya bayt; reviewer PASS, ci exit 0)
- 2026-09-11 — Efferd hero `/pryzm`'de canlı (D-069 ilk kürasyon işi: rozet + H1 + çift buton + dashboard paneli, Corvus metni, sıfır yeni bağımlılık; reviewer PASS, ci exit 0)
- 2026-09-11 — Tasarım yöntemi kilitlendi (D-068: sen seçiyorsun, ben birebir yapıyorum; yapay tat denemesi yok; ders L-014)
- 2026-09-11 — `/pryzm-light` silindi (D-067 founder emri; referans yok, ci exit 0; `/pryzm-backup` duruyor)
- 2026-09-11 — Açık tema denemesi (D-066: `/pryzm` dondurulup `/pryzm-backup` oldu + yeni `/pryzm-light` açık zemin/nokta dokulu/beyaz parlamalı; reviewer PASS, merged ci exit 0)
- 2026-09-11 — `/pryzm` H1 dönen kelimeli (D-065 animated-hero uyarlaması: bot/moderator/welcomer/guardian, saf CSS, sıfır bağımlılık; reviewer PASS, merged ci exit 0)
- 2026-09-11 — `/pryzm` hero sade (D-064 founder verdict: collage silindi, düz siyah zemin + ortalı blok; reviewer PASS, merged ci exit 0; `/pryzm-panel` parkta duruyor)
- 2026-09-11 — Hero arka plan iki kol (D-063: A=`/pryzm` CSS dokulu collage, B=park `/pryzm-panel` ürün panelli; ikisi de reviewer PASS, merged ci exit 0 — karar için ekran bakılacak)
- 2026-09-11 — `/pryzm` hero saa-s ritminde (D-062: ortalı rozet + degrade H1 + tek CTA, Corvus metni, collage aynen; reviewer PASS, merged ci exit 0)
- 2026-09-10 — Dark nav prototype `/proto-nav` live (D-050: 4-agent rank wave → fused login+sections+edges, MIT-noticed, 229 green, live 200)
- 2026-09-10 — Proto-snippet `/proto-snippet` live (D-051: ui-cnippet 6 parça CSS Modules'a uyarlandı, yeni bağımlılık yok, reviewer PASS, `/` değişmeden 200)
- 2026-09-10 — Proto-snippet wave2 live (D-052: +tabs/carousel/dialog/tooltip/progress + CSS motion, 11/11 tests, reviewer PASS, `/` değişmeden 200)
- 2026-09-10 — Proto-snippet wave3 live (D-053: Downloads dili — dock nav, prompt hero, bento, sekmeli SSS, pricing toggle; 16/16 tests, reviewer PASS, `/` değişmeden 200)
- 2026-09-10 — Fresh `/proto-landing` live (D-054: header + prompt hero + marquee + bento + pricing + FAQ, sign-in excluded; CSS `*` 500'ü fixlendi L-013; 15/15 tests, reviewer PASS, `/` + `/proto-snippet` değişmeden 200)
- 2026-09-10 — `/proto-landing` hero hero-01 oldu (D-055: mesh + blob + dev başlık + 2 hap, prompt #preview'e taşındı; 17/17 tests, reviewer PASS, 3 sayfa 200)
- 2026-09-10 — `/proto-pryzm` portu live (D-056: collage + preview mock + flow + 8-grid + pricing + FAQ, özgün görsel/yazı; 21/21 tests, reviewer PASS, 4 sayfa 200)
- 2026-09-11 — `/proto-pryzm` doku boyası live (D-057: 6 gözle-görülmüş CSS dokusu, hasat bayt sıfır; 26/26 tests, reviewer PASS, 4 sayfa 200)
- 2026-09-11 — Birebir klon `/clone-pryzm/pryzm-clone.html` live (D-058 founder override: 68 dosya baytı-baytına, geçici referans, karantina işaretli; sayfa+assetler 200)
- 2026-09-11 — Gerçek Next.js `/pryzm` rotası live (D-059: 1:1 dönüşüm, lenis npm'den, 15/15 tests, reviewer PASS; statik klon tat kararına kadar duruyor)
- 2026-09-11 — `/proto-landing` hero saa-s ritminde (D-060: rozet + degrade H1 + tek CTA + CSS panel; 19/19 tests, reviewer PASS, 5 rota 200)
- 2026-09-10 — Parked routes deleted (8 dirs, D-048) + avatar proof pill live on `/` (D-049, 224 tests green, live 200)
- 2026-09-10 — Pryzm winner promoted to `/` (D-047, vercel dropped, 232 tests green, live 200/200)
- 2026-09-09 — Discord Phase B DONE (token valid, installed, vault-sealed, full scan loop completed: 5 green + 1 honest red with fix; D-041)
- 2026-09-09 — Live verification DONE (box PG17: migrations/seed/full CI; launch-blockers 4/4 on box; wiro $0.007 metered loop match=true; 4 findings closed; D-040)
- 2026-09-09 — V1-5 DONE as prototype backend (3 builders + reviewer 046 + 1-line fix; live CI 386 green incl. launch-blockers 4/4; D-044)
- 2026-09-09 — V1-4 DONE (5 builders + fleet research + 2 reviewers PASS; custody locked D-038; merged ci green; D-039)
- 2026-09-09 — V1-6 DONE (T-seed + T-fork + reviewer PASS 034; seed --check 8/8; merged ci green; D-037)
- 2026-09-09 — V1-2 backend DONE (4 builders + 2 reviewers PASS; KI-002 closed; F2 closed with real parseSpec; merged ci green from dist-less tree; D-036)
- 2026-09-09 — Open-doors wave DONE (K2/K3 + Scale + app-owned trial locked D-032…D-034; KI-001 closed + gates hardened + git init D-035; merged ci green; V1-2 SPEC filed)
- 2026-09-09 — V1-1 DONE + bound (OAuth/invite/interview/session-bind; merged ci green 111/111 with live DB; reviewers PASS 0140/0141/0142; D-031)
- 2026-09-09 — Founder rejected Wave B mock screens wholesale (taste) → frontend deferred until backend wired; redesign needs his reference sites first (L-007)
- 2026-09-09 — V1-8 DONE (Wave C blockers 4/4 on live PG:17, merged ci green 2x with DB 48/48, Wave A debt closed 0121, D-030)
- 2026-09-09 — Wave B merged gate GREEN x3 (db+store+gateway+screens; 44/44 tests; ESM/finally/prettier class-fix, D-029; reviewers PASS)
- 2026-09-09 — Wave A merged gate GREEN x2 (skeleton + spec contract + UI primitives; 23/23 tests; workspace-delegated CI fix)
- 2026-09-08 — Golden eval ROUND 4: GLM 5.2 7/7 expert PASS ($0.0489; D-026 builder primary single, persona grok, Flash after balance) → `Marketing/corvus-eval-round4-2026-09-08.md`
