const api = globalThis.browser ?? globalThis.chrome;
const input = document.getElementById('apiBase');
const ok = document.getElementById('ok');

async function load() {
  const { apiBase } = await api.storage.local.get('apiBase');
  input.value = apiBase || ''; // boş = Otomatik
}

document.querySelectorAll('.preset').forEach((b) => {
  b.onclick = () => { input.value = b.dataset.v; };
});

document.getElementById('save').onclick = async () => {
  const v = (input.value || '').trim().replace(/\/+$/, '');
  await api.storage.local.set({ apiBase: v }); // '' → otomatik
  ok.textContent = v ? '✓ Kaydedildi (elle: ' + v + ')' : '✓ Kaydedildi (Otomatik)';
  setTimeout(() => { ok.textContent = ''; }, 2000);
};

load();
