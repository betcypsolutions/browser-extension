// Tüm sayfalarda çalışır ama YALNIZ `livechat:token` localStorage'da varsa iş yapar
// (panel dışı sitelerde anahtar yok → hiçbir şey gönderilmez). Böylece manifest'te
// panel domainlerini listelemeye gerek kalmaz (izin ekranında domain görünmez).
// Giriş yapan kullanıcının JWT'sini arka plana iletir — hiçbir gizli anahtar yok.
const api = globalThis.browser ?? globalThis.chrome;

// Yardımcı anahtarları (user, apiBase) önce localStorage'dan, yoksa sessionStorage'dan oku.
function readLC(key) {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
  } catch (_) { /* localStorage engelli olabilir */ }
  try {
    return sessionStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

// JWT'nin exp'ini (bitiş, saniye) çöz. Çözülemezse 0.
function jwtExp(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; }
  catch (_) { return 0; }
}

// Token'ı HEM localStorage HEM sessionStorage'dan oku, exp'i EN GEÇ (taze) olanı seç.
// Sebep: standalone panel'e doğrudan girince token localStorage'a yazılıyor; white-label
// embed (/embed/*, örn. bo.cyp.zone) ise sessionStorage'a. İkisi aynı origin'de (chat.cyp.world)
// yan yana bulunabiliyor → "localStorage öncelikli" okuma ESKİ/expired olanı seçip 401 aldırıyordu.
function readToken() {
  let ls = null, ss = null;
  try { ls = localStorage.getItem('livechat:token'); } catch (_) { /* yut */ }
  try { ss = sessionStorage.getItem('livechat:token'); } catch (_) { /* yut */ }
  if (ls && ss) return jwtExp(ss) >= jwtExp(ls) ? ss : ls;
  return ss || ls;
}

// Bu içerik scriptinin ömründe en son token relay edildi mi? Çıkışı (token'ın
// kaybolması) algılayıp background cache'ini temizletmek için izleriz.
let __lcHadToken = false;

function relayToken() {
  try {
    const token = readToken();
    if (!token) {
      // Daha önce token vardı, şimdi yok → kullanıcı ÇIKIŞ yaptı (ya da süresi dolup
      // panel temizledi). background'daki bayat token'ı HEMEN sildir (401 bekleme).
      if (__lcHadToken) {
        __lcHadToken = false;
        try { api.runtime.sendMessage({ type: 'CLEAR_AUTH', origin: location.origin }); } catch (_) { /* yut */ }
      }
      return;
    }
    __lcHadToken = true;
    let user = null;
    try {
      user = JSON.parse(readLC('livechat.panel.user') || 'null');
    } catch (_) {
      user = null;
    }
    // Panel kendi API adresini bildirirse (livechat:apiBase) onu da ilet → uzantı
    // domain-bağımsız çalışır (yeni bir sisteme gömülse bile API'yi panelden öğrenir).
    const apiBase = readLC('livechat:apiBase') || null;
    api.runtime.sendMessage({ type: 'TOKEN', token, user, apiBase, origin: location.origin });
  } catch (_) {
    /* erişilemezse sessiz geç */
  }
}

relayToken();
// Sekmeye geri dönülünce / görünür olunca token tazelensin (login/logout sonrası).
window.addEventListener('focus', relayToken);
document.addEventListener('visibilitychange', () => { if (!document.hidden) relayToken(); });
// SPA girişinde token biraz gecikebilir → ilk ~20 sn birkaç kez dene.
let __lcTries = 0;
const __lcIv = setInterval(() => { relayToken(); if (++__lcTries >= 12) clearInterval(__lcIv); }, 1500);
