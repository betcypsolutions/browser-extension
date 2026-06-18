# 📨 Ulak Ekran Görüntüsü — Kullanım Kılavuzu

Bu uzantı, **tarayıcıda hangi sayfada olursan ol** hızlıca ekran görüntüsü almanı,
üstüne işaret koymanı/hassas yerleri gizlemeni ve **doğrudan chat sohbetine**
göndermeni sağlar. Ayrı bir program açmana gerek yok.

> Gönderim senin chat hesabınla yapılır — uzantıda şifre/anahtar tutulmaz.
> Yakalanan görüntü ve bilgiler **yalnız sen "Gönder" dediğinde** sohbete gider.

---

## 1) İlk kurulum (bir kez)

**Chrome / Edge**
1. Uzantı zaten yüklüyse bu adımı atla. Değilse: `chrome://extensions` → sağ üst **Geliştirici modu** açık → **Paketlenmemiş öğe yükle** → uzantı klasörünü seç.
2. Hazır.

**Firefox**
1. `about:debugging` → **Bu Firefox** → **Geçici Eklenti Yükle** → `manifest.json` dosyasını seç.
2. (Kalıcı kurulum için BT ekibine danış — imzalı sürüm gerekir.)

**Her iki tarayıcı — giriş:**
- Chat uygulamasına (panel) **giriş yapmış ol**. Uzantı, gönderirken senin oturumunu oradan kullanır.
- API adresi **otomatik** seçilir; normalde Ayarlar'a dokunman gerekmez.

---

## 2) Ekran görüntüsü alma

Üç yoldan biriyle başlat:

| Yol | Ne yapar |
|-----|----------|
| **Alt + Shift + S** | Sayfada **alan seçerek** yakala |
| Araç çubuğundaki **uzantı ikonu** | Aynı: alan seçerek yakala |
| Sayfada **sağ tık → "Ekran görüntüsü al (bölge)…"** | Aynı |
| **Alt + Shift + E** | **Tam sayfayı** (kaydırarak, uçtan uca) yakala |
| Sağ tık → **"Tam sayfa yakala…"** | Aynı: tam sayfa |

> Kısayol çalışmazsa sağ-tık menüsünü kullan; ya da tarayıcının "Eklenti kısayolları" ayarından değiştir.

**Bölge seçme:** Ekran kararır, imleç artıya döner → göndermek istediğin yeri **sürükleyerek** seç.
Hiç sürüklemezsen tüm görünür alan alınır. Vazgeçmek için **Esc**.

---

## 3) İşaretleme ve gizleme

Yakaladıktan sonra düzenleme ekranı açılır. Üstteki araçlar:

| Araç | İşlev |
|------|-------|
| ✏️ Kalem | Serbest çizim |
| 🖍️ Fosforlu | Yarı saydam vurgu |
| ↗ Ok | İşaret oku |
| ▭ Dikdörtgen | Çerçeveleme |
| ◯ Daire | Daire/elips |
| **T** Metin | Tıkla, yaz, **Enter** (vazgeç: Esc) |
| ① Adım | Tıkladıkça **1, 2, 3…** numaralı rozet bırakır |
| 🌫️ **Blur** | Sürüklediğin alanı **bulanıklaştırır** — müşteri bilgisi, token gibi **hassas verileri gizlemek için** |

- Sağdaki **renk** ve **kalınlık** (ince/orta/kalın) seçilebilir.
- **↶ Geri al** / **↷ İleri al** ile düzeltebilirsin.
- Hiçbir şey çizmek zorunda değilsin → doğrudan **Devam →**.

---

## 4) Nereye göndereceğini seçme

**Devam →** dedikten sonra sohbet listesi gelir.

**Önce gönderim modunu seç** (listenin üstündeki anahtar):
- **✏️ Sohbette onayla** (varsayılan): bir sohbete tıklayınca görsel **gönderilmez**, o sohbetin **yazma kutusuna düşer**. Panel açılır, son hâlini görüp **sen "Gönder" dersin**. (Notun da kutuya yazılır.)
- **⚡ Direkt gönder:** bir sohbete tıklayınca **anında** iletilir (onay beklemez).

**Sohbet seçme:**
- **Tek sohbete:** sohbetin **üstüne tıkla** (moda göre onaya düşer ya da anında gider).
- **Birden çok sohbete:** sağ üstteki **⊕ Çoklu seç**'e bas → sohbetlere tıklayarak işaretle (**Ctrl/Shift + tık** da olur) → **"Seçilenlere gönder (N)"**. Çoklu gönderim her zaman **anında** iletilir.
- **Son** başlığı altında en son gönderdiğin sohbetler kısayol olarak çıkar; üstteki kutudan **arayabilirsin**.

**Görsele ek olarak:**
- **Not** kutusuna yazdığın mesaj görselle birlikte gider (onayla modunda kutuya önceden yazılır).
- **Tanı bilgisi ekle** (varsayılan kapalı): açarsan sayfanın **adresi, tarayıcı bilgisi ve son hata/log kayıtları** mesaja eklenir — bir sorunu bildirirken çok işe yarar.
- **⛶ Tam ekran** (veya küçük önizlemeye tıkla) ile görseli büyütüp inceleyebilirsin.
- **⧉ Kopyala** / **⭳ İndir** ile göndermeden panoya kopyalayabilir veya bilgisayara kaydedebilirsin.

**Gönderdikten sonra:** chat paneli otomatik açılır ve gönderdiğin sohbete gider; yanlışlık olduysa oradan görüp mesajı silebilirsin.

---

## 5) İpuçları
- **Hassas veri varsa** göndermeden önce mutlaka 🌫️ **Blur** ile kapat.
- Adım adım anlatım için **① Adım** rozetlerini kullan: "1'e tıkla, sonra 2'ye…".
- Uzun bir form/sayfanın tamamını göndereceksen **Alt+Shift+E (tam sayfa)**.
- Aynı görseli birden çok ekibe atacaksan **kutucuklarla çoklu gönder** — tek seferde hepsine gider.

---

## 6) Sık karşılaşılanlar

| Sorun | Çözüm |
|-------|-------|
| **Kısayol çalışmıyor** | Sağ-tık menüsünü kullan; ya da tarayıcı eklenti-kısayolları ayarından farklı tuş ata. |
| **"Giriş bulunamadı"** | Chat panelinde (sekmesinde) giriş yapmış ol; panel sekmesini bir kez yenile. |
| **`chrome://` / `about:` sayfası yakalanmıyor** | Tarayıcı iç sayfaları yakalanamaz (güvenlik kuralı). Normal bir web sayfasında dene. |
| **DevTools / Konsol paneli görüntüye girmiyor** | Uzantı yalnız sayfa içeriğini alır; konsolu da istiyorsan işletim sistemi ekran-görüntü aracını kullan. |
| **Tam sayfada başlık tekrar ediyor / yavaş** | Sabit (fixed) başlıklar her dilimde görünebilir; çok uzun sayfalar bir noktada kesilir; işlem birkaç saniye sürer (normal). |

---

## 7) Gizlilik
- Uzantı, ekran görüntüsünü ve (açtıysan) tanı bilgisini **yalnız sen gönderince** chat sunucusuna iletir; başka hiçbir yere göndermez.
- Giriş için **kendi oturum token'ını** kullanır; uzantıda gizli anahtar saklanmaz.
- "Tanı bilgisi" kapalıyken sayfa adresi/log bilgisi **eklenmez**.
