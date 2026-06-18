// Ulak Ekran Görüntüsü — arka plan (service worker / Firefox event page).
// `browser.*` (Firefox) veya `chrome.*` (Chrome MV3, promise döner) — ikisi de çalışır.
const api = globalThis.browser ?? globalThis.chrome;

// Panel (web app) origin'leri — token buralardan okunur (manifest ile aynı).
const PANEL_MATCHES = ['http://localhost:4200/*', 'https://chat.cyp.world/*'];

const DEFAULT_API_BASE = 'https://chat-api.cyp.world';
// Panel origin'leri (sondaki /* olmadan) — gömülü iframe'i tanımak için.
const PANEL_ORIGINS = PANEL_MATCHES.map((p) => p.replace(/\/\*$/, ''));
let lastPanelOrigin = null;   // gönderim sonrası bildirimden panel açmak için
let lastSentChannelId = null; // bildirime tıklayınca açılacak sohbet
let lastCaptureTabId = null;  // ekran görüntüsünün alındığı sekme (gömülü iframe'e yazmak için)
let lastPanelTabId = null;    // gömülü chat iframe'inin BULUNDUĞU sekme (content.js token relay'inden)

// API adresi → panel origin eşlemesi (override modunda doğru token için).
const API_TO_PANEL = {
  'http://localhost:3010': 'http://localhost:4200',
  'https://chat-api.cyp.world': 'https://chat.cyp.world',
};
// Panel origin → API adresi (OTOMATİK mod: girişli panele göre API seç).
const PANEL_TO_API = {
  'http://localhost:4200': 'http://localhost:3010',
  'https://chat.cyp.world': 'https://chat-api.cyp.world',
};

// Auth + API adresini birlikte çöz. Options'ta apiBase doluysa override; boşsa
// (Otomatik) girişli panelin origin'ine göre API seçilir → token/API tutarlı.
async function resolveAuthAndApi() {
  let override = '';
  try { override = (await api.storage.local.get('apiBase')).apiBase || ''; } catch (_) { override = ''; }
  if (override) {
    const panelOrigin = API_TO_PANEL[override] || null;
    return { auth: await getAuth(panelOrigin), apiBase: override, panelOrigin };
  }
  const auth = await getAuth(null);
  const origin = auth && auth.origin;
  const apiBase = origin ? (PANEL_TO_API[origin] || DEFAULT_API_BASE) : DEFAULT_API_BASE;
  return { auth, apiBase, panelOrigin: origin || null };
}

// Tarayıcı iç sayfaları — yakalama/enjeksiyon burada çalışmaz.
const BLOCKED_URL = /^(chrome|about|edge|moz-extension|chrome-extension|view-source|devtools|data):/i;

async function notify(title, message) {
  try {
    await api.notifications.create({
      type: 'basic',
      iconUrl: api.runtime.getURL('icons/icon-128.png'),
      title,
      message,
    });
  } catch (_) { /* bildirim izni yoksa sessiz geç */ }
}

// Sayfaya enjekte edilen bölge seçici. Döner: {x,y,w,h,dpr} | 'CANCEL' | null(tüm sayfa).
// NOT: kapanış (closure) içermeyen, kendi kendine yeten bir fonksiyon olmalı.
function regionSelectorInPage() {
  return new Promise((resolve) => {
    if (window.__lcRegionActive) { resolve('CANCEL'); return; }
    window.__lcRegionActive = true;
    const dpr = window.devicePixelRatio || 1;
    const Z = '2147483647';
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;cursor:crosshair;background:rgba(0,0,0,0.18);z-index:' + Z + ';';
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;border:2px solid #2563eb;background:rgba(37,99,235,0.12);display:none;pointer-events:none;z-index:' + Z + ';';
    const hint = document.createElement('div');
    hint.textContent = 'Göndermek istediğin alanı sürükleyerek seç · İptal: Esc';
    hint.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:7px 14px;border-radius:9px;font:13px/1 system-ui,sans-serif;pointer-events:none;z-index:' + Z + ';box-shadow:0 4px 16px rgba(0,0,0,.4);';
    const root = document.documentElement;
    root.appendChild(ov); root.appendChild(box); root.appendChild(hint);
    let sx = 0, sy = 0, dragging = false;
    const cleanup = () => {
      ov.remove(); box.remove(); hint.remove();
      window.__lcRegionActive = false;
      window.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cleanup(); resolve('CANCEL'); } };
    window.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', (e) => {
      dragging = true; sx = e.clientX; sy = e.clientY;
      box.style.display = 'block'; box.style.left = sx + 'px'; box.style.top = sy + 'px';
      box.style.width = '0px'; box.style.height = '0px';
    });
    ov.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      box.style.left = x + 'px'; box.style.top = y + 'px';
      box.style.width = Math.abs(e.clientX - sx) + 'px'; box.style.height = Math.abs(e.clientY - sy) + 'px';
    });
    ov.addEventListener('mouseup', (e) => {
      if (!dragging) return; dragging = false;
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      const w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      cleanup();
      if (w < 5 || h < 5) { resolve(null); return; }
      // overlay kalkmış haliyle ekran tazelensin, sonra yakala.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({ x, y, w, h, dpr })));
    });
  });
}

// Sayfa bağlamı + debug tamponunu (collector.js) MAIN dünyadan oku.
async function gatherContext(tabId) {
  try {
    const res = await api.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => ({
        url: location.href,
        title: document.title,
        ua: navigator.userAgent,
        vw: window.innerWidth, vh: window.innerHeight,
        sw: screen.width, sh: screen.height,
        lang: navigator.language,
        online: navigator.onLine,
        debug: (window.__lcDebugBuf || []).slice(-50),
      }),
    });
    return res && res[0] ? res[0].result : null;
  } catch (_) { return null; }
}

// İkon/kısayol → bölge seç → görünür sekmeyi yakala → kırp → kırpma penceresini aç.
async function triggerCapture() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    if (BLOCKED_URL.test(tab.url || '')) {
      await notify('Bu sayfa yakalanamıyor', 'Tarayıcı iç sayfaları (chrome://, about: vb.) görüntülenemez.');
      return;
    }
    lastCaptureTabId = tab.id;

    // 1) Sayfada bölge seçtir (enjeksiyon başarısızsa tüm sayfayı al).
    let region = null;
    try {
      const res = await api.scripting.executeScript({ target: { tabId: tab.id }, func: regionSelectorInPage });
      region = res && res[0] ? res[0].result : null;
    } catch (_) {
      region = null; // kısıtlı sayfa → tüm görünür alan
    }
    if (region === 'CANCEL') return; // kullanıcı vazgeçti

    // 2) Görünür sekmeyi yakala + sayfa bağlamı/debug topla.
    const dataUrl = await api.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (!dataUrl) { await notify('Yakalama başarısız', 'Ekran görüntüsü alınamadı.'); return; }
    const context = await gatherContext(tab.id);

    await api.storage.session.set({
      pendingShot: {
        dataUrl,
        region: region && typeof region === 'object' ? region : null,
        sourceTitle: tab.title || '',
        context: context || null,
      },
    });
    await api.windows.create({
      url: api.runtime.getURL('crop.html'),
      type: 'popup',
      width: 980,
      height: 760,
    });
  } catch (e) {
    await notify('Yakalama başarısız', String((e && e.message) || e));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// captureVisibleTab oran sınırına takılırsa kısa bekleyip yeniden dene.
async function captureWithRetry(windowId, tries) {
  for (let i = 0; i < (tries || 3); i++) {
    try { return await api.tabs.captureVisibleTab(windowId, { format: 'png' }); }
    catch (e) { await sleep(550); }
  }
  return await api.tabs.captureVisibleTab(windowId, { format: 'png' });
}

async function blobToDataUrl(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return 'data:' + (blob.type || 'image/png') + ';base64,' + btoa(bin);
}

// Sayfayı kaydırıp parça parça yakalar, tek uzun görselde birleştirir.
async function captureFullPage(tab) {
  const metricsRes = await api.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      sh: Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0,
      ),
      ch: window.innerHeight,
      cw: window.innerWidth,
      dpr: window.devicePixelRatio || 1,
      y0: window.scrollY,
    }),
  });
  const m = metricsRes && metricsRes[0] ? metricsRes[0].result : null;
  if (!m) throw new Error('Sayfa ölçülemedi');

  const MAX_H = 16000; // güvenlik sınırı (çok uzun sayfa)
  const totalCss = Math.min(m.sh, MAX_H);
  const dpr = m.dpr;
  const canvas = new OffscreenCanvas(Math.round(m.cw * dpr), Math.round(totalCss * dpr));
  const ctx = canvas.getContext('2d');

  let yCss = 0;
  let guard = 0;
  while (yCss < totalCss && guard < 80) {
    guard++;
    await api.scripting.executeScript({ target: { tabId: tab.id }, func: (yy) => window.scrollTo(0, yy), args: [yCss] });
    await sleep(450); // yerleşsin + oran sınırı
    const dataUrl = await captureWithRetry(tab.windowId, 3);
    const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const drawY = Math.round(yCss * dpr);
    const srcH = Math.min(bmp.height, canvas.height - drawY); // son dilim taşmasın
    if (srcH > 0) ctx.drawImage(bmp, 0, 0, bmp.width, srcH, 0, drawY, bmp.width, srcH);
    bmp.close && bmp.close();
    yCss += m.ch;
  }

  // Scroll'u geri al.
  await api.scripting.executeScript({ target: { tabId: tab.id }, func: (yy) => window.scrollTo(0, yy), args: [m.y0] });

  // Uzun görsel olduğu için JPEG (storage.session kotasına sığsın).
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return blobToDataUrl(blob);
}

async function triggerFullPage() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    if (BLOCKED_URL.test(tab.url || '')) {
      await notify('Bu sayfa yakalanamıyor', 'Tarayıcı iç sayfaları (chrome://, about: vb.) görüntülenemez.');
      return;
    }
    lastCaptureTabId = tab.id;
    await notify('Tam sayfa yakalanıyor…', 'Sayfa kaydırılıp birleştiriliyor, birkaç saniye sürebilir.');
    const dataUrl = await captureFullPage(tab);
    const context = await gatherContext(tab.id);
    await api.storage.session.set({
      pendingShot: { dataUrl, region: null, full: true, sourceTitle: tab.title || '', context: context || null },
    });
    await api.windows.create({ url: api.runtime.getURL('crop.html'), type: 'popup', width: 980, height: 760 });
  } catch (e) {
    await notify('Tam sayfa yakalama başarısız', String((e && e.message) || e));
  }
}

api.action.onClicked.addListener(triggerCapture);
api.commands?.onCommand.addListener((cmd) => {
  if (cmd === 'capture-screenshot') triggerCapture();
  else if (cmd === 'capture-fullpage') triggerFullPage();
});

// Sağ-tık menüsü — sayfada herhangi bir yere sağ tıkla → "Ekran görüntüsü al…".
const MENU_ID = 'lc-capture';
const MENU_FULL_ID = 'lc-capture-full';
async function createMenu() {
  try { await api.contextMenus.removeAll(); } catch (_) { /* yut */ }
  const ctx = ['page', 'selection', 'image', 'link', 'video'];
  try { api.contextMenus.create({ id: MENU_ID, title: 'Ekran görüntüsü al (bölge) ve sohbete gönder', contexts: ctx }); } catch (_) { /* var */ }
  try { api.contextMenus.create({ id: MENU_FULL_ID, title: 'Tam sayfa yakala ve sohbete gönder', contexts: ctx }); } catch (_) { /* var */ }
}
api.runtime.onInstalled.addListener(createMenu);
// Firefox event-page yeniden yüklendiğinde de menüyü kur.
createMenu();
api.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID) triggerCapture();
  else if (info.menuItemId === MENU_FULL_ID) triggerFullPage();
});

// AÇIK panel sekmesine geç (yeni sekme açma) ve sohbeti aç. Tek sohbet →
// /channels?id=... ; toplu gönderim → sadece mesajlaşma arayüzü (/channels).
async function openSentChat() {
  const origin = lastPanelOrigin || 'https://chat.cyp.world';
  const target = origin + '/channels' + (lastSentChannelId ? '?id=' + lastSentChannelId : '');
  try {
    const tabs = await api.tabs.query({ url: origin + '/*' });
    if (tabs && tabs.length) {
      await api.tabs.update(tabs[0].id, { active: true, url: target });
      await api.windows.update(tabs[0].windowId, { focused: true });
    }
    // Açık standalone panel sekmesi YOKSA yeni chat.cyp.world sekmesi AÇMA:
    // gömülü (embed) kullanıcıda bu, panelin LOGIN sayfasına atıyordu. Mesaj
    // zaten bulunduğun gömülü sohbette canlı socket ile görünür.
  } catch (_) { /* yut */ }
}

// Gönderim/stage sonrası: ekran görüntüsünün alındığı sayfadaki GÖMÜLÜ mesajlaşma
// widget'ını aç (host'taki LiveChatMessaging.open()'ı MAIN dünyada çağır) → kullanıcı
// sohbeti hemen görsün. Loader yoksa (standalone panel) sessiz geçer.
// SW yeniden başlayınca bellekteki lastPanelTabId kaybolabilir → storage.session yedeği.
async function getPanelTabId() {
  if (lastPanelTabId != null) return lastPanelTabId;
  try { const r = await api.storage.session.get('lastPanelTabId'); return r.lastPanelTabId ?? null; }
  catch (_) { return null; }
}

async function openEmbedWidget(tabId) {
  let t = tabId;
  if (t == null) { const p = await getPanelTabId(); t = p != null ? p : lastCaptureTabId; }
  if (t == null) return;
  try {
    await api.scripting.executeScript({
      target: { tabId: t },
      world: 'MAIN',
      func: () => {
        try {
          if (window.LiveChatMessaging && typeof window.LiveChatMessaging.open === 'function') {
            window.LiveChatMessaging.open();
          }
        } catch (e) { /* yut */ }
      },
    });
    try { await api.tabs.update(t, { active: true }); } catch (_) { /* yut */ }
    try {
      const tt = await api.tabs.get(t);
      if (tt) await api.windows.update(tt.windowId, { focused: true });
    } catch (_) { /* yut */ }
  } catch (_) { /* yut */ }
}

// Sekme yüklemesi tamamlanana kadar bekle (yeni açılan/yeniden yüklenen panel için).
function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      try { api.tabs.onUpdated.removeListener(onUpd); } catch (_) { /* yut */ }
      resolve();
    };
    const onUpd = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
    try { api.tabs.onUpdated.addListener(onUpd); } catch (_) { /* yut */ }
    api.tabs.get(tabId).then((t) => { if (t && t.status === 'complete') finish(); }).catch(() => {});
    setTimeout(finish, timeoutMs || 9000);
  });
}

// Panel sekmesine bekleyen görseli yaz + paneli haberdar et (event). Panel uygulaması
// hem açılışta localStorage'ı okur hem de bu event'i dinler (ister yeni yüklensin ister açık).
async function injectPending(tabId, payload) {
  await api.scripting.executeScript({
    target: { tabId },
    func: (key, val) => {
      try { localStorage.setItem(key, val); } catch (e) { /* kota */ }
      try { window.dispatchEvent(new CustomEvent('ulak:pendingShot')); } catch (e) { /* yut */ }
    },
    args: ['ulak:pendingShot', JSON.stringify(payload)],
  });
}

// "Sohbette onayla": görseli GÖNDERMEDEN panelin sohbet kutusuna düşür.
// Bekleyen görseli (a) gömülü panel iframe'ine — ekran görüntüsünün alındığı
// sekmede — ya da (b) açık standalone panel sekmesine düşürür. Yeni chat.cyp.world
// sekmesi AÇMAZ (gömülü kullanıcıda login'e atıyordu). Hiçbiri yoksa false döner.
// Bir sekmedeki panel iframe'ine (varsa) bekleyen görseli yazar; bulamazsa false.
async function writePendingToTab(tabId, payload) {
  try {
    const res = await api.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (key, val, panelOrigins) => {
        if (!panelOrigins.includes(location.origin)) return false; // yalnız panel iframe'i
        try { localStorage.setItem(key, val); } catch (e) { /* partitioned */ }
        try { sessionStorage.setItem(key, val); } catch (e) { /* yut */ }
        try { window.dispatchEvent(new CustomEvent('ulak:pendingShot')); } catch (e) { /* yut */ }
        return true;
      },
      args: ['ulak:pendingShot', JSON.stringify(payload), PANEL_ORIGINS],
    });
    return !!(res && res.some((r) => r && r.result === true));
  } catch (_) { return false; }
}

// Bekleyen görseli gömülü panel iframe'ine düşürür: önce ekran görüntüsünün
// alındığı sekme, sonra gömülü chat'in BULUNDUĞU sekme (başka sayfadaysan da
// açık bo.cyp.zone sekmesine düşer); o da yoksa açık standalone panel sekmesi.
// Yeni chat.cyp.world sekmesi AÇMAZ. Başarılıysa sekme id'sini, yoksa null döner.
async function stageToComposer(origin, channelId, dataUrl, fileName, content) {
  const payload = { dataUrl, fileName: fileName || 'ulak-ekran.png', channelId, caption: content || '', ts: Date.now() };

  // (a) Gömülü: aday sekmeler — yakalanan sekme + gömülü chat sekmesi (SW restart'a dayanıklı).
  const panelTabId = await getPanelTabId();
  const candidates = [...new Set([lastCaptureTabId, panelTabId].filter((x) => x != null))];
  for (const tabId of candidates) {
    if (await writePendingToTab(tabId, payload)) {
      try { await api.tabs.update(tabId, { active: true }); } catch (_) { /* yut */ }
      try { const t = await api.tabs.get(tabId); if (t) await api.windows.update(t.windowId, { focused: true }); } catch (_) { /* yut */ }
      return tabId;
    }
  }

  // (b) Açık standalone panel sekmesi varsa oraya düşür (klasik akış).
  const tabs = await queryPanelTabs([origin + '/*']);
  const tab = tabs && tabs[0];
  if (tab) {
    try { await api.tabs.update(tab.id, { active: true, url: origin + '/channels?id=' + channelId }); } catch (_) { /* yut */ }
    try { await api.windows.update(tab.windowId, { focused: true }); } catch (_) { /* yut */ }
    await waitForTabComplete(tab.id, 8000);
    await injectPending(tab.id, payload);
    return tab.id;
  }

  return null;
}

// Bildirim de tıklanırsa aynı yere götürür (otomatik açılış kaçarsa yedek).
api.notifications.onClicked.addListener(async (id) => {
  if (id !== 'lc-sent') return;
  await openSentChat();
  try { await api.notifications.clear(id); } catch (_) { /* yut */ }
});

// Panel sekmelerini bul: önce url-filtreli query; boş/başarısızsa tüm sekmeleri
// çekip origin önekine göre filtrele (Firefox'ta url-filtre bazen boş döner).
async function queryPanelTabs(patterns) {
  const origins = (patterns || PANEL_MATCHES).map((p) => p.replace(/\/\*$/, ''));
  let tabs = [];
  try { tabs = await api.tabs.query({ url: patterns }); } catch (_) { tabs = []; }
  if (tabs && tabs.length) return tabs;
  let all = [];
  try { all = await api.tabs.query({}); } catch (_) { all = []; }
  return all.filter((t) => t.url && origins.some((o) => t.url.startsWith(o)));
}

// Belirli panel origin(ler)inden açık sekmede localStorage'tan token oku.
async function readTokenFromPanelTab(patterns) {
  const tabs = await queryPanelTabs(patterns);
  for (const t of tabs) {
    try {
      const results = await api.scripting.executeScript({
        target: { tabId: t.id },
        func: () => ({
          token: localStorage.getItem('livechat:token'),
          user: JSON.parse(localStorage.getItem('livechat.panel.user') || 'null'),
          origin: location.origin,
        }),
      });
      const r = results && results[0] && results[0].result;
      if (r && r.token) return r;
    } catch (_) { /* sıradaki sekme */ }
  }
  return null;
}

// İstenen panel origin'ine ait token'ı getir. Sıra: (1) eşlenen origin cache,
// (2) eşlenen origin sekmesinden oku, (3) cache'teki herhangi biri, (4) açık
// herhangi bir panel sekmesinden oku. Böylece bir panel açık+girişliyse token
// neredeyse her zaman bulunur (yanlış API adresinde 401 alınır, sessiz kalmaz).
async function getAuth(panelOrigin) {
  const stored = await api.storage.session.get('authByOrigin');
  const map = stored.authByOrigin || {};
  const save = async (r) => {
    map[r.origin] = { token: r.token, user: r.user, origin: r.origin };
    await api.storage.session.set({ authByOrigin: map });
    return map[r.origin];
  };

  if (panelOrigin) {
    // Önce GÜNCEL localStorage'ı oku (cache eski/expired olabilir). Yalnız bu
    // origin'in token'ını kullan — yanlış origin (prod) token'ı localhost'a
    // gönderilip 401 olmasın diye "herhangi cache"e DÜŞME.
    const fresh = await readTokenFromPanelTab([panelOrigin + '/*']);
    if (fresh && fresh.token) return save(fresh);
    if (map[panelOrigin] && map[panelOrigin].token) return map[panelOrigin];
    return null;
  }
  // panelOrigin bilinmiyorsa (eşleşmeyen API adresi) herhangi panel tokeni.
  const freshAny = await readTokenFromPanelTab(PANEL_MATCHES);
  if (freshAny && freshAny.token) return save(freshAny);
  const anyCached = Object.values(map).find((a) => a && a.token);
  return anyCached || null;
}

// Teşhis: panel sekmesi bulunuyor mu, localStorage'da hangi anahtarlar var?
async function getAuthDiag(panelOrigin) {
  const diag = { panelOrigin, tabsFound: 0, tabs: [] };
  let tabs = [];
  try {
    tabs = await queryPanelTabs(panelOrigin ? [panelOrigin + '/*'] : PANEL_MATCHES);
  } catch (e) { diag.queryError = String(e); }
  diag.tabsFound = tabs.length;
  for (const t of tabs) {
    const row = { url: t.url };
    try {
      const res = await api.scripting.executeScript({
        target: { tabId: t.id },
        func: () => ({
          origin: location.origin,
          hasToken: !!localStorage.getItem('livechat:token'),
          keys: Object.keys(localStorage).filter((k) => /token|livechat|auth|jwt/i.test(k)),
        }),
      });
      Object.assign(row, res && res[0] ? res[0].result : { noResult: true });
    } catch (e) { row.execError = String(e); }
    diag.tabs.push(row);
  }
  return diag;
}

// Auth'lu API çağrısı — BACKGROUND'tan yapılır ki host_permissions CORS'u
// bypass etsin (Firefox uzantı sayfalarından fetch CORS'a takılıyor).
async function apiCall(apiBase, token, path, opts) {
  const res = await fetch(apiBase + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token, ...(opts && opts.headers) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) throw new Error('Oturum geçersiz. Chat uygulamasında yeniden giriş yapın.');
    throw new Error((json && json.message) || ('Hata ' + res.status));
  }
  return json ? json.data : null;
}

function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'LIST_CHANNELS') {
      try {
        const { auth, apiBase, panelOrigin } = await resolveAuthAndApi();
        if (!auth || !auth.token) {
          sendResponse({ error: 'AUTH', apiBase, diag: await getAuthDiag(panelOrigin) });
          return;
        }
        const data = await apiCall(apiBase, auth.token, '/api/channels', { method: 'GET' });
        sendResponse({ ok: true, data: data || [], user: auth.user, apiBase });
      } catch (e) { sendResponse({ error: String((e && e.message) || e) }); }
      return;
    }
    if (msg && msg.type === 'NOTIFY_SENT') {
      const n = msg.count || 1;
      try {
        await api.notifications.create('lc-sent', {
          type: 'basic',
          iconUrl: api.runtime.getURL('icons/icon-128.png'),
          title: 'Ekran görüntüsü gönderildi',
          message: n + ' sohbete iletildi · sohbeti açmak için tıkla',
        });
      } catch (_) { /* yut */ }
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === 'STAGE_SHOT') {
      try {
        const id = msg.channelId;
        if (!id) { sendResponse({ error: 'Sohbet seçilmedi' }); return; }
        const { auth, apiBase, panelOrigin } = await resolveAuthAndApi();
        if (!auth || !auth.token) { sendResponse({ error: 'AUTH', apiBase, diag: await getAuthDiag(panelOrigin) }); return; }
        const origin = (auth && auth.origin) || panelOrigin || lastPanelOrigin;
        const stagedTabId = origin ? await stageToComposer(origin, id, msg.dataUrl, msg.fileName, msg.content) : null;
        if (stagedTabId != null) { await openEmbedWidget(stagedTabId); sendResponse({ ok: true }); return; }
        sendResponse({ error: 'Mesajlaşmanın açık olduğu bir sekme bulunamadı. bo.cyp.zone (gömülü chat) sekmesini açık tut ya da "Direkt gönder" kullan.' });
      } catch (e) { sendResponse({ error: String((e && e.message) || e) }); }
      return;
    }
    if (msg && msg.type === 'SEND_SHOT') {
      try {
        const ids = msg.channelIds || (msg.channelId ? [msg.channelId] : []);
        if (!ids.length) { sendResponse({ error: 'Sohbet seçilmedi' }); return; }
        const { auth, apiBase, panelOrigin } = await resolveAuthAndApi();
        if (!auth || !auth.token) { sendResponse({ error: 'AUTH', apiBase }); return; }
        lastPanelOrigin = (auth && auth.origin) || panelOrigin || lastPanelOrigin;
        // Tek sohbet → o sohbeti aç; toplu → sadece mesajlaşma arayüzü.
        lastSentChannelId = ids.length === 1 ? ids[0] : null;

        // Görseli BİR KEZ yükle, sonra tüm seçili kanallara aynı URL'i paylaştır.
        const blob = dataUrlToBlob(msg.dataUrl);
        const fd = new FormData();
        fd.append('file', blob, msg.fileName || 'ekran.png');
        const up = await apiCall(apiBase, auth.token, '/api/upload/file', { method: 'POST', body: fd });
        if (!up || !up.fileUrl) throw new Error('Yükleme başarısız');

        const note = (msg.content || '').trim();
        let sent = 0; let lastErr = null;
        for (const id of ids) {
          const body = {
            fileUrl: up.fileUrl, fileName: up.fileName, fileType: up.fileType,
            fileSize: up.fileSize, clientSentAt: new Date().toISOString(),
          };
          if (note) body.content = note.slice(0, 8000);
          try {
            await apiCall(apiBase, auth.token, '/api/channels/' + id + '/messages', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            sent += 1;
          } catch (e) { lastErr = String((e && e.message) || e); }
        }
        sendResponse({ ok: sent === ids.length, sent, total: ids.length, error: lastErr || undefined });
        if (sent > 0) { await openSentChat(); await openEmbedWidget(); } // gömülü widget'ı aç + (varsa) panel sekmesini odakla
      } catch (e) { sendResponse({ error: String((e && e.message) || e) }); }
      return;
    }
    if (msg && msg.type === 'GET_AUTH_DIAG') {
      sendResponse(await getAuthDiag(msg.panelOrigin || null));
      return;
    }
    if (msg && msg.type === 'TOKEN' && msg.token && msg.origin) {
      // Bu TOKEN, gömülü chat iframe'inden (panel origin'i) geliyor → o iframe'in
      // bulunduğu SEKMEYİ hatırla. Böylece başka bir sayfada (YouTube vb.) ekran
      // görüntüsü alıp gönderince, açık bo.cyp.zone sekmesine düşürüp açabiliriz.
      if (PANEL_ORIGINS.includes(msg.origin) && _sender && _sender.tab && _sender.tab.id != null) {
        lastPanelTabId = _sender.tab.id;
        try { await api.storage.session.set({ lastPanelTabId }); } catch (_) { /* yut */ }
      }
      const stored = await api.storage.session.get('authByOrigin');
      const map = stored.authByOrigin || {};
      map[msg.origin] = { token: msg.token, user: msg.user, origin: msg.origin };
      await api.storage.session.set({ authByOrigin: map });
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === 'GET_AUTH') {
      sendResponse(await getAuth(msg.panelOrigin || null));
      return;
    }
    sendResponse(null);
  })();
  return true; // async sendResponse
});
