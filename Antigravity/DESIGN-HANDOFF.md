# def55c3c-e823-4339-a625-84567c17477c implementation handoff

This archive is the source of truth for turning the design into production code. Start from `pryzm-clone.html`, then preserve the visual system, responsive behavior, and interactions found in the exported files.

## Implementation target
- Build production UI from the exported design, not a loose reinterpretation.
- Preserve typography scale, spacing rhythm, color tokens, border radii, shadows, motion timing, and component states.
- Replace static placeholders only when the target app has real data or functional equivalents.
- Keep generated product UI free of Open Design chrome, preview labels, or design-process annotations.
- Treat this handoff as a visual contract: if implementation choices conflict, match the exported pixels and behavior first, then refactor internals.

## Source map
- Primary entry: `pryzm-clone.html`
- HTML screens detected: 2
- Stylesheets detected: 5
- Script/component files detected: 0
- Supporting assets detected: 84

## Responsive contract
Validate the implementation across this 2025–2026 viewport matrix:
- Mobile compact: 360×800
- Mobile standard: 390×844
- Mobile large: 430×932
- Foldable / small tablet: 600×960
- Tablet portrait: 820×1180
- Tablet landscape: 1024×768
- Laptop: 1366×768
- Desktop: 1440×900
- Wide desktop: 1920×1080

For responsive web exports, treat these as a modern breakpoint system for one adaptive web experience, not three fixed screenshots. Do not split responsive web into unrelated native app screens unless the project explicitly includes native targets. Use semantic layout thresholds, fluid `clamp()` type/spacing, and container queries where component width matters more than viewport width. Preserve any CSS media queries, container queries, fluid `clamp()` scales, and layout changes already present in the exported files.

## Design fidelity contract
- Extract reusable tokens before writing components: background, surface, foreground, muted text, border, accent, radius, shadow, spacing, type scale, and motion duration/easing.
- Map product screens, in-app modules/components, optional landing page, and optional OS widget surfaces before coding. Keep these surfaces separate in the target architecture.
- Match layout geometry: max-widths, gutters, grid columns, card proportions, sticky/fixed elements, and viewport-specific navigation.
- Preserve real copy, labels, and data shown in the export. Do not replace specific text with generic marketing filler.
- Preserve interactive affordances: hover, focus, pressed, disabled, loading, validation, copy/share, tab/accordion, modal/sheet, and keyboard states where present.
- Preserve accessibility semantics when converting: headings stay hierarchical, controls remain buttons/links/inputs, focus states stay visible.
- Do not keep prototype-only annotations, frame labels, or Open Design chrome in the production UI.

## CJX-ready UX contract
- Use `DESIGN-MANIFEST.json` as the machine-readable map for screens, app modules, OS widgets, landing pages, tokens, interactions, and viewport checks.
- Screen-file-first: when multiple user-facing surfaces exist, implement each HTML screen as its own route/file. Treat `index.html` as a launcher/overview when the manifest marks it that way, not as a combined final UI.
- If `landing.html`, app screens, platform screens, or OS widget files exist, preserve those boundaries in the target app instead of merging them into one page.
- A single self-contained `pryzm-clone.html` is acceptable only when the export truly contains one user-facing screen and its CSS/JS are structured enough to extract tokens, components, states, and behavior.
- If separate `css/` or `js/` files exist, treat them as source of truth for token/component/interactions before porting to React, Vue, SwiftUI, Compose, or another target stack.
- In-app modules/components are product UI blocks inside the app. OS widgets are home-screen/lock-screen/quick-access surfaces outside the app. Do not merge those concepts.

## Color and brand contract
- Use the exported design tokens and product/domain context as the color source of truth.
- Do not introduce warm beige / cream / peach / pink / orange-brown background washes unless they are already explicit brand/reference colors in the export.
- A stylesheet or design/token file was detected; inspect it for canonical color variables before choosing framework theme tokens.

## Implementation sequence for AI coding tools
1. Open `pryzm-clone.html` and `DESIGN-MANIFEST.json`; identify every screen file, launcher/overview file, app module, and interaction before coding.
2. If multiple HTML screens exist, map them to separate routes/surfaces first; do not merge `landing.html`, product app screens, platform screens, or OS widgets into one route.
3. Extract a token table from CSS/root styles and inline styles before building framework components.
4. Build product screens and domain-specific in-app modules from largest layout regions down to controls; avoid starting with isolated atoms that lose spatial intent.
5. Port responsive behavior across the modern viewport matrix and test each semantic breakpoint before cleanup.
6. Port interactions and states, then replace static placeholders only with real app data or functional equivalents.
7. Keep optional landing page and OS widget surfaces as separate surfaces if present.
8. Compare final screenshots against the export at 360×800, 390×844, 430×932, 820×1180, 1024×768, 1366×768, 1440×900, and 1920×1080 before declaring done.

## Entry points
- `pryzm-clone.html`
- `RECON/orig-page.html`

## Styles
- `assets/css/pryzm.design/03.-42dzdz8yl-c84edcb8fd.css`
- `assets/css/pryzm.design/06vs2fiawemam-9e1082e072.css`
- `assets/css/pryzm.design/0htmf10woja2j-084814f74f.css`
- `assets/css/pryzm.design/12-36zx-s5zlo-ad5c20dd68.css`
- `assets/fonts/fonts.css`

## Scripts/components
- None detected

## Assets and supporting files
- `assets/fonts/pryzm.design/0a7740363b4d4863-s.1110aazvokzp.-1d8140d3da.woff2`
- `assets/fonts/pryzm.design/0da9c7f357bd9d4d-s.0ek5sshv8wk3m-7594d76c0b.woff2`
- `assets/fonts/pryzm.design/1bffadaabf893a1e-s.16ipb6fqu393i-883e72c6e7.woff2`
- `assets/fonts/pryzm.design/2bbe8d2671613f1f-s.067x_6k0k23tk-47b3f57b22.woff2`
- `assets/fonts/pryzm.design/2c55a0e60120577a-s.0bjc5tiuqdqro-dc4baab5c8.woff2`
- `assets/fonts/pryzm.design/47fe1b7cd6e6ed85-s.p.0-mcdl10zdfb3-6561b13a87.woff2`
- `assets/fonts/pryzm.design/4fa387ec64143e14-s.0wkzw-je483f--99c7bd5f9a.woff2`
- `assets/fonts/pryzm.design/5476f68d60460930-s.0wxq9webf.ew4-98f52c3e3f.woff2`
- `assets/fonts/pryzm.design/5ce348bf30bf5439-s.0zgw-jeven.3w-1a29f5cf03.woff2`
- `assets/fonts/pryzm.design/5f9d24ebef5d5292-s.0esuu2f5si-v8-16de19b0fc.woff2`
- `assets/fonts/pryzm.design/6306c77e7c8268e4-s.0rhz0arwfsn-5-ebb12fefa6.woff2`
- `assets/fonts/pryzm.design/797e433ab948586e-s.p.08e28id.o-okb-accf646361.woff2`
- `assets/fonts/pryzm.design/798ea22d9983e047-s.106do9xzbuago-ad7f1620e2.woff2`
- `assets/fonts/pryzm.design/7d817b4c03b0c5f1-s.0l76wvqk9d84w-57a87799ea.woff2`
- `assets/fonts/pryzm.design/83afe278b6a6bb3c-s.p.0q-301v4kxxnr-a979c868ab.woff2`
- `assets/fonts/pryzm.design/8e6fa89aa22d24ec-s.p.0uvzar8hswo3p-affc94d2f4.woff2`
- `assets/fonts/pryzm.design/9c72aa0f40e4eef8-s.0m6w47a4e5dy9-62be34692f.woff2`
- `assets/fonts/pryzm.design/ad66f9afd8947f86-s.11u06r12fd6v_-2d400bf877.woff2`
- `assets/fonts/pryzm.design/b53057dbf91a7acf-s.0carvq6u72s58-c5d327819f.woff2`
- `assets/fonts/pryzm.design/bbc41e54d2fcbd21-s.0k4k9394f2q-k-6671cd2b5d.woff2`
- `assets/fonts/pryzm.design/bdc7e24a509eb931-s.0apt5mko2.qn3-bec68ac13f.woff2`
- `assets/fonts/pryzm.design/e2334d715941921e-s.p.12skym0rqknxy-4c407fbe9b.woff2`
- `assets/images/pryzm.design/1-8a802146d6.webp`
- `assets/images/pryzm.design/10-78a1bd812a.webp`
- `assets/images/pryzm.design/11-0b4424149a.webp`
- `assets/images/pryzm.design/12-495e56b3ce.webp`
- `assets/images/pryzm.design/13-9c07d143a4.webp`
- `assets/images/pryzm.design/14-df6e8fca09.webp`
- `assets/images/pryzm.design/15-5123652a60.webp`
- `assets/images/pryzm.design/16-249988f9bf.webp`
- `assets/images/pryzm.design/18-6e6d3ed328.webp`
- `assets/images/pryzm.design/19-7bfbba5e18.webp`
- `assets/images/pryzm.design/2-f5f56194c0.webp`
- `assets/images/pryzm.design/3-2a02a828a1.webp`
- `assets/images/pryzm.design/4-7bfa1dcaf8.webp`
- `assets/images/pryzm.design/5-1b4a2eb530.webp`
- `assets/images/pryzm.design/6-3f21c0f6c1.webp`
- `assets/images/pryzm.design/7-9e89da75af.webp`
- `assets/images/pryzm.design/8-14d22231b6.webp`
- `assets/images/pryzm.design/9-dfa7787df6.webp`
- `assets/images/pryzm.design/flow-mobile-85ad6d8b05.webp`
- `assets/images/pryzm.design/footer3-1087a09b15.webp`
- `assets/images/pryzm.design/hero-video-poster-85113128de.webp`
- `assets/images/pryzm.design/logo-e5d3c83e28.png`
- `assets/images/pryzm.design/polar-1cf2483fcd.svg`
- `assets/images/pryzm.design/polar-white-a17eb632dd.svg`
- `assets/images/pryzm.design/signin-f20ce09ebb.webp`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/1ff99add-b709-4066-8c0d-bf35857ed470-c629a6aad5.png`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/24a771fc-d9cd-49ac-8e46-c2703c5fb79f-a399817be2.png`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/3958bfb8-9add-43dd-9505-514a5ba6d425-570a041c7a.webp`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/40a7ad40-cbf2-415a-bd56-39b203bab9cf-8a6782c112.webp`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/52c8c115-599b-4dee-8a68-4e86a7645424-6d8cce2602.webp`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/5a5b9b87-7f76-49fa-9c1f-c2d992b93024-f5a9a5ab4d.webp`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/5bcfdd94-61ed-4443-bb91-500ac9eeb55e-a1fb6865cd.png`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/6b088bc8-ca3a-441e-8c4e-c2894a6c237c-b3259b7717.png`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/6e2100a2-8f63-4143-bc65-343695489c05-581ec61625.webp`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/8aa04b3f-d783-4d70-b47b-3c6a710025a1-8ae7895461.png`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/948ef16f-0d09-439f-b5a3-2def86ef8b64-e05f518ae1.webp`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/9a70e2c8-89d7-48af-bfd5-d965a254b5db-8c4db3468d.png`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/e9640c3b-187b-4578-b081-417f8ca78b50-0dcf11e365.webp`
- `assets/images/qbbeqzzqoylaziguwfjx.supabase.co/fc9b5466-8ba8-4696-aa88-0770232f6380-7d7c5577c4.webp`
- `assets/media/pryzm.design/landing-9fe8eb4939.webm`
- `CLONE_AUDIT.md`
- `CLONE_REPORT.md`
- `NOTES.md`
- `package-lock.json`
- `package.json`
- `RECON/asset-manifest.json`
- `RECON/clone-recon.json`
- `RECON/clone-summary.md`
- `RECON/original-recon.json`
- `RECON/original-summary.md`
- `RECON/screenshots/clone-1440.png`
- `RECON/screenshots/clone-390.png`
- `RECON/screenshots/clone-768.png`
- `RECON/screenshots/footer-check.png`
- `RECON/screenshots/nav-fade-check.png`
- `RECON/screenshots/nav-mid-check.png`
- `RECON/screenshots/nav-top-check.png`
- `RECON/screenshots/original-1440.png`
- `RECON/screenshots/original-390.png`
- `RECON/screenshots/original-768.png`
- `RECON/screenshots/visual-diff-1440.png`
- `RECON/visual-diff-1440.json`

## Coding checklist for AI tools
1. Inspect `pryzm-clone.html` and `DESIGN-MANIFEST.json` first and identify reusable components before coding.
2. Implement each user-facing screen file as its own route/surface; keep launcher, landing, app, platform, and OS widget files separate.
3. Extract design tokens into the target stack: colors, type scale, spacing, radius, shadows, and motion.
4. Implement layout with real 2025–2026 responsive breakpoints, fluid type/spacing, and container-query-aware component behavior; test with no horizontal overflow.
5. Preserve interactive controls, hover/focus/pressed states, form behavior, validation, and copy actions where present.
6. Implement domain-specific in-app modules with real states; do not flatten them into generic cards.
7. Keep landing page, product screens, and OS widget/quick-access surfaces separate when present.
8. Confirm the production result visually matches the exported design before refactoring internals.
9. Reject implementation shortcuts that flatten the design into generic cards, generic gradients, placeholder stats, or framework-default typography.
10. If a detail is ambiguous, keep the exported HTML/CSS/JS behavior rather than inventing a new pattern.
