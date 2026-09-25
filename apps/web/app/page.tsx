import type { Metadata } from 'next';
import { Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { ArrowRight, Check, Menu, Play, ShieldCheck, X } from 'lucide-react';
import styles from './landing.module.css';
import { LandingEffects, VelarisCanvas } from './landing-islands';

export const metadata: Metadata = {
  title: 'Corvus - Discord botunu sade sözlerle kur',
  description:
    'Discord toplulukları için kod yazmadan bot kurma aracı: botunu sade bir dille anlat, yayına almadan önce dene. Ücretsiz ön izleme, kart gerekmez.',
};

// next/font/google (latin, display-swap). If the Google font fetch fails,
// Plus Jakarta Sans falls back to the system sans stack and mono falls back to
// system mono via the CSS stacks in landing.module.css.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});
const mono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--landing-mono',
});

const DISCORD_PATH =
  'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z';

const NAV_LINKS = [
  { href: '#bento', label: 'Özellikler' },
  { href: '#how-it-works', label: 'Nasıl çalışır' },
  { href: '#templates', label: 'Vitrin' },
  { href: '#pricing', label: 'Fiyatlar' },
  { href: '#faq', label: 'SSS' },
];

const FAQS = [
  {
    q: 'Bot jetonumu veya hesap bilgilerimi paylaşmam gerekiyor mu?',
    a: 'Discord ile giriş yaparsın — jeton yapıştırman hiç gerekmez. Bir bot bağladığında jetonu kaydedilmeden önce şifrelenir ve onu yalnızca botunu çalıştıran kısım açabilir.',
  },
  {
    q: 'Deneme s\u00fcrem biterse sunucu verilerime ve XP kay\u0131tlar\u0131ma ne olur?',
    a: 'Deneme s\u00fcren bitti\u011finde botlar\u0131n duraklar ve oldu\u011fu gibi kal\u0131r \u2014 hi\u00e7bir \u015fey silinmez.',
  },
  {
    q: 'Corvus, MEE6 veya Dyno gibi eski botlardan nasıl ayrılır?',
    a: 'Eski botlar sabit özellikler için seni sunucu başına ücretlendirir; kod yazmadan bunları değiştiremezsin. Corvus’ta ise istediğini sade sözlerle anlatırsın. Botun topluluğuna uyar ve tek abonelik birden fazla sunucuyu kapsar; hepsi tek yerden yönetilir.',
  },
  {
    q: 'Hareketli etkileşimler ve moderasyon için AI kredileri nasıl işliyor?',
    a: 'Günlük işler (rol verme, komut çalıştırma, XP sayma, kuralları uygulama) ücretsizdir ve kredilerine hiç dokunmaz. Krediler yalnızca AI işlerine gider: anlattıklarından bot kurma ve akıllı yanıtlar (kurulum başına yaklaşık 1.1 kredi). Deneme 3 gün için 100 kredi içerir; Pro’daki 2.000 kredi çoğu topluluğa aylarca yeter.',
  },
  {
    q: 'Ba\u015fka botlar\u0131m zaten kurulu. Rol izinleri \u00e7ak\u0131\u015f\u0131r m\u0131?',
    a: 'Hay\u0131r. Botun yay\u0131na al\u0131nmadan \u00f6nce Corvus sunucundaki rolleri ve izinleri kontrol eder ve botun nereye konumlanmas\u0131 gerekti\u011fini sade s\u00f6zlerle s\u00f6yler; b\u00f6ylece di\u011fer botlar\u0131nla hi\u00e7 \u00e7ak\u0131\u015fmaz.',
  },
];

function BrandMark() {
  return (
    <span className={styles.brandBadge} aria-hidden="true">
      <svg
        className={styles.brandGlyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2L3 9l9 7 9-7-9-7z" />
        <path d="M5 12l7 5 7-5" />
        <path d="M7 16l5 4 5-4" />
      </svg>
    </span>
  );
}

export default function HomePage() {
  return (
    <div className={`${jakarta.className} ${mono.variable} ${styles.page}`}>
      <a href="#top" className={styles.skip}>
        İçeriğe geç
      </a>

      <header id="siteNav" className={styles.nav}>
        <div aria-hidden="true" className={styles.blurStack}>
          <div
            className={styles.blurLayer}
            style={{
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              maskImage: 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)',
            }}
          />
          <div
            className={styles.blurLayer}
            style={{
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              maskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
            }}
          />
          <div
            className={styles.blurLayer}
            style={{
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              maskImage: 'linear-gradient(to bottom, black 0%, black 15%, transparent 60%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 15%, transparent 60%)',
            }}
          />
          <div
            className={styles.blurLayer}
            style={{
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              maskImage: 'linear-gradient(to bottom, black 0%, transparent 45%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 45%)',
            }}
          />
          <div className={styles.blurShade} />
        </div>

        <nav className={styles.navInner} aria-label="Ana menü">
          <div className={styles.brandCluster}>
            <a href="#top" className={styles.brand} aria-label="Corvus ana sayfa">
              <BrandMark />
              <span className={styles.brandName}>CORVUS</span>
            </a>
            <div className={styles.navLinks}>
              {NAV_LINKS.map((link) => (
                <a key={link.label} href={link.href} className={styles.navLink}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className={styles.navCtas}>
            <a href="/demo" className={`${styles.btnDark} ${styles.demoBtn}`}>
              Etkileşimli demo
            </a>
            <a href="/api/auth/login" className={`${styles.btnPrimary} ${styles.signBtn}`}>
              <svg className={styles.signGlyph} viewBox="0 0 24 24" fill="currentColor">
                <path d={DISCORD_PATH} />
              </svg>
              Discord ile giriş yap
            </a>
            <button
              id="menuBtn"
              className={`${styles.btnDark} ${styles.menuBtn}`}
              aria-label="Menüyü aç veya kapat"
              aria-expanded="false"
              type="button"
            >
              <Menu size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </nav>

        <div id="mobileMenu" className={styles.mobileMenu}>
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} className={styles.drawerLink}>
              {link.label}
            </a>
          ))}
          <div className={styles.drawerCtas}>
            <a href="/demo" className={`${styles.btnDark} ${styles.drawerBtn}`}>
              Etkileşimli demo
            </a>
            <a href="/api/auth/login" className={`${styles.btnPrimary} ${styles.drawerBtn}`}>
              Discord ile giriş yap
            </a>
          </div>
        </div>
      </header>

      <main id="top" className={styles.main}>
        <section id="how-it-works" className={styles.hero}>
          <VelarisCanvas />
          <div
            aria-hidden="true"
            className={styles.heroGlow}
            style={{
              background:
                'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(255,255,255,0.06), transparent 70%)',
            }}
          />

          <div className={styles.heroContainer}>
            <div className={`${styles.heroCopy} ${styles.reveal}`}>
              <div className={styles.badge}>
                <span>Kod yok | Jeton yapıştırmak yok | Ücretsiz ön izleme</span>
              </div>

              <h1 className={`${styles.display} ${styles.h1}`}>
                Özel AI Discord botlarını haftalar değil, dakikalar içinde kur
              </h1>

              <p className={styles.heroSub}>
                Her sunucu için 4-5 ayrı bota para ödemeyi bırak. Topluluğunun ihtiyacı olan botu
                sade bir dille anlat - kod yok, jeton yapıştırmak yok.
              </p>

              <div className={styles.ctaRow}>
                <div>
                  <a href="/dashboard" className={styles.ctaTrial}>
                    <span>Ücretsiz kurmaya başla</span>
                    <span className={styles.ctaTrialCircle} aria-hidden="true">
                      <ArrowRight size={16} strokeWidth={2.5} />
                    </span>
                  </a>
                  <p className={styles.priceNote}>
                    Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi, kart gerekmez.
                  </p>
                </div>
                <a href="/demo" className={styles.ctaDemo}>
                  <Play size={16} className={styles.playGlyph} aria-hidden="true" />
                  <span>Etkileşimli demo</span>
                </a>
              </div>
            </div>

            <div className={`${styles.frameWrap} ${styles.reveal}`}>
              <div aria-hidden="true" className={styles.frameGlow} />

              <div className={styles.frame}>
                <div className={styles.frameBar}>
                  <div className={styles.frameBarLeft}>
                    <div className={styles.frameTitle}>
                      <span className={styles.liveDot} aria-hidden="true" />
                      <span className={styles.frameTitleText}>Corvus AI Studio</span>
                    </div>
                    <span className={styles.frameSep} aria-hidden="true">
                      /
                    </span>
                    <span className={`${styles.mono} ${styles.frameUrl}`}>
                      corvus.ai/studio/sentinel-prime
                    </span>
                  </div>
                  <div className={styles.frameBarRight}>
                    <span className={styles.framePill}>
                      <ShieldCheck size={12} strokeWidth={2.5} aria-hidden="true" />
                      Jeton yapıştırmak gerekmez
                    </span>
                  </div>
                </div>

                <div className={styles.frameImgWrap}>
                  <img
                    src="/landing/dashboard-hero.jpg"
                    alt="Corvus AI Studio paneli - bot ayarlarının canlı olarak yapıldığı konsol"
                    className={styles.frameImg}
                    loading="eager"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="bento" className={styles.bento}>
          <div className={styles.wrapWide}>
            <div className={`${styles.bentoHead} ${styles.reveal}`}>
              <h2 className={`${styles.display} ${styles.h2center}`}>Söz verdiğimiz üç şey.</h2>
              <p className={styles.lede}>Yazdık ki sormak zorunda kalmayasın.</p>
            </div>

            <div className={styles.blockStack}>
              <div className={styles.blockGrid}>
                <div className={styles.blockText}>
                  <h3 className={`${styles.display} ${styles.blockTitle}`}>
                    Senin sunucun. Senin botun. Sürpriz yok.
                  </h3>
                  <p className={styles.blockPara}>
                    Discord ile giriş yaparsın — jeton yapıştırman hiç gerekmez. Bir bot
                    bağladığında jetonu kaydedilmeden önce şifrelenir ve onu yalnızca botunu
                    çalıştıran kısım açabilir.
                  </p>
                  <ul className={styles.checkList}>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Discord ile giriş yap, ezberleyecek şifre yok
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Ayrılırsan verilerin ve botun seninle gelir
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Sunucunda hiçbir zaman yönetici erişimi olmaz
                    </li>
                  </ul>
                </div>
                <div className={styles.panelCol}>
                  <div className={styles.panel}>
                    <div className={styles.panelPad}>
                      <div className={styles.panelLabel}>İzin önizlemesi</div>
                      <ul className={styles.permList}>
                        <li className={styles.permItem}>
                          <Check
                            size={12}
                            className={`${styles.mono} ${styles.permOk}`}
                            aria-hidden="true"
                          />
                          Mesaj Gönder
                        </li>
                        <li className={styles.permItem}>
                          <Check
                            size={12}
                            className={`${styles.mono} ${styles.permOk}`}
                            aria-hidden="true"
                          />
                          Üyeleri At
                        </li>
                        <li className={styles.permItem}>
                          <Check
                            size={12}
                            className={`${styles.mono} ${styles.permOk}`}
                            aria-hidden="true"
                          />
                          Mesajları Yönet
                        </li>
                        <li className={styles.permItem}>
                          <Check
                            size={12}
                            className={`${styles.mono} ${styles.permOk}`}
                            aria-hidden="true"
                          />
                          Denetim Kaydını Görüntüle
                        </li>
                        <li className={`${styles.permItem} ${styles.struck}`}>
                          <X
                            size={12}
                            className={`${styles.mono} ${styles.permNo}`}
                            aria-hidden="true"
                          />
                          Yönetici
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.blockGrid}>
                <div className={`${styles.panelCol} ${styles.panelFirst}`}>
                  <div className={styles.panel}>
                    <div className={styles.panelPad}>
                      <div className={styles.panelLabel}>
                        Gece güncellemesi, üye görünümü (planlı)
                      </div>
                      <ul className={styles.timeList}>
                        <li className={styles.timeItem}>
                          <span className={styles.timeDot} aria-hidden="true" />
                          <div>
                            <div className={styles.timeTitle}>
                              Güncellemeler arka planda kurulacak (planlı)
                            </div>
                            <div className={styles.timeSub}>
                              botun bu sırada çevrimiçi kalacak (planlı)
                            </div>
                          </div>
                        </li>
                        <li className={styles.timeItem}>
                          <span className={styles.timeDot} aria-hidden="true" />
                          <div>
                            <div className={styles.timeTitle}>Her XP kaydı saklanacak (planlı)</div>
                            <div className={styles.timeSub}>
                              roller, uyarılar ve bakiyeler olduğu gibi kalacak (planlı)
                            </div>
                          </div>
                        </li>
                        <li className={styles.timeItem}>
                          <span className={styles.timeDot} aria-hidden="true" />
                          <div>
                            <div className={styles.timeTitle}>
                              Kimse bir şey fark etmeyecek (planlı)
                            </div>
                            <div className={styles.timeSub}>
                              üyelerin için kesinti olmayacak (planlı)
                            </div>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className={`${styles.blockText} ${styles.textSecond}`}>
                  <h3 className={`${styles.display} ${styles.blockTitle}`}>
                    Hep açık. Hep hatırlar. (planlı)
                  </h3>
                  <p className={styles.timeSub}>
                    Bu çalışırlık ve veri saklama sözlerinin hiçbiri henüz yayında değil (planlı).
                  </p>
                  <p className={styles.blockPara}>
                    Topluluğunun XP&rsquo;si, rolleri ve geçmişi yerinde kalacak. Yeniden
                    başlatmalar ve güncellemeler kimse fark etmeden olacak (planlı).
                  </p>
                  <ul className={styles.checkList}>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Topluluğunun XP&rsquo;si ve rolleri her yeniden başlatmadan sonra yaşayacak
                      (planlı)
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Güncellemeler arka planda olacak, kesinti olmayacak (planlı)
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Planlı: ödeme yapmayı bıraksan bile 12 aylık veri saklanır
                    </li>
                  </ul>
                </div>
              </div>

              <div className={styles.blockGrid}>
                <div className={styles.blockText}>
                  <h3 className={`${styles.display} ${styles.blockTitle}`}>
                    Anlat. Gerisini biz kurarız.
                  </h3>
                  <p className={styles.blockPara}>
                    Botunun ne yapması gerektiğini söyle. Sade sözlerle. Biz yaparız, bir deneme
                    sunucusunda test ederiz ve canlıya alma bağlandığında kendi sunucuna koymana
                    yardım ederiz.
                  </p>
                  <ul className={styles.checkList}>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Sade dille kurulum, kod yok
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Canlıya almadan önce deneme sunucusunda test et
                    </li>
                    <li className={styles.checkItem}>
                      <span className={styles.checkDot} aria-hidden="true" />
                      Her şeyi istediğin zaman değiştir, geliştirici gerekmez
                    </li>
                  </ul>
                </div>
                <div className={styles.panelCol}>
                  <div className={styles.panel}>
                    <div className={styles.panelPad}>
                      <div className={styles.panelLabel}>Botun, sade sözlerle</div>
                      <div className={styles.convo}>
                        <div className={styles.convoRow}>
                          <span className={styles.convoWho}>Sen</span>
                          <span className={styles.convoTextDim}>
                            Biri katıldığında #general kanalına karşılama mesajı at.
                          </span>
                        </div>
                        <div className={styles.convoRow}>
                          <span className={`${styles.convoWho} ${styles.convoWhoAi}`}>Corvus</span>
                          <span className={styles.convoTextBright}>
                            Anlaşıldı. Yeni üyeleri #general kanalında kullanıcı adlarıyla
                            karşılıyoruz.
                          </span>
                        </div>
                        <div className={styles.convoRow}>
                          <span className={styles.convoWho}>Sen</span>
                          <span className={styles.convoTextDim}>
                            Ayrıca @Member rolünü otomatik versin.
                          </span>
                        </div>
                        <div className={styles.convoRow}>
                          <span className={`${styles.convoWho} ${styles.convoWhoAi}`}>Corvus</span>
                          <span className={styles.convoTextBright}>
                            Tamam. Botun test etmeye hazır.
                          </span>
                        </div>
                      </div>
                      <a href="#templates" className={styles.convoLink}>
                        Şablonlara göz at
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="templates" className={styles.templates}>
          <div className={`${styles.templatesHead} ${styles.reveal}`}>
            <div>
              <h2 className={`${styles.display} ${styles.templatesTitle}`}>Bir şablonla başla</h2>
              <p className={styles.templatesLede}>
                Birini seç, sade dille kendine uyarla ve yayına almadan önce test et.
              </p>
            </div>
            <a href="#pricing" className={`${styles.btnGhost} ${styles.ghostCta}`}>
              <span>Şablon önizlemesi — önizleme sürerken ücretsiz başla</span>
              <span className={styles.arrowGlyph} aria-hidden="true">
                →
              </span>
            </a>
          </div>

          <svg width="0" height="0" className={styles.spriteDef} aria-hidden="true">
            <symbol id="discordGlyph" viewBox="0 0 24 24">
              <path fill="currentColor" d={DISCORD_PATH} />
            </symbol>
          </svg>

          <div className={styles.templateGrid}>
            <article className={`${styles.tCard} ${styles.reveal}`}>
              <div>
                <div className={styles.tTileWrap}>
                  <div className={styles.tile}>
                    <div
                      aria-hidden="true"
                      className={styles.tileGlow}
                      style={{
                        background:
                          'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(16,185,129,0.18), transparent 70%)',
                      }}
                    />
                    <svg className={styles.tileGlyph} viewBox="0 0 24 24" aria-hidden="true">
                      <use href="#discordGlyph" />
                    </svg>
                    <div className={styles.tilePill}>
                      <span>Şablon</span>
                    </div>
                    <div className={`${styles.tileTag} ${styles.tileTagEmerald}`}>OTOMOD</div>
                  </div>
                </div>

                <div className={styles.tBody}>
                  <div className={styles.tMeta}>
                    <span>Genel ve Oyun Sunucuları</span>
                  </div>
                  <div className={styles.tTitleRow}>
                    <h3 className={styles.tTitle}>Mod Shield</h3>
                    <span className={styles.botBadge}>BOT</span>
                  </div>
                  <p className={styles.tDesc}>
                    Spam&rsquo;i engeller, zararlı mesajları süzer, baskınları durdurur ve neler
                    olduğunu kaydeder.
                  </p>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>#spam-engeli</span>
                    <span className={styles.tag}>#oto-sustur</span>
                    <span className={styles.tag}>#baskın-kalkanı</span>
                  </div>
                </div>
              </div>

              <div className={styles.tFoot}>
                <a href="/gallery" className={styles.tBtn}>
                  <span>Bu şablonu kullan</span>
                </a>
              </div>
            </article>

            <article className={`${styles.tCard} ${styles.reveal}`}>
              <div>
                <div className={styles.tTileWrap}>
                  <div className={styles.tile}>
                    <div
                      aria-hidden="true"
                      className={styles.tileGlow}
                      style={{
                        background:
                          'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(56,189,248,0.18), transparent 70%)',
                      }}
                    />
                    <svg className={styles.tileGlyph} viewBox="0 0 24 24" aria-hidden="true">
                      <use href="#discordGlyph" />
                    </svg>
                    <div className={styles.tilePill}>
                      <span>Şablon</span>
                    </div>
                    <div className={`${styles.tileTag} ${styles.tileTagSky}`}>DESTEK</div>
                  </div>
                </div>

                <div className={styles.tBody}>
                  <div className={styles.tMeta}>
                    <span>SaaS ve Ticaret</span>
                  </div>
                  <div className={styles.tTitleRow}>
                    <h3 className={styles.tTitle}>Ticket Desk</h3>
                    <span className={styles.botBadge}>BOT</span>
                  </div>
                  <p className={styles.tDesc}>
                    Sık sorulan soruları kendisi yanıtlar, ekibin için özel yardım başlıkları açar
                    ve görüşme kayıtlarını saklar.
                  </p>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>#ai-yanıt</span>
                    <span className={styles.tag}>#kayıtlar</span>
                    <span className={styles.tag}>#özel-başlıklar</span>
                  </div>
                </div>
              </div>

              <div className={styles.tFoot}>
                <a href="/gallery" className={styles.tBtn}>
                  <span>Bu şablonu kullan</span>
                </a>
              </div>
            </article>

            <article className={`${styles.tCard} ${styles.reveal}`}>
              <div>
                <div className={styles.tTileWrap}>
                  <div className={styles.tile}>
                    <div
                      aria-hidden="true"
                      className={styles.tileGlow}
                      style={{
                        background:
                          'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(251,113,133,0.18), transparent 70%)',
                      }}
                    />
                    <svg className={styles.tileGlyph} viewBox="0 0 24 24" aria-hidden="true">
                      <use href="#discordGlyph" />
                    </svg>
                    <div className={styles.tilePill}>
                      <span>Şablon</span>
                    </div>
                    <div className={`${styles.tileTag} ${styles.tileTagRose}`}>KARŞILAMA</div>
                  </div>
                </div>

                <div className={styles.tBody}>
                  <div className={styles.tMeta}>
                    <span>Topluluk ve Sosyal Kulüpler</span>
                  </div>
                  <div className={styles.tTitleRow}>
                    <h3 className={styles.tTitle}>Welcome Wagon</h3>
                    <span className={styles.botBadge}>BOT</span>
                  </div>
                  <p className={styles.tDesc}>
                    Karşılama görselleri, düğmeli rol menüleri ve yeni üyeler için kuralları kabul
                    etme adımı.
                  </p>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>#düğmeli-roller</span>
                    <span className={styles.tag}>#kural-kapısı</span>
                    <span className={styles.tag}>#karşılama-görseli</span>
                  </div>
                </div>
              </div>

              <div className={styles.tFoot}>
                <a href="/gallery" className={styles.tBtn}>
                  <span>Bu şablonu kullan</span>
                </a>
              </div>
            </article>

            <article className={`${styles.tCard} ${styles.reveal}`}>
              <div
                className={styles.ctaTile}
                style={{
                  background:
                    'radial-gradient(ellipse 80% 70% at 50% 30%, rgba(16,185,129,0.10), rgba(255,255,255,0.02), transparent 70%)',
                }}
              >
                <div className={styles.ctaTileInner}>
                  <span className={styles.morePill}>Daha fazla →</span>
                  <h3 className={`${styles.display} ${styles.ctaTileTitle}`}>
                    8 şablonun hepsini gör
                  </h3>
                </div>
              </div>
              <div className={`${styles.tBody} ${styles.ctaTileBody}`}>
                <p className={styles.tDesc}>
                  Karşılama botlarından destek masalarına - başlamak için 8 şablon. Galeriyi aç.
                </p>
              </div>
              <div className={styles.tFoot}>
                <a href="/gallery" className={styles.tBtn}>
                  <span>Galeriyi aç</span>
                </a>
              </div>
            </article>
          </div>
        </section>

        <section id="pricing" className={styles.pricing}>
          <div className={`${styles.pricingHead} ${styles.reveal}`}>
            <h2 className={`${styles.display} ${styles.pricingTitle}`}>
              Şeffaf fiyatlandırma, sunucu başına ücret yok
            </h2>
            <p className={styles.pricingLede}>
              Tek bot, her sunucuda para ödediğin 4-5 botun yerini alır. Fiyatlar ve limitler planlı
              — henüz ödeme alma yok, hiçbir şey uygulanmıyor.
            </p>
          </div>

          <div className={styles.priceGrid}>
            <div className={`${styles.priceCard} ${styles.reveal}`}>
              <div>
                <div className={styles.priceHeadRow}>
                  <h3 className={styles.priceName}>Starter</h3>
                  <span className={styles.priceFlag}>Kart Gerekmez</span>
                </div>
                <div className={styles.priceRow}>
                  <span className={`${styles.display} ${styles.priceValue}`}>$0</span>
                  <span className={styles.pricePer}>/ ücretsiz ön izleme</span>
                </div>
                <p className={styles.priceDesc}>
                  Fiyatlar ve limitler planlı — deneme (1 bot, 100 AI kredisi) uygulanıyor.
                </p>
                <ul className={styles.priceList}>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: 1 aktif canlı Discord botu
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: 1 bağlı Discord sunucusu
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: 100 AI kredisi - kurulumlar ve akıllı yanıtlar
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: 8 başlangıç şablonunun tümüne tam erişim
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Topluluk Discord desteği
                  </li>
                </ul>
              </div>
              <div>
                <a href="/dashboard" className={`${styles.btnGhost} ${styles.priceCta}`}>
                  Ücretsiz kurmaya başla
                </a>
                <p className={styles.priceNote}>
                  Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi, kart gerekmez.
                </p>
              </div>
            </div>

            <div className={`${styles.priceCardPopular} ${styles.reveal}`}>
              <span className={styles.popularBadge}>En Çok Tercih Edilen</span>
              <div>
                <div className={styles.priceHeadRow}>
                  <h3 className={styles.priceName}>Corvus Pro</h3>
                  <span className={`${styles.priceFlag} ${styles.priceFlagGreen}`}>Önerilen</span>
                </div>
                <div className={styles.priceRow}>
                  <span className={`${styles.display} ${styles.priceValue}`}>$10</span>
                  <span className={styles.pricePer}>/ ay (planlı)</span>
                </div>
                <p className={styles.priceDesc}>
                  Büyüyen topluluklar, oyun merkezleri ve çok kanallı sunucular için tüm yetenekler.
                  Fiyatlar ve limitler planlı — hiçbir şey uygulanmıyor.
                </p>
                <ul className={`${styles.priceList} ${styles.priceListBright}`}>
                  <li className={`${styles.priceLi} ${styles.priceLiStrong}`}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: 2 aktif canlı Discord botu
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: en fazla 5 bağlı Discord sunucusu
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: 2.000 AI kredisi (~1.800 kurulum)
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: XP, roller ve ayarlar her yeniden başlatmadan sonra yaşar
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: sen kurarken çevrimiçi kalır - düzenleme botu düşürmez
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Öncelikli geliştirici e-posta ve Discord desteği
                  </li>
                </ul>
              </div>
              <div className={styles.priceCtaBlock}>
                <button
                  type="button"
                  disabled
                  style={{ font: 'inherit', cursor: 'not-allowed' }}
                  className={`${styles.btnPrimary} ${styles.priceCtaPrimary}`}
                >
                  Pro — çok yakında
                </button>
              </div>
            </div>

            <div className={`${styles.priceCard} ${styles.reveal}`}>
              <div>
                <div className={styles.priceHeadRow}>
                  <h3 className={styles.priceName}>Corvus Studio</h3>
                  <span className={styles.priceFlag}>Ağlar ve Ajanslar</span>
                </div>
                <div className={styles.priceRow}>
                  <span className={`${styles.display} ${styles.priceValue}`}>$29</span>
                  <span className={styles.pricePer}>/ ay (planlı)</span>
                </div>
                <p className={styles.priceDesc}>
                  Aynı anda çok sayıda topluluk yöneten ağlar ve ajanslar için. Fiyatlar ve limitler
                  planlı — hiçbir şey uygulanmıyor.
                </p>
                <ul className={styles.priceList}>
                  <li className={`${styles.priceLi} ${styles.priceLiStrong}`}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: 8 aktif canlı Discord botu
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: en fazla 100 bağlı Discord sunucusu
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Planlı: ayda 6.000 AI kredisi
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Önce her şeyi bir deneme sunucusunda test et
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Her yayından önce ön kontroller
                  </li>
                  <li className={styles.priceLi}>
                    <Check size={12} className={styles.priceCheck} aria-hidden="true" />
                    Bir insana ihtiyacın olduğunda öncelikli destek
                  </li>
                </ul>
              </div>
              <button
                type="button"
                disabled
                style={{ font: 'inherit', cursor: 'not-allowed' }}
                className={`${styles.btnGhost} ${styles.priceCta}`}
              >
                Studio — çok yakında
              </button>
            </div>
          </div>
        </section>

        <section id="faq" className={styles.faq}>
          <div className={`${styles.faqHead} ${styles.reveal}`}>
            <h2 className={`${styles.display} ${styles.faqTitle}`}>Sıkça Sorulan Sorular</h2>
            <p className={styles.faqLede}>
              Mimari, jeton güvenliği ve fiyatlandırma hakkında bilmen gereken her şey.
            </p>
          </div>

          <div className={styles.faqList} id="faqList">
            {FAQS.map((faq, index) => (
              <div
                key={faq.q}
                className={`${styles.card} ${styles.faqItem} ${styles.reveal}`}
                data-testid="faq-item"
                data-open={index === 0 ? 'true' : 'false'}
              >
                <button
                  className={styles.faqQ}
                  aria-expanded={index === 0 ? 'true' : 'false'}
                  type="button"
                >
                  <span>{faq.q}</span>
                  <span className={styles.faqPlus} aria-hidden="true">
                    +
                  </span>
                </button>
                <div className={styles.faqA}>
                  <div className={styles.faqAInner}>
                    <p className={styles.faqAText}>{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div aria-hidden="true" className={styles.footerGlowWrap}>
          <div className={styles.footerGlow} />
          <div className={styles.footerVeil} />
        </div>

        <div className={styles.footerInner}>
          <div className={styles.footerTop}>
            <div className={styles.footerBrandCol}>
              <a href="#top" className={styles.brand} aria-label="Corvus ana sayfa">
                <BrandMark />
                <span className={styles.footerBrandName}>CORVUS</span>
              </a>
              <p className={styles.footerTag}>
                Discord botunu sade sözlerle kur. Kod yok. Jeton yapıştırmak yok — botunun jetonunu
                şifreli olarak saklarız.
              </p>
            </div>

            <div className={styles.footerCols}>
              <nav aria-label="Ürün" className={styles.footerCol}>
                <p className={styles.footerHeading}>Ürün</p>
                <a className={styles.footerLink} href="#how-it-works">
                  Nasıl çalışır
                </a>
                <a className={styles.footerLink} href="#bento">
                  Özellikler
                </a>
                <a className={styles.footerLink} href="#templates">
                  Şablonlar
                </a>
                <a className={styles.footerLink} href="#pricing">
                  Fiyatlar
                </a>
              </nav>
              <nav aria-label="Kaynaklar" className={styles.footerCol}>
                <p className={styles.footerHeading}>Öğren</p>
                <a className={styles.footerLink} href="#faq">
                  SSS
                </a>
                <a className={styles.footerLink} href="#bento">
                  Özellikler
                </a>
                <a className={styles.footerLink} href="#how-it-works">
                  Nasıl çalışır
                </a>
              </nav>
              <nav aria-label="Şirket" className={styles.footerCol}>
                <p className={styles.footerHeading}>Şirket</p>
                <a className={styles.footerLink} href="/privacy">
                  Gizlilik Politikası
                </a>
                <a className={styles.footerLink} href="/terms">
                  Kullanım Şartları
                </a>
                <a className={styles.footerLink} href="#top">
                  Ana sayfa
                </a>
                {/* Inert until real community accounts exist: rendered with the
                    non-interactive footerTag style, NOT footerLink, so no hover
                    affordance implies a link that does not exist (page.test.tsx
                    locks these as spans). */}
                <span className={styles.footerTag}>Topluluk Discord</span>
                <span className={styles.footerTag}>X (Twitter)</span>
              </nav>
            </div>
          </div>

          <div className={styles.footerBase}>
            <p className={styles.copyright}>© 2026 Corvus. Tüm hakları saklıdır.</p>
            <div className={styles.footerDotRow}>
              <span className={styles.footerDot} aria-hidden="true" />
            </div>
          </div>
        </div>
      </footer>

      <LandingEffects />
    </div>
  );
}
