// Önizleme + sohbet seçimi. API çağrıları BACKGROUND üzerinden yapılır
// (Firefox'ta uzantı sayfasından fetch CORS'a takılıyor; background host_permissions
// ile bypass eder). Bölge sayfada seçildiyse otomatik kırpılır; değilse elle kırpma.
const api = globalThis.browser ?? globalThis.chrome;

const $ = (id) => document.getElementById(id);
const shotEl = $('shot');
const wrapEl = $('cropWrap');
const selEl = $('selection');
const dimEl = $('dim');

let meUser = null;
let croppedDataUrl = null;
let channels = [];
let recents = [];   // [{id, name}] — son gönderilen sohbetler (storage.local)
let pageContext = null;  // {url, title, ua, debug:[...]} — yakalama anındaki sayfa bağlamı
let selectedIds = new Set();  // çoklu gönderim için işaretli kanal id'leri
let sel = null;
let multiMode = false;        // çoklu seçim modu açık mı
let sendMode = 'confirm';     // 'confirm' = sohbette onayla · 'direct' = anında gönder

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function flashBtn(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = orig; }, 1400);
}

function showToast(kind, html, withClose) {
  const t = $('toast');
  t.className = 'toast ' + (kind || '');
  t.innerHTML = html + (withClose ? '<div class="act"><button class="btn btn-ghost" id="toastClose">Kapat</button></div>' : '');
  $('overlay').classList.add('show');
  if (withClose) $('toastClose').onclick = () => window.close();
}

// Oturum/izin sorunu. İki durum:
//  (a) needsPermission → Firefox MV3'te "tüm siteler" host izni verilmemiş; gömülü
//      chat iframe'inden (chat.cyp.world) token okunamıyor → "İzin Ver" butonu göster,
//      kullanıcı jestiyle permissions.request çağır, verilince işlemi tekrar dene.
//  (b) izin var ama token yok → kullanıcı chat'e giriş yapmamış.
function showLoginError(apiBase, needsPermission, onRetry) {
  if (needsPermission) {
    showToast('err',
      '<b>Erişim izni gerekiyor</b><br>' +
      'Uzantının gömülü sohbet penceresinden oturumu okuyabilmesi için ' +
      '<b>tüm sitelere erişim</b> izni gerekir (Firefox bunu kurulumda otomatik vermez).' +
      '<div class="act"><button class="btn" id="grantBtn">İzin Ver</button></div>',
      true);
    const btn = $('grantBtn');
    if (btn) btn.onclick = async () => {
      let granted = false;
      try { granted = await api.permissions.request({ origins: ['<all_urls>'] }); } catch (_) { granted = false; }
      if (granted) {
        $('overlay').classList.remove('show');
        if (typeof onRetry === 'function') onRetry();
        else showToast('ok', '✓ İzin verildi. Tekrar dene.', true);
      } else {
        showToast('err', 'İzin verilmedi. about:addons → uzantı → İzinler\'den elle açabilirsin.', true);
      }
    };
    return;
  }
  showToast('err',
    'Oturum bulunamadı. Chat uygulamasında (panel veya gömülü embed) giriş yaptığından emin ol, sonra tekrar dene.',
    true);
}

// ---------- kırpma → dataURL ----------
function canvasCropToDataUrl(sx, sy, sw, sh) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  canvas.getContext('2d').drawImage(shotEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function cropRegion(region) {
  const dpr = region.dpr || 1;
  const sx = clamp(region.x * dpr, 0, shotEl.naturalWidth);
  const sy = clamp(region.y * dpr, 0, shotEl.naturalHeight);
  const sw = clamp(region.w * dpr, 1, shotEl.naturalWidth - sx);
  const sh = clamp(region.h * dpr, 1, shotEl.naturalHeight - sy);
  return canvasCropToDataUrl(sx, sy, sw, sh);
}

function cropManual() {
  const scaleX = shotEl.naturalWidth / shotEl.clientWidth;
  const scaleY = shotEl.naturalHeight / shotEl.clientHeight;
  let sx = 0, sy = 0, sw = shotEl.naturalWidth, sh = shotEl.naturalHeight;
  if (sel && sel.w > 6 && sel.h > 6) {
    sx = sel.x * scaleX; sy = sel.y * scaleY; sw = sel.w * scaleX; sh = sel.h * scaleY;
  }
  return canvasCropToDataUrl(sx, sy, sw, sh);
}

// ---------- elle kırpma etkileşimi (fallback) ----------
let dragging = false, startX = 0, startY = 0;
wrapEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const r = shotEl.getBoundingClientRect();
  dragging = true;
  startX = clamp(e.clientX - r.left, 0, r.width);
  startY = clamp(e.clientY - r.top, 0, r.height);
  sel = { x: startX, y: startY, w: 0, h: 0 };
  drawSel();
  wrapEl.setPointerCapture(e.pointerId);
});
wrapEl.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const r = shotEl.getBoundingClientRect();
  const cx = clamp(e.clientX - r.left, 0, r.width);
  const cy = clamp(e.clientY - r.top, 0, r.height);
  sel = { x: Math.min(startX, cx), y: Math.min(startY, cy), w: Math.abs(cx - startX), h: Math.abs(cy - startY) };
  drawSel();
});
wrapEl.addEventListener('pointerup', () => { dragging = false; });
function drawSel() {
  if (!sel || sel.w < 1 || sel.h < 1) { selEl.style.display = 'none'; dimEl.style.display = 'none'; return; }
  dimEl.style.display = 'block';
  selEl.style.display = 'block';
  selEl.style.left = sel.x + 'px'; selEl.style.top = sel.y + 'px';
  selEl.style.width = sel.w + 'px'; selEl.style.height = sel.h + 'px';
}

// ---------- işaretleme + blur ----------
const annCanvas = $('annCanvas');
const annCtx = annCanvas.getContext('2d');
let annBase = null;     // base Image
let annShapes = [];     // çizilen şekiller (undo için tutulur)
let annCurrent = null;  // o an sürüklenen şekil
let annTool = 'pen';
let annColor = '#ef4444';
let annLineW = 4;        // görsel boyutuna göre temel kalınlık
let annWidthMult = 2;    // 1 ince · 2 orta · 3.5 kalın
let annStepN = 0;        // numaralı adım sayacı
let annRedo = [];        // ileri-al yığını

function lwNow() { return Math.max(2, Math.round(annLineW * (annWidthMult / 2))); }

function openAnnotate() {
  const img = new Image();
  img.onload = () => {
    annBase = img;
    annCanvas.width = img.naturalWidth;
    annCanvas.height = img.naturalHeight;
    annShapes = []; annCurrent = null; annRedo = []; annStepN = 0;
    annLineW = Math.max(3, Math.round(img.naturalWidth / 300));
    redrawAnn();
    gotoStage('ann');
  };
  img.src = croppedDataUrl;
}

function redrawAnn() {
  annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
  if (annBase) annCtx.drawImage(annBase, 0, 0, annCanvas.width, annCanvas.height);
  for (const s of annShapes) drawShape(s);
  if (annCurrent) drawShape(annCurrent);
}

function drawShape(s) {
  annCtx.save();
  if (s.type === 'blur') {
    annCtx.beginPath(); annCtx.rect(s.x, s.y, s.w, s.h); annCtx.clip();
    annCtx.filter = 'blur(' + Math.max(6, Math.round(annCanvas.width / 110)) + 'px)';
    if (annBase) annCtx.drawImage(annBase, 0, 0, annCanvas.width, annCanvas.height);
  } else if (s.type === 'rect') {
    annCtx.strokeStyle = s.color; annCtx.lineWidth = s.lw;
    annCtx.strokeRect(s.x, s.y, s.w, s.h);
  } else if (s.type === 'ellipse') {
    annCtx.strokeStyle = s.color; annCtx.lineWidth = s.lw;
    annCtx.beginPath();
    annCtx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.max(1, s.w / 2), Math.max(1, s.h / 2), 0, 0, Math.PI * 2);
    annCtx.stroke();
  } else if (s.type === 'arrow') {
    drawArrow(s.x1, s.y1, s.x2, s.y2, s.color, s.lw);
  } else if (s.type === 'pen' || s.type === 'highlight') {
    if (s.type === 'highlight') { annCtx.globalAlpha = 0.35; annCtx.lineWidth = s.lw * 5; }
    else annCtx.lineWidth = s.lw;
    annCtx.strokeStyle = s.color; annCtx.lineCap = 'round'; annCtx.lineJoin = 'round';
    annCtx.beginPath();
    s.points.forEach((p, i) => (i ? annCtx.lineTo(p.x, p.y) : annCtx.moveTo(p.x, p.y)));
    annCtx.stroke();
  } else if (s.type === 'text') {
    annCtx.font = '600 ' + s.size + 'px system-ui, sans-serif';
    annCtx.textBaseline = 'top';
    annCtx.lineWidth = Math.max(2, s.size / 7); annCtx.strokeStyle = 'rgba(0,0,0,0.85)';
    annCtx.strokeText(s.text, s.x, s.y);
    annCtx.fillStyle = s.color; annCtx.fillText(s.text, s.x, s.y);
  } else if (s.type === 'step') {
    annCtx.beginPath(); annCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    annCtx.fillStyle = s.color; annCtx.fill();
    annCtx.lineWidth = Math.max(2, s.r / 8); annCtx.strokeStyle = '#fff'; annCtx.stroke();
    annCtx.fillStyle = '#fff'; annCtx.font = '700 ' + Math.round(s.r * 1.2) + 'px system-ui, sans-serif';
    annCtx.textAlign = 'center'; annCtx.textBaseline = 'middle';
    annCtx.fillText(String(s.n), s.x, s.y + 1);
  }
  annCtx.restore();
}

function drawArrow(x1, y1, x2, y2, color, lw) {
  const head = Math.max(10, lw * 3.2);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  annCtx.strokeStyle = color; annCtx.fillStyle = color;
  annCtx.lineWidth = lw; annCtx.lineCap = 'round';
  annCtx.beginPath(); annCtx.moveTo(x1, y1); annCtx.lineTo(x2, y2); annCtx.stroke();
  annCtx.beginPath(); annCtx.moveTo(x2, y2);
  annCtx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
  annCtx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
  annCtx.closePath(); annCtx.fill();
}

function annPos(e) {
  const r = annCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (annCanvas.width / r.width),
    y: (e.clientY - r.top) * (annCanvas.height / r.height),
  };
}
function rectFrom(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function commitShape(s) { annShapes.push(s); annRedo = []; redrawAnn(); }
function annUndo() { if (!annShapes.length) return; annRedo.push(annShapes.pop()); redrawAnn(); }
function annRedoFn() { if (!annRedo.length) return; annShapes.push(annRedo.pop()); redrawAnn(); }

annCanvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const p = annPos(e);
  if (annTool === 'text') { e.preventDefault(); openTextInput(p, e); return; }
  if (annTool === 'step') {
    annStepN += 1;
    commitShape({ type: 'step', x: p.x, y: p.y, n: annStepN, color: annColor, r: Math.max(12, annLineW * 4) });
    return;
  }
  annCanvas.setPointerCapture(e.pointerId);
  const lw = lwNow();
  if (annTool === 'pen' || annTool === 'highlight') annCurrent = { type: annTool, color: annColor, lw, points: [p] };
  else annCurrent = { type: annTool, color: annColor, lw, _a: p, x1: p.x, y1: p.y, x2: p.x, y2: p.y, x: p.x, y: p.y, w: 0, h: 0 };
  redrawAnn();
});
annCanvas.addEventListener('pointermove', (e) => {
  if (!annCurrent) return;
  const p = annPos(e);
  if (annCurrent.type === 'pen' || annCurrent.type === 'highlight') annCurrent.points.push(p);
  else if (annCurrent.type === 'arrow') { annCurrent.x2 = p.x; annCurrent.y2 = p.y; }
  else { const r = rectFrom(annCurrent._a, p); annCurrent.x = r.x; annCurrent.y = r.y; annCurrent.w = r.w; annCurrent.h = r.h; }
  redrawAnn();
});
function finishAnn() {
  if (!annCurrent) return;
  const s = annCurrent; annCurrent = null;
  const isBox = s.type === 'rect' || s.type === 'blur' || s.type === 'ellipse';
  const tinyBox = isBox && (s.w < 4 || s.h < 4);
  const tinyArrow = s.type === 'arrow' && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 5;
  const tinyLine = (s.type === 'pen' || s.type === 'highlight') && s.points.length < 2;
  if (!tinyBox && !tinyArrow && !tinyLine) commitShape(s);
  else redrawAnn();
}
annCanvas.addEventListener('pointerup', finishAnn);
annCanvas.addEventListener('pointercancel', finishAnn);

// Metin aracı: tıklanan yere üst-üste binen input koy; Enter/blur'da işle, Esc iptal.
function openTextInput(p, e) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Metin yaz, Enter…';
  inp.style.cssText = 'position:fixed;z-index:90;font:600 16px system-ui;padding:4px 8px;border:1px solid #2563eb;border-radius:6px;background:#1a1d24;color:#fff;min-width:160px;outline:none;box-shadow:0 4px 16px rgba(0,0,0,.5);';
  // Ekrandan taşmasın
  inp.style.left = Math.max(8, Math.min(e.clientX, window.innerWidth - 180)) + 'px';
  inp.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - 44)) + 'px';
  document.body.appendChild(inp);
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const text = inp.value.trim();
    inp.remove();
    if (text) {
      const size = Math.max(14, Math.round(annLineW * 4 * (annWidthMult / 2)));
      commitShape({ type: 'text', x: p.x, y: p.y, text, color: annColor, size });
    }
  };
  inp.addEventListener('keydown', (ev) => {
    ev.stopPropagation();   // global Esc/kısayollar input'a karışmasın
    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); done = true; inp.remove(); }
  });
  // ÖNEMLİ: focus + blur dinleyicisini bir tick ertele. Aksi halde input'u
  // oluşturan tıklamanın hemen ardından gelen blur, input'u anında kapatıyordu
  // ("T tıklıyorum, kutu çıkmıyor / işlevi yok"). Erteleme ile kutu açık kalır.
  setTimeout(() => {
    inp.focus();
    inp.select();
    inp.addEventListener('blur', commit);
  }, 60);
}

// ---------- sohbet seçici ----------
function gotoStage(which) {
  ['crop', 'ann', 'pick'].forEach((s) => {
    const el = $(s + 'Stage');
    if (el) el.classList.toggle('active', s === which);
    const f = $(s + 'Footer');
    if (f) f.style.display = s === which ? 'flex' : 'none';
  });
}

function channelView(c) {
  const meId = meUser && meUser.id;
  if (c.type === 'DM') {
    const peer = (c.members || []).map((m) => m.user).find((u) => u && u.id !== meId);
    const name = peer ? ([peer.name, peer.surname].filter(Boolean).join(' ') || peer.email) : 'Direkt mesaj';
    return { name, sub: 'Direkt mesaj', initial: (name[0] || '?').toUpperCase() };
  }
  const name = c.name || ('Kanal #' + c.id);
  return { name, sub: c.type === 'ANNOUNCEMENT' ? 'Duyuru kanalı' : 'Kanal', initial: (name[0] || '#').toUpperCase() };
}

function nameOfId(id) {
  const c = channels.find((x) => x.id === id);
  return c ? channelView(c).name : ('#' + id);
}

function updateMultiBar() {
  const btn = $('sendSelBtn');
  if (!btn) return;
  const n = selectedIds.size;
  btn.style.display = (multiMode && n) ? 'inline-flex' : 'none';
  btn.textContent = 'Seçilenlere gönder (' + n + ')';
}

function updateHint() {
  const h = $('pickHint');
  if (!h) return;
  if (multiMode) h.textContent = 'Sohbetleri seç → "Seçilenlere gönder". Çoklu gönderim anında iletilir.';
  else if (sendMode === 'confirm') h.textContent = 'Bir sohbete tıkla → görsel o sohbetin kutusuna düşer; sen onaylayıp gönderirsin.';
  else h.textContent = 'Bir sohbete tıkla → anında gönderilir.';
}

// Mod düğmelerini + listedeki işaretleri ekranla eşitle.
function applyModeUI() {
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === sendMode));
  const confirmBtn = document.querySelector('#modeSeg button[data-mode="confirm"]');
  if (confirmBtn) { confirmBtn.disabled = multiMode; confirmBtn.style.opacity = multiMode ? '0.4' : ''; }
  const mb = $('multiToggle');
  if (mb) { mb.classList.toggle('active', multiMode); mb.textContent = multiMode ? '✕ Çoklu seçimi kapat' : '⊕ Çoklu seç'; }
  document.querySelectorAll('.chat-item .go').forEach((g) => { g.textContent = sendMode === 'confirm' ? '✏️' : '➤'; });
  updateMultiBar();
  updateHint();
}

function setMultiMode(on) {
  multiMode = on;
  if (on) sendMode = 'direct';   // çoklu gönderim her zaman direkt iletilir
  if (!on) {
    selectedIds.clear();
    document.querySelectorAll('.chat-item.selected').forEach((r) => r.classList.remove('selected'));
  }
  applyModeUI();
}

function setSendMode(mode) {
  if (mode === 'confirm' && multiMode) setMultiMode(false);  // onaylama tekli akıştır
  sendMode = mode;
  applyModeUI();
}

function toggleSelect(id, row) {
  if (selectedIds.has(id)) { selectedIds.delete(id); if (row) row.classList.remove('selected'); }
  else { selectedIds.add(id); if (row) row.classList.add('selected'); }
  updateMultiBar();
}

// Tek sohbet seçildiğinde moda göre: onaylat (kutuya düşür) ya da anında gönder.
function dispatchTo(ids) {
  if (sendMode === 'confirm' && !multiMode && ids.length === 1) handoffToComposer(ids[0]);
  else sendTo(ids);
}

function makeChatBtn(c, v) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'chat-item' + (selectedIds.has(c.id) ? ' selected' : '');
  row.dataset.id = c.id;
  const av = document.createElement('span');
  av.className = 'av';
  const ini = document.createElement('span');
  ini.className = 'av-initial'; ini.textContent = v.initial;
  const chk = document.createElement('span');
  chk.className = 'av-check'; chk.textContent = '✓';
  av.appendChild(ini); av.appendChild(chk);
  const info = document.createElement('span');
  info.className = 'info';
  const st = document.createElement('strong'); st.textContent = v.name;
  const sm = document.createElement('small'); sm.textContent = v.sub;
  info.appendChild(st); info.appendChild(sm);
  const go = document.createElement('span');
  go.className = 'go'; go.textContent = sendMode === 'confirm' ? '✏️' : '➤';
  row.appendChild(av); row.appendChild(info); row.appendChild(go);
  row.onclick = (e) => {
    // Çoklu mod ya da Ctrl/Cmd/Shift+tık → seçime ekle/çıkar; düz tık → moda göre gönder.
    if (multiMode || e.ctrlKey || e.metaKey || e.shiftKey) {
      if (!multiMode) setMultiMode(true);
      toggleSelect(c.id, row);
    } else {
      dispatchTo([c.id]);
    }
  };
  return row;
}

function addLabel(list, text) {
  const h = document.createElement('div');
  h.className = 'list-label';
  h.textContent = text;
  list.appendChild(h);
}

function renderChannels(filter) {
  const list = $('chatList');
  const q = (filter || '').toLowerCase().trim();
  list.innerHTML = '';
  const all = channels.map((c) => ({ c, v: channelView(c) }));

  if (!q) {
    const recentRows = recents
      .map((r) => all.find((x) => x.c.id === r.id))
      .filter(Boolean);
    const recentIds = new Set(recentRows.map((x) => x.c.id));
    const rest = all.filter((x) => !recentIds.has(x.c.id)); // Son'dakileri Tümü'den çıkar
    if (recentRows.length) {
      addLabel(list, 'Son');
      recentRows.forEach(({ c, v }) => list.appendChild(makeChatBtn(c, v)));
      if (rest.length) addLabel(list, 'Tümü');
    }
    rest.forEach(({ c, v }) => list.appendChild(makeChatBtn(c, v)));
    return;
  }

  const rows = all.filter(({ v }) => v.name.toLowerCase().includes(q));
  if (!rows.length) { list.innerHTML = '<div class="empty">Sohbet bulunamadı.</div>'; return; }
  rows.forEach(({ c, v }) => list.appendChild(makeChatBtn(c, v)));
}

async function loadRecents() {
  try { const { recentChats } = await api.storage.local.get('recentChats'); recents = recentChats || []; }
  catch (_) { recents = []; }
}

async function pushRecent(id, name) {
  recents = [{ id, name }, ...recents.filter((r) => r.id !== id)].slice(0, 5);
  try { await api.storage.local.set({ recentChats: recents }); } catch (_) { /* yut */ }
}

async function loadChannels() {
  $('chatList').innerHTML = '<div class="empty">Yükleniyor…</div>';
  await loadRecents();
  const resp = await api.runtime.sendMessage({ type: 'LIST_CHANNELS' });
  if (!resp || resp.error) {
    if (resp && resp.error === 'AUTH') { showLoginError(resp.apiBase, resp.needsPermission, loadChannels); return; }
    $('chatList').innerHTML = '<div class="empty">' + ((resp && resp.error) || 'Kanallar yüklenemedi') + '</div>';
    return;
  }
  meUser = resp.user || meUser;
  channels = resp.data || [];
  selectedIds.clear();
  renderChannels('');
  applyModeUI();
}

function buildContent() {
  const note = ($('caption').value || '').trim();
  if ($('diagToggle').checked) {
    const diag = buildDiag(pageContext);
    if (diag) return (note ? note + '\n\n' : '') + diag;
  }
  return note;
}

async function sendTo(ids) {
  const list = Array.from(new Set(ids));
  if (!list.length) return;
  const content = buildContent();
  const fileName = 'ekran-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
  const label = list.length === 1 ? '"' + nameOfId(list[0]) + '"' : (list.length + ' sohbet');
  showToast('', '<span class="spinner"></span> ' + label + ' gönderiliyor…', false);

  const resp = await api.runtime.sendMessage({ type: 'SEND_SHOT', channelIds: list, content, dataUrl: croppedDataUrl, fileName });

  if (resp && resp.error === 'AUTH') { showLoginError(resp.apiBase, resp.needsPermission, () => sendTo(ids)); return; }
  if (resp && resp.ok) {
    for (const id of list) await pushRecent(id, nameOfId(id));
    // Gönderim sonrası panel sekmesinde sohbet otomatik açılır (background).
    showToast('ok', '✓ Gönderildi — ' + label, false);
    setTimeout(() => window.close(), 900);
  } else {
    const sent = (resp && resp.sent) || 0;
    showToast('err', '✕ ' + sent + '/' + list.length + ' gönderildi' + (resp && resp.error ? ' · ' + resp.error : ''), true);
  }
}

// "Sohbette onayla": görseli göndermeden panel composer'ına aktar (background yapar).
async function handoffToComposer(id) {
  const content = buildContent();
  const fileName = 'ulak-ekran-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
  showToast('', '<span class="spinner"></span> "' + nameOfId(id) + '" sohbetine aktarılıyor…', false);
  const resp = await api.runtime.sendMessage({ type: 'STAGE_SHOT', channelId: id, content, dataUrl: croppedDataUrl, fileName });
  if (resp && resp.error === 'AUTH') { showLoginError(resp.apiBase, resp.needsPermission, () => handoffToComposer(id)); return; }
  if (resp && resp.ok) {
    await pushRecent(id, nameOfId(id));
    showToast('ok', '✓ Sohbete aktarıldı — panelde onaylayıp gönder', false);
    setTimeout(() => window.close(), 1100);
  } else {
    showToast('err', '✕ Aktarılamadı' + (resp && resp.error ? ' · ' + resp.error : ''), true);
  }
}

function buildDiag(ctx) {
  if (!ctx) return '';
  let s = '— Tanı bilgisi —\n';
  if (ctx.url) s += 'URL: ' + ctx.url + '\n';
  if (ctx.title) s += 'Başlık: ' + ctx.title + '\n';
  if (ctx.ua) s += 'Tarayıcı: ' + ctx.ua + '\n';
  if (ctx.sw) s += 'Ekran: ' + ctx.sw + 'x' + ctx.sh + ' · Görünüm: ' + ctx.vw + 'x' + ctx.vh + '\n';
  if (ctx.lang) s += 'Dil: ' + ctx.lang + (ctx.online === false ? ' · ÇEVRİMDIŞI' : '') + '\n';
  const logs = ctx.debug || [];
  if (logs.length) {
    s += 'Son olaylar (' + logs.length + '):\n';
    logs.slice(-25).forEach((d) => { s += '· [' + d.kind + '] ' + d.text + '\n'; });
  }
  return s.trim();
}

function showPreviewAndPick() {
  $('previewImg').src = croppedDataUrl;
  const approxKb = Math.round((croppedDataUrl.length * 0.75) / 1024);
  $('previewMeta').textContent = '~' + approxKb + ' KB';
  gotoStage('pick');
  loadChannels();
}

// ---------- başlat ----------
async function init() {
  const { pendingShot } = await api.storage.session.get('pendingShot');
  if (!pendingShot || !pendingShot.dataUrl) {
    showToast('err', 'Ekran görüntüsü bulunamadı. Lütfen tekrar yakalayın.', true);
    return;
  }
  await api.storage.session.remove('pendingShot');

  pageContext = pendingShot.context || null;
  const evCount = pageContext && pageContext.debug ? pageContext.debug.length : 0;
  $('diagInfo').textContent = pageContext ? evCount + ' olay' : 'yok';
  $('diagToggle').checked = false; // varsayılan KAPALI
  if (!pageContext) $('diagToggle').disabled = true;

  $('sourceTitle').textContent = pendingShot.sourceTitle || '';
  $('cancelBtn').onclick = () => window.close();
  $('backBtn').onclick = () => gotoStage('ann');     // sohbet → işaretlemeye dön
  $('cropBtn').onclick = () => { croppedDataUrl = cropManual(); openAnnotate(); };
  $('search').addEventListener('input', (e) => renderChannels(e.target.value));

  // İşaretleme kontrolleri
  document.querySelectorAll('.tool').forEach((b) => {
    b.onclick = () => {
      annTool = b.dataset.tool;
      document.querySelectorAll('.tool').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  document.querySelectorAll('.sw').forEach((b) => {
    b.onclick = () => {
      annColor = b.dataset.color;
      document.querySelectorAll('.sw').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  document.querySelectorAll('.w').forEach((b) => {
    b.onclick = () => {
      annWidthMult = parseFloat(b.dataset.w);
      document.querySelectorAll('.w').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  $('undoBtn').onclick = annUndo;
  $('redoBtn').onclick = annRedoFn;

  // Gönderim modu + çoklu seçim
  document.querySelectorAll('#modeSeg button').forEach((b) => { b.onclick = () => setSendMode(b.dataset.mode); });
  $('multiToggle').onclick = () => setMultiMode(!multiMode);
  $('sendSelBtn').onclick = () => sendTo([...selectedIds]);

  // Tam ekran (lightbox)
  const openLightbox = () => { if (!croppedDataUrl) return; $('lightboxImg').src = croppedDataUrl; $('lightbox').classList.add('show'); };
  const closeLightbox = () => $('lightbox').classList.remove('show');
  $('previewImg').onclick = openLightbox;
  $('fullBtn').onclick = openLightbox;
  $('lightbox').onclick = closeLightbox;
  $('lightboxClose').onclick = (e) => { e.stopPropagation(); closeLightbox(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('lightbox').classList.contains('show')) closeLightbox(); });

  // Çıktı seçenekleri
  $('copyBtn').onclick = async () => {
    try {
      const blob = await (await fetch(croppedDataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      flashBtn($('copyBtn'), '✓ Kopyalandı');
    } catch (_) { flashBtn($('copyBtn'), '✕ Olmadı'); }
  };
  $('dlBtn').onclick = async () => {
    // data: URL'i <a download> ile indirmek Firefox'ta takılabiliyor → blob URL kullan.
    try {
      const blob = await (await fetch(croppedDataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ulak-ekran-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      flashBtn($('dlBtn'), '✓ İndirildi');
    } catch (_) { flashBtn($('dlBtn'), '✕ Olmadı'); }
  };

  $('annCancelBtn').onclick = () => window.close();
  $('annNextBtn').onclick = () => { croppedDataUrl = annCanvas.toDataURL('image/png'); showPreviewAndPick(); };

  shotEl.onload = () => {
    if (pendingShot.full) {
      // Tam sayfa: görsel zaten nihai → doğrudan işaretlemeye geç.
      croppedDataUrl = pendingShot.dataUrl;
      openAnnotate();
    } else if (pendingShot.region) {
      croppedDataUrl = cropRegion(pendingShot.region);
      openAnnotate();
    } else {
      gotoStage('crop'); // bölge yok → elle kırpma → işaretleme
    }
  };
  shotEl.src = pendingShot.dataUrl;
}

init();
