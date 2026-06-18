// Tüm sayfalarda çalışır ama YALNIZ `livechat:token` localStorage'da varsa iş yapar
// (panel dışı sitelerde anahtar yok → hiçbir şey gönderilmez). Böylece manifest'te
// panel domainlerini listelemeye gerek kalmaz (izin ekranında domain görünmez).
// Giriş yapan kullanıcının JWT'sini arka plana iletir — hiçbir gizli anahtar yok.
const api = globalThis.browser ?? globalThis.chrome;

// Token'ı önce localStorage'dan, yoksa sessionStorage'dan oku. White-label embed
// (/embed/*) üçüncü-taraf partitioned iframe'de oturumu sessionStorage'da tutuyor →
// uzantı bo.cyp.zone gibi gömülü sistemlerde de token'ı buradan bulup gönderebilsin.
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

function relayToken() {
  try {
    const token = readLC('livechat:token');
    if (!token) return;
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
