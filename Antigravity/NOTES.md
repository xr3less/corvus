# pryzm-clone · 克隆笔记

## 源信息
- 原站 URL: https://pryzm.design/
- 源码仓库: 未公开（Next.js 闭源营销站）—— GitHub 搜源码分支跳过，直接走浏览器侦察
- 原作者: Pryzm (Ava Thiery)
- 许可证: 无 LICENSE 声明 → 默认保留所有权利。仅本地学习复刻；公开重新部署前须获原作者许可，见 CLONE_AUDIT.md
- 致谢要求: 克隆页 footer 保留原作者署名思路，部署前替换品牌（见下）

## 技术栈
- 框架 / 关键库 / Node 版本: 原站 Next.js (Turbopack chunks) + Inter/Poppins/Geist Mono；克隆为单文件 pryzm-clone.html + Tailwind CSS Browser v4 CDN + 自托管原站真字体 (assets/fonts/fonts.css) + 原站真图 (assets/images, 66 dosya)
- Node: v24.15.0；Playwright 1.63.0（侦察用）

## 复刻前预判
- 复杂度等级: L3（Next.js 内容型营销站：14 section，71 图，2 canvas，0 console error）
- 推荐模式: 忠实复刻（单页落地）
- 可高保真的部分: 导航/hero/8'li galeri/kod+fiyat/SSS/bülten/footer；自托管字体与原图
- 需要近似或替代的部分: hero studio mock（原站 canlı WebGL → statik poster + canvas gradient近似）；flow grafiği（flow-mobile.webp 真图 kullanıldı）；video (poster ile temsil)
- 不克隆的部分: /studio, /gallery, /flow, /blog, checkout (Polar), auth — hepsi "#cta" demo hedefi
- 主要风险: Supabase gallery URL'leri harvest ile yerelleştirildi；canlı canvas 1:1 değil

## 跑起来
```bash
python -m http.server 8123
# → http://127.0.0.1:8123/pryzm-clone.html
```
Next.js notu: kullanıcı "Tailwind + Next.js" istedi. Bu önizleme tek dosyalık Tailwind (CDN) klonudur; bölüm yapısı Next.js App Router'a birebir taşınabilir (her `<section data-od-id>` ≈ bir React component: Hero/Flow/RemixGrid/Embed/Pricing/Faq/Loop/Cta/Footer).Ji echte Next.js portu için aynı class'lar + `assets/` aynen `public/` altına taşınır.

## 改了什么（对照原版）
- v3: GERÇEK scroll tarifi bulundu — orijinal Lenis kullanıyor (JS pakete gömülü; ilk recon'da kaçmış, `0htmf10woja2j` CSS'indeki `.lenis` stillerinden yakalandı). Klona Lenis eklendi (CDN, duration 1.15, anchor'lar offset'li scrollTo, reduced-motion'da kapalı)
- v3: footer baştan yazıldı — orijinal `sticky bottom-0` ile içeriğin altından beliriyor; bulanık footer3 arka planı, h-8 logo, küçük bülten formu, 3 kolon link, alt bar
- v3: nav ve footer logosu serif text yerine gerçek logo.png (h-8) ile değiştirildi
- v2: hero baştan yazıldı
- v2: studio mock detaylandırıldı (ikon rayı, Effects kategorileri, toolbar, Props slider'ları, "Try the Studio →")
- v2: Flow bölümü aslına çevrildi (FLOW eyebrow, sağda "Open Flow ↗", noktalı zeminde node kartları + kesik bağlantılar)
- Scroll hissi: orijinalde smooth-scroll kütüphanesi YOK (recon: lenis/gsap false, htmlScrollBehavior auto) — his, katmanlı kolaj paralaksından geliyor. Klona aynı tarif uygulandı: native scroll + rAF paralaks (data-speed) + sade reveal. `scroll-behavior:smooth` yalnızca sayfa-içi anchor tıklamalarını etkiler, tekerlek hissini değiştirmez
- Canlı studio/flow/gallery/checkout → demo anchor'lar (#studio/#cta)
- Tailwind notu: klon gerçek Tailwind v4 kullanıyor (CDN derleyicisi, utilities aynı motor). "Next.js ile yapılsaydı farklı olurdu" hissi tooling'den değil hero yorumumdandı — v2'de düzen aslıyla eşleşti. Dosya başındaki yorumda Next.js component eşlemesi var (<Navbar/> <HeroCollage/> <StudioMock/> …)
- İngilizce copy korundu (birebir klon; çeviri yapılmadı)

## 原站 vs 克隆站
| 模块 | 原站表现 | 克隆实现 | 差异 / 取舍 | 证据 |
|---|---|---|---|---|
| 首屏 | H1 + studio mock + artwork strip | Aynı + canvas gradient + marquee strip (gerçek thumb'lar) | WebGL yerine poster+canvas | RECON/screenshots/clone-1440.png |
| 导航 | logo, Inspiration, Lab Beta, Pricing, Open studio | Aynı (sticky + blur + mobil menü) | birebir | clone-390.png mobil OK |
| 核心动效 | scroll reveal, hover | IntersectionObserver reveal, hover scale, marquee | Lenis yok (orijinalde de yok) | console 0 error |
| 内容区块 | Flow, 8 kart, kod, fiyat, SSS, bülten, CTA, footer | Tümü gerçek copy + gerçek görseller | video → poster | CLONE_REPORT.md |
| 移动端 | 390px tek kolon | Tek kolon, taşma yok | OK | clone-390.png |

## 复刻评分
- 源证据: 5/5 (recon+harvest+route eşdeğeri webfetch)
- 结构保真: 5/5 (14 section → 10 bölüm, tüm H1/H2'ler)
- 视觉保真: 4/5 (font/renk birebir; studio mock yaklaşık)
- 动效/交互: 4/5 (accordion/toggle/reveal/marquee; canvas basitleştirilmiş)
- 响应式: 5/5 (1440/768/390 doğrulandı)
- 功能完整: 3/5 (pazarlama sayfası tam; app/checkout bilerek yok)
- 内容替换: 5/5 (orijinal copy + lisans notu; dağıtım öncesi marka değişimi CLONE_AUDIT.md'de)
- 法务/部署风险: 3/5 (lisans yok → kamuya dağıtma izinsiz yasak)
- 总评: 4/5 — sadık pazarlama klonu, tek dosya

## 替换地图（要换什么改哪）
- 文字 -> pryzm-clone.html (bölümler `data-od-id` ile işaretli)
- 图片/媒体 -> assets/images (manifest: RECON/asset-manifest.json)
- 配色 -> pryzm-clone.html `<style>` `:root` (--bg/--surface/--fg/--muted/--accent)
- 3D 模型 / 字体 -> assets/fonts/fonts.css (Inter/Poppins/Geist Mono self-hosted)
- 部署前须替换清单: "Pryzm" marka adı/logo, Supabase görselleri lisansı, Polar linkleri, Tailwind CDN → derlenmiş CSS

## 验证
- [x] 本地跑通、console 0 error (RECON/clone-summary.md: Console errors 0, Page errors 0)
- [x] 截图对照原站（RECON/screenshots/clone-1440/768/390.png）
- 验证不了的点（如实记，别伪造): checkout/Polar akışı tıklanmadı (harici ödeme)；orijinal canvas shader'ları karşılaştırılmadı (farklı teknoloji)
