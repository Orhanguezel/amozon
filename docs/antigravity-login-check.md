# Antigravity — Login Ekranı UI Doğrulama Görevi

## Görev

Amozon admin panel login ekranının görsel kalitesini doğrula ve ekran görüntüsü al.

## Uygulama URL

Dev ortamı: `http://localhost:3002/login`

(Port farklıysa `admin_panel/` klasöründe `bun run dev` ile başlat, terminaldeki portu kullan.)

## Kontrol Listesi

### 1. Arka plan ve orb animasyonları
- [ ] Sayfa arka planı koyu (#08090c) — siyaha yakın lacivert
- [ ] Sol üstte teal/yeşil orb (blur'lu, hafif parlayan)
- [ ] Sağ altta mavi orb
- [ ] Sağ ortada küçük yeşil orb
- [ ] Orbların `pulse` animasyonu görünür (scale + opacity değişimi)

### 2. Kart (glassmorphism)
- [ ] Kart beyaz arka plandan değil, sayfa merkezinde cam efektli kutu olarak görünüyor
- [ ] Backdrop blur etkisi aktif (arka plandaki orblar kartın arkasında bulanık görünüyor)
- [ ] Kart kenarı çok ince beyaz border (rgba)
- [ ] Kart köşeleri yuvarlatılmış (24px)

### 3. Header alanı
- [ ] BarChart2 ikonu teal-blue gradient kare içinde, köşeleri 18px yuvarlatılmış
- [ ] İkon kutusunun altında yeşilimsi gölge (`box-shadow`)
- [ ] "Amozon" başlığı büyük ve bold
- [ ] "Amazon Ticari Radar — Yönetici Girişi" alt başlığı soluk gri

### 4. Form alanları
- [ ] "Kullanıcı Adı" ve "Şifre" etiketleri küçük büyük harf (uppercase), soluk
- [ ] Her input solunda ilgili Lucide ikonu var (User / Lock)
- [ ] Input focus aldığında sol ikon teal renge döner
- [ ] Input focus aldığında teal glow border görünür
- [ ] Input placeholder rengi çok koyu, zor okunur (bilerek — `#334155`)

### 5. Hata durumu
- Yanlış şifre gir (`admin` / `yanlis123`), Giriş Yap'a bas
- [ ] Kırmızı bordered hata kutusu çıkıyor
- [ ] Hata kutusu `shake` animasyonu yapıyor (sağ-sol sallantı)

### 6. Yükleniyor durumu
- Doğru credentials girmeden önce butona bas ve 1-2 saniye izle
- [ ] "Giriş Yap" metni yerine dönen spinner görünüyor
- [ ] Buton disabled durumda

### 7. Submit butonu
- [ ] Teal → Blue gradient buton
- [ ] Hover'da hafif opacity azalıyor
- [ ] "Giriş Yap" metni + ChevronRight ikonu yan yana

### 8. Footer
- [ ] Kartın altında "PASPAS ERP · AMOZON MODÜLÜ" küçük uppercase text
- [ ] Renk çok soluk (`#334155`)

## Ekran Görüntüsü

Doğrulama tamamlandıktan sonra aşağıdaki durumların ekran görüntüsünü `docs/image/` klasörüne kaydet:
1. `login-default.png` — Boş form, orb animasyonları görünür halde
2. `login-error.png` — Hatalı giriş sonrası hata mesajı

## Sorun Varsa

Görsel sorun bulursan `admin_panel/src/app/login/login.module.css` dosyasında düzeltmeyi yap.
Büyük layout değişikliği gerekiyorsa önce @Claude'a sor.
