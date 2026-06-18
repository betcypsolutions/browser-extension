// Tüm sayfalarda çalışır ama YALNIZ `livechat:token` localStorage'da varsa iş yapar
// (panel dışı sitelerde anahtar yok → hiçbir şey gönderilmez). Böylece manifest'te
// panel domainlerini listelemeye gerek kalmaz (izin ekranında domain görünmez).
// Giriş yapan kullanıcının JWT'sini arka plana iletir — hiçbir gizli anahtar yok.
const api = globalThis.browser ?? globalThis.chrome;

function relayToken() {
  try {
    const token = localStorage.getItem('livechat:token');
    if (!token) return;
    let user = null;
    try {
      user = JSON.parse(localStorage.getItem('livechat.panel.user') || 'null');
    } catch (_) {
      user = null;
    }
    api.runtime.sendMessage({ type: 'TOKEN', token, user, origin: location.origin });
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
