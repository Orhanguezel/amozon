import Link from 'next/link';
import { Activity, BookOpenText, CheckCircle2, Code2, KeyRound, PackageSearch, Scale, Settings } from 'lucide-react';

const pages = [
  {
    title: 'Panel',
    href: '/',
    icon: CheckCircle2,
    purpose: 'Amozon operasyonunun giriş ekranıdır. Modüllere hızlı geçiş ve MVP durum özeti burada tutulur.',
    done: [
      'Ana modüllere tek ekrandan geçiş kartları eklendi.',
      'Keyword, araştırma, ürün analizi, tezler, ayarlar, dokümantasyon ve yazılımcı notu akışı tek sıraya alındı.',
      'Backend, admin ve test durumunu gösteren MVP özeti hazırlandı.',
    ],
    userActions: [
      'Günün işine göre ilgili modüle hızlı geçiş yapılır.',
      'Yeni kullanıcı için panelin kapsamı bu ekrandan anlaşılır.',
    ],
    data: 'Statik operasyon özeti ve modül linkleri kullanılır.',
    watch: 'Port veya servis bilgileri değişirse MVP durumu metinleri güncellenmelidir.',
  },
  {
    title: 'Anahtar Kelimeler',
    href: '/keywords',
    icon: KeyRound,
    purpose: 'Araştırmada kullanılacak anahtar kelime havuzunu yönetir.',
    done: [
      'Keyword ekleme, silme ve düzenleme akışı yapıldı.',
      'Çok sayıda keyword için arama ve sayfalama eklendi.',
      'AI keyword genişletme paneli eklendi; ana keywordden varyasyon üretilebiliyor.',
      'Marketplace bilgisi keyword ile beraber saklanıyor.',
      'Varsayılan hedef keywordler sisteme eklendi: thermal labels, cable organizer, surge protector, dash cam, webcam lighting.',
    ],
    userActions: [
      'Yeni ürün fikri için önce keyword havuzuna kayıt açılır.',
      'AI ile varyasyon önerileri üretilir ve uygun olanlar havuza eklenir.',
      'Hatalı veya ilgisiz keywordler silinir ya da düzenlenir.',
    ],
    data: '`amazon_keywords` tablosu kullanılır. Admin API: `/api/keywords`, `/api/keywords/variations`.',
    watch: 'Aynı keyword farklı marketplace ile kullanılacaksa marketplace ayrımı korunmalıdır. Çok genel keywordler yetersiz veya kirli veri üretebilir.',
  },
  {
    title: 'Araştırmalar',
    href: '/scans',
    icon: Activity,
    purpose: 'Kayıtlı anahtar kelimelerden Amazon tarama işi başlatır ve iş durumunu takip eder.',
    done: [
      'Keyword dropdown akışı kayıtlı keyword havuzuna bağlandı.',
      'Marketplace seçimi ve çoklu pazar mantığı hazırlandı.',
      'Araştırma işi başlatma, durum takibi ve hata gösterimi eklendi.',
      'Tamamlanan, bekleyen, çalışan ve hatalı job durumları Türkçeleştirildi.',
      'Yetersiz veri, Oxylabs 429 ve eski MySQL statement hataları anlaşılır metne çevrildi.',
      'Hatalı veya yetersiz işlerde tekrar deneme altyapısı eklendi.',
    ],
    userActions: [
      'Keyword seçilir, marketplace seçilir ve Başlat ile canlı Amazon araştırması tetiklenir.',
      'İş tamamlanınca karar, veri sayısı ve hata alanları kontrol edilir.',
      'Hata varsa kısa süre sonra tekrar denenir veya Ayarlar sayfasından eşikler kontrol edilir.',
    ],
    data: '`amazon_scan_jobs`, `amazon_products`, `amazon_risk_scores`, `amazon_job_error_logs` tabloları kullanılır. Admin API: `/api/scans`.',
    watch: 'Oxylabs limit hatası 429 geldiğinde sistem tarafı çalışıyor olabilir; sağlayıcı limiti veya yoğunluk beklenmelidir. Yetersiz veri için kurtarma ayarları önemlidir.',
  },
  {
    title: 'Ürünler',
    href: '/products',
    icon: PackageSearch,
    purpose: 'Tamamlanmış araştırmaların ürün, satıcı, fiyat, yorum ve risk kırılımlarını gösterir.',
    done: [
      'Tamamlanmış scan seçimi için dropdown eklendi.',
      'Seçilen araştırmaya göre ürün tablosu, kategori karşılaştırması ve risk özeti gösteriliyor.',
      'Fiyat, rating, yorum sayısı, satıcı ve ASIN bilgileri listeleniyor.',
      'Kategori riski, SKU karmaşası, fiyat savaşı, marka güveni ve operasyon riski alanları görselleştiriliyor.',
      'Yetersiz veri sebebi risk çıktısına eklendi ve kullanıcıya gösterilecek hale getirildi.',
      'MarketPulse tarafındaki grafik ve tablo yaklaşımı bu sade admin mimarisine taşındı.',
    ],
    userActions: [
      'Dropdown ile tamamlanmış araştırma seçilir.',
      'Ürünler fiyat, yorum ve satıcı yoğunluğuna göre incelenir.',
      'Risk skorları karar vermek için kullanılır, yetersiz veri varsa sebep okunur.',
    ],
    data: '`amazon_products`, `amazon_risk_scores`, `amazon_keepa_snapshots` verileri kullanılır. Admin API: `/api/scans/:jobId`, `/api/risk-scores/:keyword`.',
    watch: 'Scan tamamlanmadan ürün ekranında veri oluşmaz. Ürün sayısı düşükse Araştırmalar veya Ayarlar tarafında veri toplama stratejisi büyütülmelidir.',
  },
  {
    title: 'Tezler',
    href: '/theses',
    icon: Scale,
    purpose: 'AL ve Takip Et tezlerini listeler; yeniden değerlendirme ve arşiv kapatma aksiyonlarını sunar.',
    done: [
      'Durum sekmeleri: Aktif, Zayıfladı, Bozuldu, Kapalı arşiv.',
      'Tez kartında anahtar sinyal farkı ve bileşik skor özeti gösterilir.',
      'Şimdi Değerlendir ve Kapat için backend `/api/theses` uçları kullanılır.',
    ],
    userActions: [
      'Ürün veya tarama ekranından tez oluşturulduktan sonra bu sayfadan izlenir.',
      'Pazar sinyali değiştiğinde Şimdi Değerlendir ile güncel scan ile karşılaştırılır.',
    ],
    data: '`amazon_theses` tablosu ve Admin proxy: `/api/theses`, `/api/theses/:id/evaluate`, `/api/theses/:id/close`.',
    watch: 'Tez yalnızca AL veya Takip Et kararından oluşturulabilir; backend kuralına uyun.',
  },
  {
    title: 'Ayarlar',
    href: '/settings',
    icon: Settings,
    purpose: 'Oxylabs, Keepa, Groq/OpenAI ve skorlama/veri kurtarma ayarlarını yönetir.',
    done: [
      'Oxylabs kullanıcı adı ve şifre alanları eklendi.',
      'Keepa API anahtarı, canlı token ölçümü ve yerel günlük harcama limiti yönetimi eklendi.',
      'Groq ve OpenAI API anahtarları panelden girilebilir hale getirildi.',
      'Skorlama ağırlıkları ve karar eşikleri ayarlanabilir yapıldı.',
      'Minimum review count, minimum ürün sayısı ve confidence eşikleri hard-code olmaktan çıkarıldı.',
      'Yetersiz veri için daha fazla sayfa çekme, keyword varyasyonu ve recovery mantığı ayara bağlandı.',
      'Keepa kullanım durumu ve kuyruk özeti gösteriliyor.',
    ],
    userActions: [
      'API anahtarları girilir veya güncellenir.',
      'Veri az geliyorsa Amazon sayfa sayısı ve recovery ayarları artırılır.',
      'Skorlama hassasiyeti kategoriye göre ayarlanır.',
    ],
    data: 'Backend `.env` dosyası ve runtime env güncellenir. Gerçek Keepa token durumu Keepa `/token` API endpointinden, yerel kullanım ise `amazon_keepa_daily_budget` ve `amazon_keepa_queue` tablolarından okunur.',
    watch: 'Boş bırakılan API keyler silinmez; sadece dolu gönderilen değerler güncellenir. Keepa yerel günlük limit gerçek paket bilgisi değildir, sadece bizim sistemin harcama frenidir.',
  },
  {
    title: 'Dokümantasyon',
    href: '/documentation',
    icon: BookOpenText,
    purpose: 'Paneldeki tüm sayfaların ne işe yaradığını ve doğru kullanım sırasını açıklar.',
    done: [
      'Tüm sayfalar için amaç, yapılan geliştirme, kullanıcı aksiyonu, veri kaynağı ve dikkat notları yazıldı.',
      'Operasyon akışı adım adım anlatıldı.',
      'Canlı servis, API ve DB teknik notları eklendi.',
    ],
    userActions: [
      'Yeni kullanıcılar önce bu sayfayı okuyarak panel mantığını öğrenir.',
      'Sorun çıktığında ilgili sayfanın veri kaynağı ve dikkat notu kontrol edilir.',
    ],
    data: 'Statik rehber içeriği kullanır; DB yazmaz.',
    watch: 'Yeni modül eklendiğinde bu sayfa da güncellenmelidir.',
  },
  {
    title: 'Yazılımcı Notu',
    href: '/developer-notes',
    icon: Code2,
    purpose: 'Kullanıcının sorun, istek ve ekran notlarını doğrudan veritabanına kaydetmesini sağlar.',
    done: [
      'Kullanıcı not formu eklendi: konu, yazan, sayfa, öncelik, ek link ve not alanı.',
      'Notlar DB’ye kaydediliyor ve listeleniyor.',
      'Notlar İnceleniyor veya Çözüldü durumuna alınabiliyor.',
      'Silme ve ek link açma akışı eklendi.',
      'Canlı DB tablosu oluşturuldu: `amazon_developer_notes`.',
    ],
    userActions: [
      'Kullanıcı bir hata, istek veya ekran görüntüsü linkini buraya yazar.',
      'Ekip DB’den veya panelden notu görür ve hızlı aksiyon alır.',
      'Aksiyon başladıysa İnceleniyor, tamamlandıysa Çözüldü yapılır.',
    ],
    data: '`amazon_developer_notes` tablosu kullanılır. Admin API: `/api/developer-notes`.',
    watch: 'Bu alan kullanıcı geri bildirim merkezidir; silme yerine genelde Çözüldü/Arşiv mantığı tercih edilmelidir.',
  },
];

const flow = [
  'Anahtar Kelimeler sayfasında araştırılacak ürün keywordlerini hazırla.',
  'Araştırmalar sayfasında keyword ve marketplace seçerek tarama başlat.',
  'Ürünler sayfasında tamamlanan araştırmayı seç ve risk/ürün analizini incele.',
  'Uzun vadeli izleme için Tezler sayfasında tez oluştur veya mevcut tezleri yeniden değerlendir.',
  'Yetersiz veri varsa Ayarlar sayfasından sayfa sayısı, filtre ve kurtarma ayarlarını güncelle.',
  'Sorun veya istek oluşursa Yazılımcı Notu sayfasına kayıt bırak.',
];

const technicalNotes = [
  'Backend canlıda `amozon-api` PM2 servisiyle çalışır ve Amazon scraping/scoring API yüzeyini sağlar.',
  'Admin panel canlıda `amozon-panel` PM2 servisiyle `/amozon` base path altında çalışır.',
  'Kullanıcı notları `amazon_developer_notes` tablosunda saklanır.',
  'API anahtarları Settings üzerinden backend `.env` dosyasına yazılır ve runtime env güncellenir.',
  'Keepa gerçek token bilgisi canlı API’den ölçülür; `KEEPA_DAILY_TOKEN_BUDGET` sadece yerel harcama limitidir.',
];

const scoringDetails = [
  'Kategori Riski: ürün kalabalığı, satıcı yoğunluğu ve kategori rekabet sinyallerini değerlendirir.',
  'SKU Karmaşası: varyasyon, fiyat yayılımı ve liste karmaşıklığını ölçer.',
  'Fiyat Savaşı: düşük fiyat kümeleri, fiyat düşüşleri ve fiyat aralığı baskısını inceler.',
  'Marka Güveni: marka parçalanması, zayıf listeleme ve satıcı güven sinyallerini skorlar.',
  'Operasyon Riski: yorum problemi ve kritik operasyon uyarılarını hesaba katar.',
  'Bileşik Skor: yeterli güven oluşursa ağırlıklı karar skoru üretir; veri yetersizse karar dışı kalabilir.',
];

const scoreScale = [
  {
    range: '0 - 2',
    label: 'Çok Düşük Risk',
    meaning: 'Pazar sinyalleri sakin görünür. Rekabet, fiyat baskısı veya operasyon riski düşük olabilir.',
    action: 'Genelde “Güvenli” kararına yakın yorumlanır; yine de ürün kalitesi ve tedarik gerçekliği ayrıca kontrol edilir.',
  },
  {
    range: '2.1 - 4',
    label: 'Düşük / Yönetilebilir Risk',
    meaning: 'Bazı risk sinyalleri vardır ama kategori tamamen kırmızı değildir.',
    action: 'Dikkatli fiyatlandırma, satıcı analizi ve ürün farklılaştırmasıyla test edilebilir.',
  },
  {
    range: '4.1 - 6',
    label: 'Orta Risk',
    meaning: 'Rekabet, fiyat oynaklığı, satıcı yoğunluğu veya veri kalitesi daha dikkatli okunmalıdır.',
    action: '“Dikkatli Ol” bölgesidir. Ek sayfa tarama, Keepa kontrolü ve manuel ürün incelemesi önerilir.',
  },
  {
    range: '6.1 - 8',
    label: 'Yüksek Risk',
    meaning: 'Kategoriye girmek maliyetli veya zor olabilir. Fiyat savaşı, SKU karmaşası ya da marka güven problemi baskın olabilir.',
    action: 'Ancak güçlü tedarik, marka avantajı veya net farklılaşma varsa değerlendirilmelidir.',
  },
  {
    range: '8.1 - 10',
    label: 'Çok Yüksek Risk',
    meaning: 'Pazar kırmızı sinyal verir. Aşırı rekabet, zayıf marj, operasyon problemi veya veri bazlı güçlü uyarılar olabilir.',
    action: 'Genelde “Girme” kararına yakındır. Girmek için çok güçlü stratejik gerekçe gerekir.',
  },
];

const decisionScale = [
  'Güvenli: Bileşik skor düşük ve veri güveni yeterliyse kategori test edilebilir görünür.',
  'Dikkatli Ol: Orta banttır. Ek veri, Keepa geçmişi, manuel ürün incelemesi ve fiyat/marj hesabı gerekir.',
  'Girme: Risk skoru yüksekse veya kritik sinyaller baskınsa pazara girmek önerilmez.',
  'Yetersiz Veri: Sistem karar vermek için yeterli güvene ulaşamamıştır. Skor yerine eksik veri sebebi okunmalıdır.',
  'Karışık Sinyal: Bazı boyutlar yüksek risk, bazıları düşük risk verir. Manuel karar gerekir.',
];

const troubleshooting = [
  {
    title: 'API 404 görürsem',
    text: 'Canlı panel `/amozon` base path ile çalışır. Browser istekleri `/amozon/api/...` gitmelidir. Kök `/api/...` görürsen eski cache veya service worker temizlenmelidir.',
  },
  {
    title: 'Yetersiz Veri çıkarsa',
    text: 'Ürün sayısı, review filtresi veya fiyat verisi eksik olabilir. Ayarlar sayfasından search pages, recovery pages ve confidence eşikleri kontrol edilir.',
  },
  {
    title: 'Oxylabs 429 çıkarsa',
    text: 'Bu genellikle sağlayıcı limit veya geçici rate limit durumudur. Kısa süre bekleyip yeniden denemek, sayfa sayısını azaltmak veya hesap limitini kontrol etmek gerekir.',
  },
  {
    title: 'AI varyasyon üretmezse',
    text: 'Groq veya OpenAI anahtarı yoksa sistem fallback keyword varyasyonları üretir. Daha kaliteli öneri için AI key Settings sayfasına girilmelidir.',
  },
  {
    title: 'Keepa verisi gelmezse',
    text: 'Keepa API key, canlı token durumu, yerel günlük limit ve kuyruk durumu kontrol edilir. Keepa özellikle yetersiz veri veya riskli ürünlerde devreye alınır.',
  },
  {
    title: 'Notlar görünmezse',
    text: '`amazon_developer_notes` tablosu ve `/api/developer-notes` endpointi kontrol edilir. Canlıda yazma/silme smoke testi başarılıdır.',
  },
];

const decisionJsonContract = [
  '`decision_surface`: scan seviyesindeki normalize karar yüzeyidir. `legacy_decision`, `primary_action`, `confidence`, `confidence_blockers`, `top_reasons`, `operator_summary`, `data_gate` ve `action_distribution` alanlarını taşır.',
  '`legacy_decision`: eski scoring motorunun teknik kararıdır. Dış kullanımda ana karar değildir; `GUVENLI`, `DIKKATLI_OL`, `GIRME`, `MIXED_SIGNAL`, `INSUFFICIENT_DATA` değerlerini taşıyabilir.',
  '`primary_action`: operatör kararıdır. Dış kullanıcı ve AI değerlendirmesi için ana alan budur: `AL`, `TAKIP_ET`, `UZAK_DUR`.',
  '`data_gate`: kararın yayıma/veriye hazır olup olmadığını söyler. `READY`, `ENRICHMENT_REQUIRED` veya `INSUFFICIENT_DATA` döner.',
  '`action_distribution`: scan içindeki SKU aksiyon dağılımını verir. Tüm SKUlar tek aksiyona düşerse uyarı üretir.',
  '`data_quality`: scan seviyesinde veri kalitesidir. Ürün sayısı, fiyat kapsaması, satıcı kapsaması, Keepa kapsaması ve confidence blocker listesini taşır.',
  '`sku_decisions`: ürün seviyesinde aksiyon ve reasoning listesidir. Her SKU için `asin`, `title`, `action`, `confidence`, `reasons` ve `signals` alanları vardır.',
  '`scores`: kategori riski, SKU karmaşası, fiyat savaşı, marka güveni ve operasyon riski boyutlarının skor/confidence/reason çıktılarıdır.',
  '`persuasion_points`: operatörün veya satış ekibinin hızlı okuyacağı ticari argüman listesidir.',
  '`GET /amozon/api/scans/{jobId}/decision`: entegrasyon ve AI tüketimi için sade karar JSON çıktısını döndürür; tam ürün tablosu yerine karar kontratını verir.',
  '`GET /amozon/api/scans/{jobId}/decision-json`: geriye uyumluluk için korunur; yeni kullanımda `/decision` tercih edilir.',
];

const enrichmentStrategy = [
  'Mevcut search verisi satıcıyı her zaman vermediği için ürün başlığından çıkan marka tahmini gerçek seller gibi kullanılmaz.',
  'Düşük maliyetli ilk adım: Keepa snapshot ve Buy Box/seller sinyallerini yalnızca riskli veya yetersiz veri çıkan ASINlerde kullanmak.',
  'Buy Box, seller trend ve gerçek fiyat history alanları Keepa snapshotta yoksa JSON bunu eksik enrichment olarak göstermelidir; bu değerler tahminle doldurulmaz.',
  'Daha pahalı ikinci adım: Oxylabs product/detail veya offer endpoint ile sadece öncelikli SKUlar için seller enrichment yapmak.',
  'En maliyetli seçenek: ürün sayfası parser ile seller bilgisi çıkarmak; rate limit ve bakım maliyeti daha yüksektir.',
  'Önerilen strateji: önce Keepa, sonra yalnızca aksiyon alınabilir ve satıcı verisi eksik SKUlar için detail enrichment.',
];

const liveExamples = [
  '`thermal labels`: yüksek veri sayısında bile satıcı kapsaması düşükse karar yüzeyi bunu confidence blocker olarak gösterir.',
  '`dash cam`: risk yüksek olduğunda ana aksiyon Uzak Dur olabilir; reason listesi fiyat/marka/operasyon sinyallerini açıklar.',
  '`cable organizer`: satıcı verisi eksikse ürün kartında Marka tahmini ayrı rozetle görünür, gerçek satıcı gibi davranmaz.',
  '`surge protector`: ürün sayısı düşükse karar Yetersiz Veri’ye düşebilir ve recovery/Keepa stratejisi devreye alınır.',
];

export function DocumentationPanel() {
  return (
    <div className="content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Dokümantasyon</h2>
            <p className="muted">Amozon panelindeki tüm sayfaların amacı, kullanım sırası ve teknik notları.</p>
          </div>
        </div>
        <div className="panel-body docs-hero">
          <BookOpenText size={28} />
          <div>
            <strong>Amazon ürün araştırma ve skorlama operasyon rehberi</strong>
            <p className="muted">
              Bu panel keyword havuzu, Amazon araştırması, ürün analizi, tez izleme, API ayarları ve kullanıcı geri bildirimlerini tek akışta toplar.
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Sayfa Rehberi</h2>
            <p className="muted">Her modülün görev alanı ve hangi durumda kullanılacağı.</p>
          </div>
        </div>
        <div className="panel-body docs-grid">
          {pages.map((page) => (
            <article className="doc-card" key={page.href}>
              <div className="doc-card-title">
                <page.icon size={20} />
                <div>
                  <h3>{page.title}</h3>
                  <Link href={page.href}>{page.href}</Link>
                </div>
              </div>
              <p>{page.purpose}</p>
              <div className="doc-detail">
                <strong>Yapılanlar</strong>
                <ul>
                  {page.done.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="doc-detail">
                <strong>Kullanıcı ne yapar?</strong>
                <ul>
                  {page.userActions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="doc-note">
                <b>Veri / API</b>
                <span>{page.data}</span>
              </div>
              <div className="doc-note warning">
                <b>Dikkat</b>
                <span>{page.watch}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Önerilen İş Akışı</h2>
            <p className="muted">Pintopin tarzı işlem sırası: önce kaynak, sonra tarama, sonra analiz, sonra geri bildirim.</p>
          </div>
        </div>
        <div className="panel-body flow-list">
          {flow.map((item, index) => (
            <div className="flow-item" key={item}>
              <b>{index + 1}</b>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Yazılımcı İçin Teknik Notlar</h2>
            <p className="muted">Canlı sistemde hızlı kontrol edilecek noktalar.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            {technicalNotes.map((note) => (
              <div key={note}>
                <span>Not</span>
                <b className="technical-note">{note}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Skorlama Motoru Detayı</h2>
            <p className="muted">Ürün araştırmasında kullanılan karar boyutları.</p>
          </div>
        </div>
        <div className="panel-body docs-grid compact">
          {scoringDetails.map((detail) => (
            <div className="doc-note" key={detail}>
              <b>Skor Boyutu</b>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">1-10 Skor Derecelendirmesi</h2>
            <p className="muted">Skor yükseldikçe risk artar. 1 düşük risk, 10 çok yüksek risk anlamına gelir.</p>
          </div>
        </div>
        <div className="panel-body score-scale-grid">
          {scoreScale.map((item) => (
            <article className="score-scale-card" key={item.range}>
              <div className="score-range">{item.range}</div>
              <h3>{item.label}</h3>
              <p>{item.meaning}</p>
              <span>{item.action}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Karar Etiketleri Ne Anlama Gelir?</h2>
            <p className="muted">Skor tek başına yeterli değildir; sistem veri güveni ve karar eşiğini birlikte kullanır.</p>
          </div>
        </div>
        <div className="panel-body flow-list">
          {decisionScale.map((item, index) => (
            <div className="flow-item" key={item}>
              <b>{index + 1}</b>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Decision Surface JSON Kontratı</h2>
            <p className="muted">API çıktısında scan-level, dimension-level ve SKU-level alanlar ayrı tutulur.</p>
          </div>
        </div>
        <div className="panel-body docs-grid compact">
          {decisionJsonContract.map((item) => (
            <div className="doc-note" key={item}>
              <b>JSON Alanı</b>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Enrichment Stratejisi ve Maliyet</h2>
            <p className="muted">Satıcı ve Keepa zenginleştirmesi her SKU için değil, karar değerine göre seçici kullanılmalıdır.</p>
          </div>
        </div>
        <div className="panel-body docs-grid compact">
          {enrichmentStrategy.map((item) => (
            <div className="doc-note warning" key={item}>
              <b>Strateji</b>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Canlı Keyword Örnekleri</h2>
            <p className="muted">Panelde test edilen keywordlerden beklenen karar yüzeyi davranışları.</p>
          </div>
        </div>
        <div className="panel-body flow-list">
          {liveExamples.map((item, index) => (
            <div className="flow-item" key={item}>
              <b>{index + 1}</b>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Hızlı Sorun Giderme</h2>
            <p className="muted">Canlı kullanımda en sık bakılacak durumlar.</p>
          </div>
        </div>
        <div className="panel-body docs-grid compact">
          {troubleshooting.map((item) => (
            <div className="doc-note warning" key={item.title}>
              <b>{item.title}</b>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
