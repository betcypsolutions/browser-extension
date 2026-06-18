# Ulak Ekran Görüntüsü — Dokümantasyon

> Bu uzantının ne olduğu, nasıl çalıştığı, nasıl geliştirilip yayınlandığı ve
> dağıtıldığı. Projeye yeni bakan biri bunu okuyarak tüm resmi anlayabilir.

---

## 1. Genel Bakış

**Ne yapar:** Tarayıcıda **herhangi bir sekmede/sayfada** ekran görüntüsü alır, üstüne
işaret koyar/blur'lar ve **destek sohbetine (channels)** gönderir — kullanıcının
**kendi oturum token'ıyla** (uzantıda gizli anahtar YOKTUR).

**Neden uzantı?** Web sayfası içindeki `getDisplayMedia` başka sekmeyi yakalayamaz /
başka sekmeden tetiklenemez. Uzantı bu sınırı aşar.

**Nerede çalışır:** Chrome, Edge (MV3 service_worker) ve Firefox (MV3 event page).

**İki kullanım senaryosu:**
1. **Standalone panel:** kullanıcı `chat.cyp.world` panelinde girişli.
2. **Gömülü (embed):** chat, başka bir sisteme (ör. `bo.cyp.zone`) iframe olarak
   gömülü; kullanıcı oraya `messaging-sso` ile girmiş.

---

## 2. Depo & Konum

- **Konum:** `/home/pc/Desktop/live-chat/browser-extension/`
- **Repo:** `github.com/betcypsolutions/browser-extension` (**public** — oto-güncelleme
  linkleri token istemesin diye public olmalı), dal: `main`.
- **Sunucuya deploy EDİLMEZ** (tarayıcıda çalışır). Sadece dosyaları release'e yüklenir.

---

## 3. Mimari

### 3.1 Uzantı dosyaları
| Dosya | Görev |
|---|---|
| `manifest.chrome.json` | Chrome/Edge manifest (`background.service_worker`) |
| `manifest.firefox.json` | Firefox manifest (`background.scripts` + `gecko.id` + `update_url`) |
| `manifest.json` | **Üretilen** aktif manifest (build.sh ilgili varyantı buraya kopyalar) — gitignored |
| `background.js` | Yakalama tetikleme, TÜM API çağrıları, token cache, gömülü iframe'e aktarma |
| `content.js` | Panel/embed sayfasında `livechat:token`'ı (localStorage **veya** sessionStorage) okuyup background'a relay eder |
| `collector.js` | MAIN dünya, `<all_urls>` — console/hata/fetch tamponu ("Tanı bilgisi" için) |
| `crop.html` / `crop.js` | Kırpma + işaretleme + sohbet seçme + gönderme penceresi (tüm UI) |
| `options.html` / `options.js` | API adresi (boş = otomatik) |
| `icons/` | İkonlar (16/48/128/256) |
| `build.sh` | `build.sh chrome\|firefox` → doğru manifesti `manifest.json`'a kopyalar |
| `package.sh` | `dist/` altına chrome/firefox zip'leri üretir |
| `bump.sh` | **Sürüm + imza + yayın** tek komut (bkz. §6) |
| `install.html` | Tarayıcı algılayan kurulum sayfası (GitHub Pages'te) |
| `updates.json` | Firefox oto-güncelleme manifesti (repo kökü, **izlenir**) |
| `README.md` | Kısa kurulum/imzalama |
| `KULLANIM-KILAVUZU.md` | Son kullanıcı kılavuzu |
| `DEPLOY.txt` | Kişisel yayın adımları (**gitignored**) |

### 3.2 İzinler
- `permissions`: `activeTab, scripting, storage, notifications, tabs, contextMenus`
- `host_permissions`: **`<all_urls>`** (tek satır — izin ekranında domain GÖRÜNMEZ; eski 4
  domain kaldırıldı). Panel domainleri yalnız `background.js` kaynağında.
- `content_scripts`: `content.js` + `collector.js` ikisi de `<all_urls>`.

### 3.3 Backend bağımlılığı (livechat-backend, agent-api — yayında)
- **REST ucu:** `POST /api/channels/:id/messages` (`channels.controller.sendMessageRest`)
  — mesaj göndermek eskiden socket-only'di; uzantı düz fetch kullansın diye eklendi.
  Gönderir + `ChannelsGateway.broadcastNewMessage` ile **canlı yayına verir**.
- **CORS (main.ts):** `enableCors` origin fonksiyonu `moz-extension://` / `chrome-extension://`
  origin'lerine de izin verir (Firefox background fetch CORS'a takılmasın). Uçlar yine JWT ister.
- **Upload:** `POST /api/upload/file` (sadece `AuthGuard('jwt')`, rol istemez).

---

## 4. Çalışma Akışları

### 4.1 Token nasıl bulunur
1. `content.js` panel/embed sayfasında çalışır → `livechat:token` (localStorage YOKSA
   sessionStorage) + `livechat.panel.user`'ı okur → background'a `{type:TOKEN, origin}` yollar.
2. Background origin-bazlı cache'ler (`authByOrigin`, `storage.session`).
3. **Oto-API:** girişli panel origin'ine göre API seçilir (`PANEL_TO_API`: localhost:4200→3010,
   chat.cyp.world→chat-api). Options'ta `apiBase` doluysa override.
4. **TÜM API çağrıları background'da** yapılır → `host_permissions` CORS'u bypass eder
   (Firefox'ta uzantı SAYFALARINDAN fetch CORS'a takılır; background takılmaz).

### 4.2 Yakala → işaretle → gönder
1. Tetikleme: **Alt+Shift+S** (bölge) · **Alt+Shift+E** (tam sayfa) · ikon · sağ-tık menüsü.
2. Bölge = sayfada overlay'le sürükle-seç. Tam sayfa = kaydır-yakala-birleştir (JPEG, ≤16000px).
3. Kırpma penceresi (`crop.html`): **işaretleme** (kalem/fosforlu/ok/dikdörtgen/daire/**metin
   "T"**/numaralı adım/**blur**) + renk + kalınlık + undo/redo. **Tam ekran (lightbox)** / **Kopyala** / **İndir** (blob URL).
4. **Sohbet seç:**
   - Liste **checkbox'sız**; sağ üstte **⊕ Çoklu seç**.
   - Mod: **✏️ Sohbette onayla** (varsayılan, tekli) / **⚡ Direkt gönder**. Çoklu hep direkt.

### 4.3 Direkt gönder
`SEND_SHOT` → `POST /api/upload/file` → her kanala `POST /api/channels/:id/messages`
(`clientSentAt`). Sonra **`openEmbedWidget()`** çağrılır.

### 4.4 Sohbette onayla (handoff)
Uzantı GÖNDERMEZ. `STAGE_SHOT` → `stageToComposer()`:
- `ulak:pendingShot` (`{dataUrl,fileName,channelId,caption,ts}`) **gömülü panel iframe'ine**
  `executeScript({allFrames:true})` ile yazılır (yalnız panel origin'li frame) + `window`
  event `ulak:pendingShot` tetiklenir.
- Aday sekmeler: `lastCaptureTabId` (ekran görüntüsünün alındığı sekme) + **`lastPanelTabId`**
  (gömülü chat'in bulunduğu sekme — content.js token relay'inden, `storage.session` yedekli)
  → başka sayfadan bile açık bo.cyp.zone sekmesine düşer.
- Panel (`channels.component.consumeExtensionShot`) bunu okuyup `SharedMediaService` ile
  görseli+notu composer'a **pending** düşürür; göndermeyi kullanıcı yapar.

### 4.5 Gönderim sonrası widget oto-açılış
`openEmbedWidget(tabId)` host sayfasındaki **`LiveChatMessaging.open()`'ı MAIN dünyada**
çağırır → gömülü mesajlaşma widget'ı otomatik açılır, kullanıcı sohbeti görür.

> **Önemli:** `openSentChat()` artık YENİ chat.cyp.world sekmesi AÇMAZ (gömülü kullanıcıda
> login'e atıyordu) — yalnız zaten açık standalone paneli odaklar.

---

## 5. Geliştirme / Yerel Test

```bash
# Chrome/Edge'de test:
./build.sh chrome
# chrome://extensions → Geliştirici modu → Paketlenmemiş öğe yükle → bu klasör
# Değişiklikten sonra: build.sh chrome + uzantı sayfasında Reload (⟳)

# Firefox'ta geçici test:
./build.sh firefox
# about:debugging → Bu Firefox → Geçici Eklenti Yükle → manifest.json
```

> ⚠️ **GOTCHA:** `manifest.json` build çıktısıdır; `build.sh`/`package.sh`/`bump.sh`
> çalışınca firefox↔chrome arası değişir. **Chrome reload öncesi mutlaka `./build.sh chrome`**
> (yoksa firefox varyantı kalır → Chrome service worker'ı bulamaz → uzantı kırık).

---

## 6. Yayınlama (sürüm çıkarma)

Tek komut her şeyi yapar:
```bash
export AMO_JWT_ISSUER="user:..."     # AMO API anahtarı (addons.mozilla.org → Manage API Keys)
export AMO_JWT_SECRET="..."
export GH_REPO="betcypsolutions/browser-extension"
# GitHub yetkisi (biri): gh auth login   ya da   export GH_TOKEN="contents:write PAT"

./bump.sh patch --release
```
Bu sırayla:
1. Sürümü artırır (iki manifest) — `minor`/`major`/`1.2.3` da olur.
2. AMO'da imzalar (`web-ext sign --channel=unlisted`).
3. `publish/`'e xpi + **sabit isimli** `ulak-ekran-goruntusu.xpi` & `ulak-chrome.zip`,
   `updates.json`'ı günceller.
4. `git commit` + `push`.
5. **GitHub release** oluşturur + tüm asset'leri yükler (gh CLI ya da GH_TOKEN ile).

**Ön-kontrol:** `--release`'te GitHub yetkisi yoksa **sürümü artırmadan baştan durur**
(yoksa `updates.json` olmayan release'e işaret eden kırık durum oluşur).

**Oto-güncelleme nasıl çalışır:**
- `manifest.firefox.json` → `gecko.update_url` = `raw.githubusercontent.com/.../main/updates.json` (SABIT).
- `updates.json` → her sürümün GitHub Release asset xpi'sine işaret eder.
- Firefox periyodik kontrol eder → yeni sürüm gelince **kendi günceller**.
- `update_url` imzalı xpi'ye gömülü olduğundan **değişmemeli**.

---

## 7. Dağıtım (son kullanıcı kurulumu)

**Tek link:** `https://betcypsolutions.github.io/browser-extension/install.html`
(GitHub Pages — repo Settings → Pages → main/root). Sayfa tarayıcı algılar:

| Tarayıcı | Kurulum |
|---|---|
| **Firefox** | "Yükle" → tek tık (imzalı .xpi) → **oto-güncellenir** |
| **Chrome/Edge** | ".zip indir" → Geliştirici modu → Paketlenmemiş yükle (oto-güncelleme YOK) |

**Sabit linkler** (sürümle değişmez):
- Firefox: `releases/latest/download/ulak-ekran-goruntusu.xpi`
- Chrome: `releases/latest/download/ulak-chrome.zip`

### Chrome/Edge tek-tık + oto-güncelleme (önemli sınır)
Chrome/Edge, **mağaza-dışı** eklentiyi script/policy ile zorla kurmayı yalnız **yönetilen
(domain/admin) cihazda** kabul eder. Normal kullanıcı + admin yok → **mümkün değil**.
Non-admin için tek-tık + oto-güncelleme yolu = **mağaza (unlisted)**:
- **Edge Add-ons: ÜCRETSİZ**, **Chrome Web Store: ~5$** (tek seferlik). Paket = `ulak-chrome.zip`.
- Mağazasız: load-unpacked çalışır ama her sürümde elle güncelleme + "geliştirici modu" uyarısı.

---

## 8. Gömülü (embed) Entegrasyonu

Chat, `messaging-loader.js` + iframe ile başka sisteme gömülür:
```html
<script src="https://chat.cyp.world/messaging-loader.js"></script>
<script>
  LiveChatMessaging.init({
    token: '<casiyer JWT — host SUNUCUSU messaging-sso ile üretir>',
    container: '#mesaj',
    onTokenExpired: function () {          // 8h token kesintisiz yenilensin
      fetch('/api/livechat-token').then(r => r.text()).then(t => LiveChatMessaging.setToken(t));
    },
  });
</script>
```
- **Token kaynağı:** host'un SUNUCUSU `POST https://chat-api.cyp.world/api/auth/messaging-sso`'yu
  `X-Messaging-Sso-Key` ile çağırır. **`MESSAGING_SSO_SECRET` ASLA tarayıcıya inmez.**
- Üçüncü-taraf iframe → storage **partitioned**; embed token'ı **sessionStorage**'da tutulur
  (panel `localStorage`'ıyla çakışmaz).

### Panel embed-auth (livechat-frontend, `/embed/*` moduna özel)
Embed'in login sayfası + refresh cookie'si YOK → tek 401 oturumu öldürmemeli:
- `auth.interceptor.ts`: embed'de 401 → cookie-refresh/clear/login YOK.
- `token-storage.service.ts` / `session.service.ts`: embed'de `sessionStorage`; 401'de
  `/login` yerine parent'a `lc-msg-token-expired` postMessage (host taze token verir).
- `app.config.ts`: embed'de **Service Worker kaydedilmez** (partitioned'da stale shell + 504).

---

## 9. Roller

Uzantı **rol-agnostik** — rol mantığı YOK. Erişim kararı tamamen backend'de:
- `GET /api/channels` → kullanıcının görebildiği sohbetler (rol + üyelik).
- `POST /api/channels/:id/messages` → RolesGuard izin verir/403.

Backend'de mesajlaşmaya izinli roller: `casiyer, admin, super_admin, agent`
(`auth.service.MESSAGING_ALLOWED_ROLES` / env `MESSAGING_SSO_ALLOWED_ROLES`).
Yeni LIVECHAT rolü eklerken: (A) `user.entity.ts` enum + migration, (B) MESSAGING_ALLOWED_ROLES,
(C) `channels.controller.ts` `@Roles` listeleri. Upload + uzantı + embed kendiliğinden uyumlu.

---

## 10. Sorun Giderme / Bilinen Tuzaklar

| Belirti | Sebep / Çözüm |
|---|---|
| Chrome'da uzantı kırık (service worker yok) | `manifest.json` firefox varyantı kalmış → `./build.sh chrome` + Reload |
| "Bağlanamadı." | Chat oturumu açık değil → panel/embed'de girişli ol |
| Gönderince login'e atıyordu | (Çözüldü) `openSentChat` artık chat.cyp.world sekmesi açmıyor |
| "T" metin aracı işlevsiz | (Çözüldü) input blur'u erteleme ile düzeltildi |
| Firefox eski izinler görünüyor | Eklentiyi tamamen Kaldır + restart + yeni .xpi |
| `--release` "kırık release" | (Çözüldü) ön-kontrol: yetki yoksa sürüm artmadan durur |
| 504 Gateway Timeout | Backend/nginx tarafı (frontend değil) |
| `latest/download/...` 404 (yeni release sonrası) | GitHub CDN eski 404'ü kısa süre cache'ler → birkaç dk'da düzelir |

---

## 11. Hızlı Komut Referansı

```bash
./build.sh chrome|firefox          # aktif manifesti seç
./package.sh                       # dist/ zip'leri
./bump.sh patch --release          # sürüm + imza + yayın + GitHub release (tek komut)
./bump.sh 1.2.3 --release          # belirli sürümü yayınla (artırmadan)
gh auth login                      # GitHub yetkisi (bir kez)
```

İlgili dosyalar: `DEPLOY.txt` (kişisel adım adım), `README.md` (kısa kurulum),
`KULLANIM-KILAVUZU.md` (son kullanıcı).
