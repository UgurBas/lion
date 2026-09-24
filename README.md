# LionCarWorks — Web Sitesi

Bursa / Osmangazi'deki LionCarWorks (kaporta & boya, boyasız göçük onarımı, PPF,
hasar onarımı) için **çok sayfalı**, animasyonlu tanıtım sitesi.
Framework yok — düz HTML, CSS ve JavaScript. Derleme adımı ve kurulum gerekmez.

## Çalıştırma

```powershell
cd C:\Project\Test\LionCarWorks
python -m http.server 5500      # veya:  npx serve .
```

Sonra tarayıcıda `http://localhost:5500` adresine gidin. (Dosyayı çift tıklayarak da
açabilirsiniz; yerel sunucu Google Haritalar kutusu ve fontlar için daha sağlıklıdır.)

## Sayfalar

Menü yapısı, `lioncarworks.tr` adresindeki mevcut sayfa düzenine göre kuruldu:

| Dosya | Sayfa | İçerik |
|---|---|---|
| `index.html` | Ana Sayfa | Kontak ekranı, hero, hizmet özeti, süreç, sayaçlar, önce/sonra, hızlı bağlantılar |
| `hizmetler.html` | Hizmetler | Altı hizmetin detayı (kapsam, ne zaman gerekir, ortalama süre) + S.S.S. |
| `galeri.html` | Galeri | Önce/sonra kaydırıcısı + 12 kutuluk galeri ızgarası |
| `randevu.html` | Randevu | Randevu formu, çalışma saatleri, "aracınızı bırakırken" listesi |
| `takip.html` | Servis Takibi | Plaka ile durum sorgusu + aşama açıklamaları |
| `odeme.html` | Ödeme | Ödeme yöntemleri, havale/IBAN bilgileri, fatura ve garanti notları |
| `hakkimizda.html` | Hakkımızda | Atölye anlatımı, "neden biz" kartları, sayaçlar |
| `iletisim.html` | İletişim | Telefon, adres, saatler, teklif formu, harita |
| `kvkk.html` | KVKK | Aydınlatma metni **şablonu** |
| `gizlilik.html` | Gizlilik | Gizlilik politikası **şablonu** |

Üst menü (Hizmetler · Galeri · Randevu · Servis Takibi · Hakkımızda · İletişim) ve footer
**her sayfada birebir tekrar eder**. Menüye madde ekler/çıkarırsanız 10 dosyanın hepsini
güncellemeniz gerekir; aktif sayfa `class="is-active"` ile işaretlenir.

## Dosya yapısı

```
*.html                      10 sayfa (yukarıdaki tablo)
assets/css/style.css        tüm stiller + responsive + prefers-reduced-motion
assets/js/main.js           kontak ekranı, scroll efektleri, devir saati, formlar
assets/js/engine-sound.js   Web Audio ile sentezlenen motor sesi (ses dosyası gerekmez)
assets/img/logo-original.png  gönderdiğiniz özgün logo dosyası (dokunulmadı)
assets/img/logo-mark.png      siteye yerleşen işaret (kırpılmış, saydam zemin)
assets/img/favicon.png        sekme ikonu 96x96
assets/img/favicon-32.png     sekme ikonu 32x32
assets/img/apple-touch-icon.png  iOS ana ekran ikonu 180x180 (koyu zeminli)
assets/img/before.svg       önce/sonra kaydırıcısı için yer tutucu
assets/img/after.svg        önce/sonra kaydırıcısı için yer tutucu
```

## Motor sesi (v3 — W16 quad-turbo)

Ses hazır bir mp3 değil; **her silindir ateşlemesi tek tek hesaplanarak** üretiliyor:
derin gövde vuruşu + egzoz rezonansı + orta bant "brap" + tiz atak + her patlamada
kısa gürültü darbesi, üstüne emme gürültüsü, **turbo ıslığı** (devir ve gazı yavaş
takip eder; gaz kesilince spool-down yapar), **blow-off "pss"**, marş motoru vınlaması
ve atölye yankısı. Rölanti döngüsü baş–son çapraz geçişle dikiliyor.

Varsayılan ayar 16 silindirli dört turbolu bir motoru modelliyor: devir başına 8
ateşleme olduğu için darbeler üst üste biner, tek tek "pat pat" yerine yoğun ve tiz
bir uğultu çıkar. Ölçülen değerler — rölanti temel frekansı **113 Hz** (850 rpm × 16
silindir), gaz tepesinde **867 Hz** (6.500 rpm); gaz tepesinde en güçlü bant 1–4 kHz,
4–9 kHz'de turbo ıslığı.

Sesi `assets/js/engine-sound.js` dosyasının başındaki `TUNE` bloğundan ayarlayın:

```js
var TUNE = {
  cylinders: 16,       // 4 = ince, 8 = kalın V8, 12/16 = pürüzsüz ve tiz
  volume: 0.65,        // genel ses düzeyi
  idleRpm: 850,        // rölanti devri
  revPeakRpm: 6500,    // açılışta çıkılan tepe devir
  blipPeakRpm: 4200,   // EngineSound.blip() için (site bunu çağırmıyor)
  turbo: 0.9,          // turbo ıslığı (0 = atmosferik motor)
  blowoff: 0.9,        // gaz kesmede "pss"
  crackle: 0.5,        // egzoz çıtırtısı (0 - 1)
  reverb: 0.26,        // atölye yankısı (0 = kapalı)
  idleSeconds: 3.4     // açılıştan sonra rölanti süresi
};
```

Hızlı reçeteler:

- **Kalın V8 (eski hal):** `cylinders: 8`, `idleRpm: 900`, `revPeakRpm: 6700`,
  `turbo: 0`, `blowoff: 0`, `crackle: 1`
- **Turbo dört silindir:** `cylinders: 4`, `idleRpm: 950`, `revPeakRpm: 6800`,
  `turbo: 1`, `blowoff: 1`
- **Daha sakin açılış:** `revPeakRpm: 4500`, `idleSeconds: 2`

### Kendi ses kaydınızı kullanmak

Artık kod değiştirmenize gerek yok. Dosyayı `assets/sound/` altına koyup
`engine-sound.js` içindeki `TUNE.sampleUrl` alanına yolunu yazmanız yeterli:

```js
sampleUrl: 'assets/sound/exhaust.mp3',   // açılış sesi (boş bırakılırsa sentez)
blipUrl:   ''                            // (opsiyonel) blip() için kayıt
```

Dosya açılamazsa (yanlış yol, eksik dosya, desteklenmeyen biçim) site sessiz
kalmaz: otomatik olarak sentezlenen sese düşer. Ses kapatıldığında dosyadan çalan
kayıt da durdurulur.

**Telif uyarısı:** yalnızca kendi çektiğiniz ya da kullanım hakkını aldığınız
kayıtları koyun. İnternette bulduğunuz bir videonun sesini ticari bir sitede
kullanmak telif ihlalidir; sentezlenen ses tam da bu yüzden var.

Tarayıcılar sesi yalnızca kullanıcı tıklamasından sonra oynatır — site bu yüzden
"KONTAĞI ÇEVİR" ekranıyla başlıyor.

## Öne çıkan davranışlar

- **Kontak ekranı** yalnızca ana sayfada ve **oturumda bir kez** çıkar (sessionStorage).
  Sayfalar arasında gezinirken tekrar gelmez.
- **Site içinde ses yoktur.** Motor sesi yalnızca açılış ekranında, kullanıcı
  "KONTAĞI ÇEVİR" dediğinde bir kez çalar; "sessiz gir" bağlantısı sesi atlar.
- Sayfa kaydırıldıkça **devir saati** ibresi 0 → 8.000 rpm hareket eder (ana sayfa).
- Sürüklenebilir **önce/sonra** karşılaştırması (fare, dokunma, klavye okları).
- Kaydırmayla açılan bölümler, 3B eğilen kartlar, mıknatıs butonlar, fareyi takip eden
  ışık, özel imleç (yalnızca fare kullanan cihazlarda).
- Mobilde alt tarafta sabit **Ara / WhatsApp / Yol Tarifi** çubuğu.
- `prefers-reduced-motion` açık kullanıcılarda tüm animasyonlar devre dışı kalır.

## Formlar

Randevu, servis takibi ve teklif formlarının üçü de **sunucuya kayıt atmaz**:
`data-wa-subject` niteliği taşıyan her form, alan etiketleriyle birlikte hazır bir
**WhatsApp mesajına** dönüşür (`main.js` → `sendWhatsApp`).

Kayıt tutan bir yapı isterseniz iki seçenek:

1. **Basit:** Formspree / Netlify Forms gibi bir servise `action` verin.
2. **Tam:** `sendWhatsApp` yerine kendi uç noktanıza `fetch(...)` atın; servis takibi
   için plakayı sorgulayan bir API bağlayın (böylece `takip.html` gerçek zamanlı çalışır).

## Yayına almadan önce değiştirilecekler

1. **Fotoğraflar.** `assets/img/before.svg` / `after.svg`, galerideki `gal__ph` kutuları,
   hizmet sayfasındaki `svc__ph` blokları ve hakkımızda sayfasındaki `about__ph` yer tutucudur.
   Gerçek fotoğraflarınızı koyup `<div class="...__ph">` yerine `<img src="..." alt="...">` yazın.
2. **Rakamlar.** "12+ yıl", "4.800+ araç", "24 ay garanti" örnek değerlerdir
   (`data-count`). 211B takipçi bilgisi Instagram hesabından alınmıştır.
3. **Çalışma saatleri.** Randevu ve iletişim sayfalarındaki saatler örnektir.
4. **IBAN / ünvan.** `odeme.html` içindeki `[Şirket ünvanınız]`, `[Banka adı]` ve IBAN
   alanları doldurulmalı.
5. **Hukuki metinler.** `kvkk.html` ve `gizlilik.html` şablondur; şirket bilgilerinizle
   düzenleyip hukuk danışmanınıza kontrol ettirin.
6. **Kuruluş yılı / ekip.** `hakkimizda.html` içinde bilerek boş bırakıldı — uydurma
   bilgi yazılmadı.
7. **Logo.** Kendi logonuz nav, footer, açılış ekranı ve favicon'larda kullanılıyor.
   Logoyu değiştirmek isterseniz yeni dosyayı `assets/img/logo-original.png` olarak
   koyup ikonları yeniden üretin (kırpma + saydamlık + boyutlar); kelime markası
   ("LION**CAR**WORKS / Premium Servis") HTML metni olduğu için her boyutta nettir ve
   `style.css` içindeki `.brand` kurallarından biçimlendirilir. Sitenin vurgu rengi
   logodan ölçülen turuncuya ayarlandı (`--gold: #f6920f`).
8. **Telefon.** `+90 545 123 09 96` — sayfalarda `tel:` / `wa.me` bağlantılarında,
   `main.js` içinde `WA` sabitinde geçer.
9. **Müşteri yorumları.** Bilerek eklenmedi; uydurma yorum yerine Google İşletme
   Profili'nden gelen gerçek yorumları eklemek doğru olur.

## Tarayıcı desteği

Chrome, Edge, Firefox, Safari (masaüstü + mobil). Web Audio desteklenmeyen eski
tarayıcılarda site sessiz çalışır, diğer her şey aynı kalır.
