// MAIN dünyada, document_start'ta çalışır. Sayfanın console / JS hata /
// başarısız network olaylarını sayfa içinde bir halka tampona yazar
// (window.__lcDebugBuf). Uzantı YALNIZ ekran görüntüsü alınırken bunu okur;
// veri hiçbir yere gönderilmez. Sadece destek ajanının kendi tarayıcısında.
(function () {
  if (window.__lcDebugInstalled) return;
  window.__lcDebugInstalled = true;
  const MAX = 120;
  const buf = (window.__lcDebugBuf = window.__lcDebugBuf || []);

  function push(kind, text) {
    try {
      buf.push({ t: Date.now(), kind, text: String(text).slice(0, 500) });
      if (buf.length > MAX) buf.splice(0, buf.length - MAX);
    } catch (_) { /* yut */ }
  }
  function fmt(args) {
    return Array.prototype.map.call(args, (a) => {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
      catch (_) { return String(a); }
    }).join(' ');
  }

  ['log', 'warn', 'error', 'info'].forEach((m) => {
    const orig = console[m];
    if (typeof orig !== 'function') return;
    console[m] = function () { push('console.' + m, fmt(arguments)); return orig.apply(this, arguments); };
  });

  window.addEventListener('error', (e) => {
    push('js-error', (e.message || 'error') + (e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    push('promise-reject', (r && (r.message || r)) || 'unhandledrejection');
  });

  // fetch
  const of = window.fetch;
  if (of) {
    window.fetch = function () {
      const a0 = arguments[0];
      const url = (a0 && (a0.url || a0)) || '';
      return of.apply(this, arguments).then((res) => {
        if (!res.ok) push('net', res.status + ' ' + url);
        return res;
      }).catch((err) => { push('net', 'FAIL ' + url + ' · ' + (err && err.message)); throw err; });
    };
  }
  // XMLHttpRequest
  const XO = window.XMLHttpRequest;
  if (XO && XO.prototype) {
    const open = XO.prototype.open;
    const send = XO.prototype.send;
    XO.prototype.open = function (m, u) { this.__lcM = m; this.__lcU = u; return open.apply(this, arguments); };
    XO.prototype.send = function () {
      try {
        this.addEventListener('load', () => { if (this.status >= 400) push('net', this.status + ' ' + this.__lcM + ' ' + this.__lcU); });
        this.addEventListener('error', () => push('net', 'FAIL ' + this.__lcM + ' ' + this.__lcU));
      } catch (_) { /* yut */ }
      return send.apply(this, arguments);
    };
  }
})();
