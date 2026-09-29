let token = localStorage.getItem('token');
const $ = (s) => document.querySelector(s);

function showMsg(text, type) {
  const el = $('#msg');
  el.textContent = text;
  el.className = 'alert alert-' + type;
  el.classList.remove('hidden');
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

if (!token) {
  $('#needLogin').classList.remove('hidden');
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const msg = $('#loginMsg');
    msg.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Masuk...';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('#email').value.trim(), password: $('#password').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      token = data.token;
      localStorage.setItem('token', token);
      location.reload();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.remove('hidden');
    } finally { btn.disabled = false; btn.textContent = 'Masuk'; }
  });
} else {
  $('#main').classList.remove('hidden');
  api('/api/config').then((c) => {
    $('#status').innerHTML =
      `<div class="row"><span>Port</span><code>${c.port}</code></div>` +
      `<div class="row"><span>Lokal</span><code>${c.localUrl}</code></div>` +
      `<div class="row"><span>Halaman config</span><code>${c.configUrl}</code></div>` +
      `<div class="row"><span>FRONTEND_URL</span><code>${c.frontendUrl}</code></div>` +
      `<div class="row"><span>PUBLIC_URL</span><code>${c.publicUrl || '(belum diisi)'}</code></div>`;
    $('#port').value = c.port;
    $('#frontendUrl').value = c.frontendUrl;
    $('#publicUrl').value = c.publicUrl || '';
    $('#tunnelCmd').textContent = `cloudflared tunnel --url http://localhost:${c.port}`;
  }).catch((e) => {
    if (/401|token|expired/i.test(e.message)) {
      localStorage.removeItem('token');
      location.reload();
      return;
    }
    showMsg(e.message, 'error');
  });

  $('#cfgForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#saveBtn');
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    try {
      const body = {
        port: parseInt($('#port').value),
        frontendUrl: $('#frontendUrl').value.trim(),
        publicUrl: $('#publicUrl').value.trim(),
      };
      const r = await api('/api/config', { method: 'PUT', body: JSON.stringify(body) });
      showMsg(r.message, 'success');
      if (r.restartRequired) showMsg(r.message + ' Perintah: Ctrl+C, lalu npm run dev.', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Simpan'; }
  });

  $('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#tunnelCmd').textContent); showMsg('Perintah disalin.', 'success'); }
    catch { showMsg('Gagal menyalin, blok perintah lalu Ctrl+C manual.', 'error'); }
  });
}
