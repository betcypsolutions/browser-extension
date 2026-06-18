# Ulak Ekran Görüntüsü Uzantısı

Herhangi bir sekmede/sayfada **ikon** veya **klavye kısayolu** ile ekran görüntüsü alır,
**kırpar** ve chat hesabınla seçtiğin bir kanala/DM'e gönderir. Chrome/Edge ve Firefox.

> Gönderim, chat web uygulamasında giriş yaptığın **kendi JWT** token'ınla yapılır.
> Uzantıda **hiçbir gizli anahtar yoktur** (MESSAGING_SSO_SECRET vb. ASLA bulunmaz).

## Nasıl çalışır
1. Bir sekmede `Alt+Shift+S`, araç çubuğundaki ikon, **veya sayfada sağ-tık → "Ekran görüntüsü al ve sohbete gönder"**.
2. Sayfa üstünde overlay açılır → **alanı sürükleyerek seç** (seçmezsen tüm görünür alan).
3. **İşaretleme** ekranı: kalem / ok / dikdörtgen / **blur** (hassas veriyi gizle) → Devam.
4. Mod seç: **✏️ Sohbette onayla** (görsel panelin yazma kutusuna düşer, kullanıcı orada gönderir) veya **⚡ Direkt gönder** (anında). Çoklu seç (⊕) → birden fazla sohbete anında.
5. **Direkt:** mesaj web uygulamasında **canlı** görünür (`POST /api/channels/:id/messages` + gateway broadcast). **Onayla:** uzantı, panel sekmesinde `localStorage['ulak:pendingShot']`'a yazıp `ulak:pendingShot` event'i tetikler; panel (`channels.component` → `SharedMediaService`) ilgili sohbeti açıp dosyayı+notu composer'a **pending** olarak düşürür (gönderme kullanıcıya kalır). → **Onayla modu için panel (frontend) bu sürümle yeniden derlenip deploy edilmeli.**

**API adresi otomatik:** Options boşsa, hangi panelde girişliysen (lokal `4200` → `3010`, prod `chat.cyp.world` → `chat-api.cyp.world`) o ortam otomatik seçilir. Token o panelden okunur (origin bazlı → lokal/prod karışmaz). Özel kurulumda Options'tan elle adres verilebilir.

## Kurulum (geliştirici modu)

### Chrome / Edge / Brave
```bash
./build.sh chrome           # manifest.json'u Chrome varyantıyla hazırlar
```
1. `chrome://extensions` → **Developer mode** açık.
2. **Load unpacked** → bu klasörü (`browser-extension/`) seç.
3. (İsteğe bağlı) `chrome://extensions/shortcuts` → kısayolu doğrula/değiştir.
4. Uzantı **Options** (Ayarlar) → **API adresi**: lokal için `http://localhost:3010`, prod için `https://chat-api.cyp.world`.

### Firefox
```bash
./build.sh firefox          # manifest.json'u Firefox varyantıyla hazırlar
```
1. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**.
2. Bu klasördeki `manifest.json` dosyasını seç.
3. Options'tan API adresini ayarla.

> Not: `build.sh` yalnızca doğru `manifest.*.json` dosyasını `manifest.json`'a kopyalar
> (her iki tarayıcı da kökte `manifest.json` bekler). Chrome `service_worker`,
> Firefox `background.scripts` kullandığı için iki varyant var.

## Kalıcı kurulum & paketleme

Geliştirici "geçici" kurulumu **Firefox'ta tarayıcı kapanınca silinir**; Chrome'da "Load unpacked" kalıcıdır ama uyarı verir. Kalıcı/dağıtılabilir için:

```bash
./package.sh    # dist/livechat-screenshot-{chrome,firefox}.zip üretir
```

### Chrome / Edge
- **Load unpacked kalıcıdır** (yeniden başlatmada kalır) — günlük kullanım için yeterli.
- Yaymak için: **Chrome Web Store** (özel/unlisted) ya da kurumsal **policy + self-hosted .crx**.

### Firefox (kalıcı = imzalı .xpi şart)
Firefox imzasız eklentiyi kalıcı yüklemez. AMO üzerinden **unlisted** imzalama (ücretsiz, mağazada listelenmez):
1. addons.mozilla.org → Tools → **Manage API Keys** → JWT issuer + secret al.
2. ```bash
   cp manifest.firefox.json manifest.json
   npx web-ext sign --channel=unlisted \
     --api-key=<AMO_JWT_ISSUER> --api-secret=<AMO_JWT_SECRET>
   ```
3. Oluşan imzalı **`.xpi`** (`web-ext-artifacts/` altında) → `about:addons` → dişli → "Install Add-on From File" → kalıcı.

Alternatifler: Firefox **ESR/Developer Edition** + `xpinstall.signatures.required=false`, ya da kurumsal **policies.json**.

> Not: `package.sh`/imzalama için makinede `zip` ve (npx ile) `web-ext` yeterli — başka kurulum gerekmez.

## Sürüm yükseltme — `bump.sh`
Sürüm artırma + imzalama tek komut. AMO aynı sürümü iki kez imzalamaz; her güncellemede artır.
```bash
export AMO_JWT_ISSUER="user:....."   # AMO API anahtarların
export AMO_JWT_SECRET="...."
./bump.sh patch --sign               # 1.0.0 -> 1.0.1, iki manifest'i artırır + imzalar
# ./bump.sh minor|major|1.4.2 de olur
```
`bump.sh` iki manifest'teki `version`'ı eşitler, `build.sh firefox` çalıştırır, `web-ext sign` ile imzalar (imzalı `.xpi` → `web-ext-artifacts/`).

## Oto-güncelleme (GitHub Releases)
Tüm makineler yeni sürümü kendiliğinden çeksin diye. `update_url` imzalı `.xpi`'ye gömülür ve **sabit** olmalı → `updates.json`'ı repo `main`'inden (raw), `.xpi`'yi Release asset'i olarak servis ederiz.

**Tek seferlik kurulum:**
1. `manifest.firefox.json` → `browser_specific_settings.gecko` altına ekle (repo adınla):
   ```json
   "update_url": "https://raw.githubusercontent.com/<KULLANICI>/<REPO>/main/updates.json"
   ```
2. `export GH_REPO="<KULLANICI>/<REPO>"` (+ AMO anahtarları).

**Her sürümde:**
```bash
./bump.sh patch --sign --publish
git add updates.json manifest.firefox.json manifest.chrome.json
git commit -m "vX.Y.Z" && git push        # updates.json main'e gider (sabit raw URL)
# GitHub'da 'vX.Y.Z' release'i aç → publish/ulak-ekran-goruntusu-X.Y.Z.xpi dosyasını ekle
```
- `updates.json` repo kökünde tutulur (raw URL sabit), içindeki `update_link` → Release asset `.xpi`.
- **İlk auto-update'li sürüm**: `update_url` eklenmiş ilk imzalı sürümü makinelere **bir kez elle** kur; sonraki sürümler otomatik gelir (Firefox `updates.json`'ı periyodik kontrol eder).
- Repo **public** olmalı (raw + release asset linkleri token istemesin).

## Gereksinimler
- Chat backend (agent-api) erişilebilir olmalı (lokal: `localhost:3010`).
- Chat panelinde giriş yapmış ol (token oradan okunur).
- Rolün `admin` / `agent` / `casiyer` olmalı (kanal mesajı gönderme yetkisi).

## Yakalama modları
- **Bölge** (varsayılan): `Alt+Shift+S` / ikon / sağ-tık → sayfada alan seç.
- **Tam sayfa (scroll)**: `Alt+Shift+E` / sağ-tık "Tam sayfa yakala…" → sayfa kaydırılıp parça parça yakalanır, tek uzun görselde birleştirilir.

## Sınırlar
- **Tam sayfa:** sabit/yapışkan (fixed/sticky) başlıklar her dilimde tekrar görünebilir; çok uzun sayfalar ~16000px'de kırpılır; oran sınırı nedeniyle birkaç saniye sürer.
- `chrome://`, `about:`, eklenti-mağaza sayfaları yakalanamaz (tarayıcı engeli).
- Kırpma yalnız **fotoğraf** içindir; video/ekran-kaydı bu uzantının kapsamında değil
  (app-içi ekran kaydı özelliği ayrı).

## Dosyalar
| Dosya | Görev |
|---|---|
| `manifest.chrome.json` / `manifest.firefox.json` | Tarayıcıya özel manifest (build.sh seçer) |
| `background.js` | Yakalama tetikleme, token cache, API yetki köprüsü |
| `content.js` | Panel origin'inde JWT okuyup arka plana iletir |
| `crop.html` / `crop.js` | Kırpma + sohbet seçimi + yükleme/gönderme |
| `options.html` / `options.js` | API adresi ayarı (`storage.local`) |
| `icons/` | Uzantı ikonları |
