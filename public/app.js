const API_BASE = '/api';
let authToken = localStorage.getItem('token');
let currentUser = null;

const $ = (sel) => document.querySelector(sel);

// ---------- helpers ----------
function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
function showAlert(el, msg, type = 'error') {
  el.textContent = msg;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}
function hideAlert(el) { el.classList.add('hidden'); }
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
function debounce(fn, ms) { let to; return (...a) => { clearTimeout(to); to = setTimeout(() => fn(...a), ms); }; }

async function apiRequest(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------- auth ----------
// Isolasi antar akun: SEMUA state user di-reset saat ganti sesi,
// sehingga data user lama tidak pernah tampil sekilas pun di akun baru.
let mustChangePassword = false;
function resetClientState() {
  currentUser = null;
  lessonCats = [];
  activeCat = 'kerja'; activeLevel = 'basic'; activeDay = 1;
  progressMap = {};
  flipped = new Set();
  quizState = null;
  currentVocabId = null;
  for (const id of ['#flashList', '#dayChips', '#quizBox', '#vocabList', '#historyList', '#dailyBars', '#dailyTable']) {
    const el = $(id);
    if (el) el.innerHTML = '';
  }
  for (const id of ['#password', '#email', '#regEmail', '#regPassword', '#forgotEmail', '#curPassword', '#newPassword', '#searchInput']) {
    const el = $(id);
    if (el) el.value = '';
  }
}
function setAuth(token, email, mustChange = false) {
  resetClientState();
  authToken = token;
  localStorage.setItem('token', token);
  if (email) localStorage.setItem('email', email);
  mustChangePassword = !!mustChange;
  localStorage.setItem('mustChange', mustChangePassword ? '1' : '0');
  updateUIForAuth();
}
function clearAuth() {
  authToken = null; currentUser = null; mustChangePassword = false;
  localStorage.removeItem('token'); localStorage.removeItem('email'); localStorage.removeItem('mustChange');
  resetClientState();
  updateUIForAuth();
}
function updateUIForAuth() {
  const isAuth = !!authToken;
  $('#authSection').classList.toggle('hidden', isAuth);
  $('#header').classList.toggle('hidden', !isAuth);
  // Bila wajib ganti password: tampilkan form ganti, sembunyikan app utama
  const force = isAuth && mustChangePassword;
  $('#forceChangeSection')?.classList.toggle('hidden', !force);
  $('#appSection').classList.toggle('hidden', !isAuth || force);
  if (isAuth) {
    $('#userEmail').textContent = localStorage.getItem('email') || '';
    if (!force) bootApp();
  }
}
async function refreshMe() {
  try {
    const d = await apiRequest('/auth/me');
    mustChangePassword = !!d.user?.mustChangePassword;
    localStorage.setItem('mustChange', mustChangePassword ? '1' : '0');
    if (d.user?.email) localStorage.setItem('email', d.user.email);
  } catch { /* token invalid -> ditangani pemanggil */ }
  updateUIForAuth();
}
function switchAuthMode(isRegister) {
  $('#forgotForm')?.classList.add('hidden');
  $('#loginForm').classList.toggle('hidden', isRegister);
  $('#registerForm').classList.toggle('hidden', !isRegister);
  $('#authTitle').textContent = isRegister ? 'Daftar Akun' : 'Masuk';
  $('#authToggleText').textContent = isRegister ? 'Sudah punya akun?' : 'Belum punya akun?';
  $('#authToggle').textContent = isRegister ? 'Masuk' : 'Daftar';
  hideAlert($('#alert'));
}
async function handleLogin(e) {
  e.preventDefault(); hideAlert($('#alert'));
  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'Masuk...';
  const typedEmail = $('#email').value.trim().toLowerCase();
  try {
    const data = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#email').value.trim(), password: $('#password').value }) });
    setAuth(data.token, data.user.email, data.user.mustChangePassword);
    // Verifikasi identitas token: pastikan sesi yang dibuka benar-benar milik email ini.
    try {
      const me = await apiRequest('/auth/me');
      if ((me.user?.email || '').toLowerCase() !== typedEmail) {
        clearAuth();
        showAlert($('#alert'), 'Sesi tidak cocok dengan akun. Silakan login ulang.');
        return;
      }
      mustChangePassword = !!me.user?.mustChangePassword;
      localStorage.setItem('mustChange', mustChangePassword ? '1' : '0');
      updateUIForAuth();
    } catch {
      clearAuth();
      showAlert($('#alert'), 'Gagal memverifikasi sesi. Silakan login ulang.');
      return;
    }
    if (mustChangePassword) {
      showToast('Login pakai password reset — wajib ganti password dulu', 'error');
    } else {
      showToast('Selamat datang kembali!');
    }
  } catch (err) { showAlert($('#alert'), err.message); }
  finally { btn.disabled = false; btn.textContent = 'Masuk'; }
}
async function handleRegister(e) {
  e.preventDefault(); hideAlert($('#alert'));
  try {
    const data = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ email: $('#regEmail').value.trim(), password: $('#regPassword').value }) });
    setAuth(data.token, data.user.email, false);
    showToast('Akun berhasil dibuat!');
  } catch (err) { showAlert($('#alert'), err.message); }
}
function showForgot(show) {
  $('#loginForm').classList.toggle('hidden', show);
  $('#forgotForm').classList.toggle('hidden', !show);
  hideAlert($('#alert'));
  $('#forgotResult')?.classList.add('hidden');
}
async function handleForgot(e) {
  e.preventDefault();
  const btn = $('#forgotBtn'); btn.disabled = true; btn.textContent = 'Mereset...';
  try {
    const data = await apiRequest('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: $('#forgotEmail').value.trim() }) });
    const box = $('#forgotResult');
    // Tampilkan password default sesuai permintaan
    box.innerHTML = `Password direset ke <b>user123</b>. Silakan login lalu <b>wajib ganti password</b>.`;
    box.className = 'alert alert-success';
    box.classList.remove('hidden');
    showToast('Password direset ke user123');
  } catch (err) {
    const box = $('#forgotResult');
    box.textContent = err.message;
    box.className = 'alert alert-error';
    box.classList.remove('hidden');
  } finally { btn.disabled = false; btn.textContent = 'Reset ke user123'; }
}
async function handleChangePassword(e) {
  e.preventDefault();
  const alertEl = $('#changeAlert'); hideAlert(alertEl);
  const btn = $('#changeBtn'); btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    const body = { newPassword: $('#newPassword').value };
    if ($('#curPassword').value) body.currentPassword = $('#curPassword').value;
    const data = await apiRequest('/auth/change-password', { method: 'POST', body: JSON.stringify(body) });
    showToast(data.message || 'Password diganti');
    $('#changeForm').reset();
    mustChangePassword = false;
    localStorage.setItem('mustChange', '0');
    updateUIForAuth();
  } catch (err) { showAlert(alertEl, err.message); }
  finally { btn.disabled = false; btn.textContent = 'Ganti Password'; }
}

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    const name = t.dataset.tab;
    $('#tab-latihan').classList.toggle('hidden', name !== 'latihan');
    $('#tab-vocab').classList.toggle('hidden', name !== 'vocab');
    $('#tab-report').classList.toggle('hidden', name !== 'report');
    if (name === 'report') loadReport();
    if (name === 'vocab') loadVocab();
  });
});

// ---------- LATIHAN (alur baru: Kategori -> Level -> Hari) ----------
let lessonCats = [];
let activeCat = null;      // 'kerja' | 'harian' | null (menu kategori)
let activeLevel = null;    // 'basic' | 'middle' | 'expert' | null (menu level)
let activeDay = 1;
let progressMap = {};      // key `${cat}__${level}` -> {completed_days, current_day}
let flipped = new Set();
let quizState = null;

function pkey(cat, lv) { return `${cat}__${lv}`; }

// Posisi terakhir disimpan PER AKUN (suffixed email) agar user yang pinjam
// perangkat yang sama tidak saling menimpa/membaca posisi belajar.
function posKeys() {
  const email = (localStorage.getItem('email') || 'anon').toLowerCase();
  return { cat: `latCat:${email}`, level: `latLevel:${email}` };
}
function saveLastPos() {
  try {
    const k = posKeys();
    if (activeCat) localStorage.setItem(k.cat, activeCat);
    if (activeLevel) localStorage.setItem(k.level, activeLevel);
  } catch { /* abaikan */ }
}
function loadLastPos() {
  try {
    const k = posKeys();
    return { cat: localStorage.getItem(k.cat), level: localStorage.getItem(k.level) };
  } catch { return { cat: null, level: null }; }
}

// Level terbuka pertama yang belum tuntas (buat lanjut otomatis); kalau semua tuntas, level terbuka terakhir (buat review).
function firstOpenLevel(catId) {
  const c = catOf(catId);
  if (!c || !(c.levels || []).length) return 'basic';
  const open = (c.levels || []).filter((l) => l.unlocked);
  const todo = open.find((l) => (catProgress(catId, l.id).completed_days.length) < l.totalDays);
  return (todo || open[open.length - 1] || c.levels[0]).id;
}

// Kategori pertama yang belum tuntas semua levelnya; kalau semua tuntas, kategori pertama.
function continueCategory() {
  const notDone = lessonCats.find((c) => (c.levels || []).some((l) => (catProgress(c.id, l.id).completed_days.length) < l.totalDays));
  return (notDone || lessonCats[0])?.id || 'kerja';
}

async function bootApp() {
  await Promise.all([loadLessonCats(), loadProgress(), loadVocab()]);
  // Langsung masuk ke materi tanpa klik: pakai posisi terakhir AKUN INI, atau lanjutkan otomatis.
  const saved = loadLastPos();
  const cat = saved.cat, lv = saved.level;
  if (cat && catOf(cat)) {
    activeCat = cat;
    const lvo = lv && levelOf(cat, lv);
    activeLevel = (lvo && lvo.unlocked) ? lv : firstOpenLevel(cat);
  } else {
    activeCat = continueCategory();
    activeLevel = firstOpenLevel(activeCat);
  }
  renderSelectors();
  await selectDay(progressMap[pkey(activeCat, activeLevel)]?.current_day || 1);
}

async function loadLessonCats() {
  try {
    lessonCats = await apiRequest('/lessons');
    if (activeCat && !lessonCats.find((c) => c.id === activeCat)) { activeCat = null; activeLevel = null; }
  } catch {
    lessonCats = [
      { id: 'kerja', title: 'Kerja & Meeting', emoji: '💼', totalDays: 32, levels: [{ id: 'basic', title: 'Basic', totalDays: 20, completed_days: [], current_day: 1, unlocked: true }] },
      { id: 'harian', title: 'Kehidupan Sehari-hari', emoji: '🌤️', totalDays: 32, levels: [{ id: 'basic', title: 'Basic', totalDays: 20, completed_days: [], current_day: 1, unlocked: true }] },
    ];
  }
}
async function loadProgress() {
  try {
    const all = await apiRequest('/progress');
    progressMap = {};
    all.forEach((p) => { progressMap[pkey(p.category, p.level || 'basic')] = p; });
    // sinkronkan info level di lessonCats bila ada
    lessonCats.forEach((c) => (c.levels || []).forEach((lv) => {
      const p = progressMap[pkey(c.id, lv.id)];
      if (p) { lv.completed_days = p.completed_days; lv.current_day = p.current_day; }
    }));
  } catch (err) { console.warn(err.message); }
}

function catOf(id) { return lessonCats.find((c) => c.id === id); }
function levelOf(catId, lvId) { return catOf(catId)?.levels?.find((l) => l.id === lvId); }
function catProgress(cat, lv) {
  return progressMap[pkey(cat, lv)] || { completed_days: [], current_day: 1 };
}
function totalDaysOf(cat, lv) {
  return levelOf(cat, lv)?.totalDays || 20;
}

// Kategori + level selalu terlihat di awal (tanpa menu/klik berlapis).
function renderSelectors() {
  const catSeg = $('#catSeg');
  catSeg.innerHTML = lessonCats.map((c) => {
    const done = (c.levels || []).reduce((s, l) => s + (catProgress(c.id, l.id).completed_days.length), 0);
    const total = c.totalDays || (c.levels || []).reduce((s, l) => s + l.totalDays, 0);
    const finished = total > 0 && done >= total;
    return `<button class="seg-btn ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id}">
      ${finished ? '✅ ' : ''}${escapeHtml(c.emoji || '')} ${escapeHtml(c.title)}<small>${done}/${total} hari</small>
    </button>`;
  }).join('');
  catSeg.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => selectCat(b.dataset.cat)));

  const c = catOf(activeCat);
  const levelSeg = $('#levelSeg');
  levelSeg.innerHTML = ((c && c.levels) || []).map((lv) => {
    const done = catProgress(activeCat, lv.id).completed_days.length;
    const finished = done >= lv.totalDays;
    const label = !lv.unlocked ? `🔒 ${escapeHtml(lv.title)}` : `${finished ? '✅ ' : ''}${escapeHtml(lv.title)}`;
    return `<button class="seg-btn ${lv.id === activeLevel ? 'active' : ''} ${lv.unlocked ? '' : 'locked'}" data-lv="${lv.id}" ${lv.unlocked ? '' : 'disabled'}>
      ${label}<small>${lv.unlocked ? `${done}/${lv.totalDays} hari` : 'kunci'}</small>
    </button>`;
  }).join('');
  levelSeg.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => selectLevel(b.dataset.lv)));
}

async function selectCat(id) {
  if (!catOf(id) || id === activeCat) return;
  activeCat = id;
  // Pertahankan level bila terbuka di kategori baru, kalau tidak ambil yang lanjut otomatis.
  const lv = activeLevel && levelOf(id, activeLevel);
  activeLevel = (lv && lv.unlocked) ? activeLevel : firstOpenLevel(id);
  saveLastPos();
  renderSelectors();
  await selectDay(progressMap[pkey(activeCat, activeLevel)]?.current_day || 1);
}

async function selectLevel(id) {
  const lv = levelOf(activeCat, id);
  if (!lv?.unlocked) { showToast('Selesaikan level sebelumnya dulu', 'error'); return; }
  if (id === activeLevel) return;
  activeLevel = id;
  saveLastPos();
  renderSelectors();
  await selectDay(progressMap[pkey(activeCat, activeLevel)]?.current_day || 1);
}

async function selectDay(day) {
  const total = totalDaysOf(activeCat, activeLevel);
  const p = catProgress(activeCat, activeLevel);
  const unlocked = Math.min(total, (p.completed_days.length ? Math.max(...p.completed_days) + 1 : 1));
  if (day > unlocked) { showToast('Selesaikan hari sebelumnya dulu', 'error'); return; }
  activeDay = day;
  flipped = new Set();
  quizState = null;
  await Promise.all([renderDay(), renderQuiz()]);
}

async function renderDay() {
  const total = totalDaysOf(activeCat, activeLevel);
  const p = catProgress(activeCat, activeLevel);
  const unlocked = Math.min(total, (p.completed_days.length ? Math.max(...p.completed_days) + 1 : 1));
  $('#latihanStat').textContent = `Hari ${activeDay}/${total} • ${p.completed_days.length * 5} kata`;
  $('#latihanBar').style.width = `${total ? (p.completed_days.length / total) * 100 : 0}%`;

  let chips = '';
  for (let d = 1; d <= total; d++) {
    let cls = 'day-chip';
    if (p.completed_days.includes(d)) cls += ' done';
    else if (d > unlocked) cls += ' locked';
    if (d === activeDay) cls += ' current';
    chips += `<button class="${cls}" ${d > unlocked ? 'disabled' : ''} data-day="${d}">${d}</button>`;
  }
  $('#dayChips').innerHTML = chips;
  $('#dayChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectDay(parseInt(b.dataset.day))));

  try {
    const data = await apiRequest(`/lessons/${activeCat}/${activeLevel}/${activeDay}`);
    $('#dayTitle').textContent = `Kata Hari ${data.day}`;
    $('#flashList').innerHTML = data.words.map((w, i) => `
      <div class="flash ${flipped.has(i) ? 'flipped' : ''}" data-i="${i}">
        <div class="flash-inner">
          <div class="flash-face"><strong>${escapeHtml(w.en)}</strong><span>Ketuk untuk lihat arti</span></div>
          <div class="flash-face flash-back"><strong>${escapeHtml(w.id)}</strong><span>${escapeHtml(w.enEx)}</span><span style="font-style:italic">${escapeHtml(w.idEx)}</span></div>
        </div>
      </div>`).join('');
    $('#flashList').querySelectorAll('.flash').forEach((el) => el.addEventListener('click', () => {
      const i = parseInt(el.dataset.i);
      flipped.has(i) ? flipped.delete(i) : flipped.add(i);
      el.classList.toggle('flipped');
    }));

    const done = p.completed_days.includes(activeDay);
    const lvName = levelOf(activeCat, activeLevel)?.title || '';
    $('#dayAction').innerHTML = done
      ? `<p class="note">✓ Sudah kamu hafalkan. Ketuk kartu buat baca ulang.</p>${p.completed_days.length >= total ? `<p class="note">🎉 Level ${escapeHtml(lvName)} selesai!</p>` : ''}`
      : (activeDay === unlocked
        ? `<button class="btn btn-primary" id="doneBtn">Tandai Hari Ini Selesai & Lanjut ✓</button>`
        : `<p class="note">Hari ini sudah terbuka untuk diulang.</p>`);
    $('#doneBtn')?.addEventListener('click', completeToday);
  } catch (err) { $('#flashList').innerHTML = `<p class="note">${escapeHtml(err.message)}</p>`; }
}

async function completeToday() {
  try {
    const finishedDay = activeDay;
    const updated = await apiRequest(`/progress/${activeCat}/${activeLevel}/complete`, { method: 'POST', body: JSON.stringify({ day: activeDay }) });
    progressMap[pkey(activeCat, activeLevel)] = updated;
    // refresh agar status unlock level berikutnya kebaca
    await loadLessonCats(); await loadProgress();
    const total = totalDaysOf(activeCat, activeLevel);
    if (updated.completed_days.length >= total) {
      // Level tuntas → otomatis masuk level berikutnya bila sudah kebuka
      const order = (catOf(activeCat)?.levels || []).map((l) => l.id);
      const next = order.slice(order.indexOf(activeLevel) + 1).find((id) => levelOf(activeCat, id)?.unlocked);
      renderSelectors();
      if (next) {
        activeLevel = next;
        saveLastPos();
        renderSelectors();
        await selectDay(1);
        showToast(`🎉 Level selesai! Otomatis lanjut ke ${levelOf(activeCat, next)?.title}`);
      } else {
        await selectDay(updated.current_day);
        showToast('🎉 Semua level kategori ini tuntas! Hebat!');
      }
    } else {
      renderSelectors();
      await selectDay(updated.current_day);
      showToast(`Hari ${finishedDay} selesai! Lanjut hari ${updated.current_day} 🎉`);
    }
  } catch (err) { showToast(err.message, 'error'); }
}

async function resetLevelProgress() {
  if (!confirm('Yakin mau hapus progres level ini?')) return;
  try {
    const updated = await apiRequest(`/progress/${activeCat}/${activeLevel}/reset`, { method: 'DELETE' });
    progressMap[pkey(activeCat, activeLevel)] = updated;
    await loadLessonCats(); await loadProgress();
    renderSelectors();
    await selectDay(1);
    showToast('Progres level direset');
  } catch (err) { showToast(err.message, 'error'); }
}

// --- kuis ---
async function renderQuiz(fresh = true) {
  const box = $('#quizBox');
  if (fresh) quizState = null;
  if (!quizState) {
    box.innerHTML = `<button class="btn btn-outline" id="startQuiz">🔁 Mulai Kuis Review (2 hari sebelumnya)</button><p class="note" id="quizMsg"></p>`;
    $('#startQuiz').addEventListener('click', startQuiz);
    return;
  }
  if (quizState.done) {
    box.innerHTML = `<p class="qword">Skor terakhir: ${quizState.score}/${quizState.total} (${quizState.percentage}%)</p>
      <div>${quizState.graded.map((g) => `<p class="note">${g.isCorrect ? '✅' : '❌'} <b>${escapeHtml(g.en)}</b> — jawabanmu: ${escapeHtml(g.chosen)} • benar: ${escapeHtml(g.correct)}</p>`).join('')}</div>
      <button class="btn btn-primary" id="retryQuiz">Ulangi Kuis</button>`;
    $('#retryQuiz').addEventListener('click', startQuiz);
    return;
  }
  const q = quizState.questions[quizState.idx];
  box.innerHTML = `<p class="stat-line">Soal ${quizState.idx + 1}/${quizState.questions.length}</p>
    <p class="qword">${escapeHtml(q.en)}</p>
    ${q.options.map((o, i) => `<button class="quiz-opt" data-i="${i}">${escapeHtml(o)}</button>`).join('')}`;
  box.querySelectorAll('.quiz-opt').forEach((b) => b.addEventListener('click', () => answerQuiz(parseInt(b.dataset.i))));
}

async function startQuiz() {
  const box = $('#quizBox');
  box.innerHTML = `<p class="note">Memuat soal...</p>`;
  try {
    const data = await apiRequest(`/lessons/${activeCat}/${activeLevel}/quiz?day=${activeDay}`);
    if (!data.questions.length) { box.innerHTML = `<p class="note">${escapeHtml(data.message || 'Belum ada materi review.')}</p><button class="btn btn-outline" id="backQ">Kembali</button>`; $('#backQ').addEventListener('click', () => renderQuiz()); return; }
    quizState = { questions: data.questions, idx: 0, answers: [], done: false };
    renderQuiz(false);
  } catch (err) { box.innerHTML = `<p class="note">${escapeHtml(err.message)}</p>`; }
}

async function answerQuiz(optIdx) {
  const q = quizState.questions[quizState.idx];
  quizState.answers.push({ en: q.en, chosen: q.options[optIdx] });
  // kunci tombol + highlight sementara
  document.querySelectorAll('.quiz-opt').forEach((b) => { b.disabled = true; });
  quizState.idx++;
  if (quizState.idx >= quizState.questions.length) {
    // submit ke server — skor dihitung server
    try {
      const res = await apiRequest('/practice/submit', { method: 'POST', body: JSON.stringify({ category: activeCat, level: activeLevel, day: activeDay, quiz_type: 'review', answers: quizState.answers }) });
      quizState.done = true; quizState.score = res.score; quizState.total = res.total; quizState.percentage = res.percentage; quizState.graded = res.graded;
      showToast(`Nilai: ${res.score}/${res.total} (${res.percentage}%)`);
    } catch (err) { showToast(err.message, 'error'); quizState = null; }
  }
  renderQuiz(false);
}

// ---------- VOCAB SAYA (CRUD via /api/vocab) ----------
let currentVocabId = null;
async function loadVocab() {
  try {
    const params = new URLSearchParams();
    const search = $('#searchInput').value.trim();
    const category = $('#categoryFilter').value;
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    params.set('limit', '50');
    const vocab = await apiRequest(`/vocab?${params}`);
    renderVocab(vocab);
    loadCategories();
  } catch (err) { showToast(err.message, 'error'); }
}
function renderVocab(vocab) {
  const list = $('#vocabList');
  if (!vocab.length) { list.innerHTML = '<li class="empty-state">Belum ada kata. Klik "+ Tambah" untuk mulai.</li>'; return; }
  list.innerHTML = vocab.map((v) => `
    <li class="vocab-item"><div><div class="vocab-word">${escapeHtml(v.word)}</div>
    <div class="vocab-meaning">${escapeHtml(v.meaning)}</div>
    ${v.example ? `<div class="vocab-example">${escapeHtml(v.example)}</div>` : ''}
    ${v.category ? `<span class="vocab-category">${escapeHtml(v.category)}</span>` : ''}</div>
    <div class="vocab-actions"><button class="btn btn-secondary" data-edit="${v.id}">Edit</button><button class="btn btn-danger" data-del="${v.id}">Hapus</button></div></li>`).join('');
  list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openModal(parseInt(b.dataset.edit))));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteVocab(parseInt(b.dataset.del))));
}
function loadCategories() {
  apiRequest('/vocab/categories').then((cats) => {
    $('#categories').innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join('');
    const sel = $('#categoryFilter'); const cur = sel.value;
    sel.innerHTML = '<option value="">Semua Kategori</option>' + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    sel.value = cur;
  }).catch(() => {});
}
function openModal(id = null) {
  currentVocabId = id;
  $('#vocabForm').reset(); hideAlert($('#modalAlert'));
  $('#modalTitle').textContent = id ? 'Edit Kata' : 'Tambah Kata';
  $('#saveBtn').textContent = id ? 'Update' : 'Simpan';
  if (id) apiRequest(`/vocab/${id}`).then((v) => { $('#word').value = v.word; $('#meaning').value = v.meaning; $('#example').value = v.example || ''; $('#category').value = v.category || ''; }).catch((e) => { showToast(e.message, 'error'); closeModal(); });
  $('#vocabModal').classList.add('active');
}
function closeModal() { $('#vocabModal').classList.remove('active'); currentVocabId = null; }
async function saveVocab(e) {
  e.preventDefault(); hideAlert($('#modalAlert'));
  const data = { word: $('#word').value.trim(), meaning: $('#meaning').value.trim(), example: $('#example').value.trim() || null, category: $('#category').value.trim() || null };
  if (!data.word || !data.meaning) { showAlert($('#modalAlert'), 'Kata dan arti wajib diisi'); return; }
  try {
    if (currentVocabId) { await apiRequest(`/vocab/${currentVocabId}`, { method: 'PATCH', body: JSON.stringify(data) }); showToast('Kata diperbarui'); }
    else { await apiRequest('/vocab', { method: 'POST', body: JSON.stringify(data) }); showToast('Kata ditambahkan'); }
    closeModal(); loadVocab();
  } catch (err) { showAlert($('#modalAlert'), err.message); }
}
async function deleteVocab(id) {
  if (!confirm('Hapus kata ini?')) return;
  try { await apiRequest(`/vocab/${id}`, { method: 'DELETE' }); showToast('Kata dihapus'); loadVocab(); }
  catch (err) { showToast(err.message, 'error'); }
}

// ---------- REPORT (via /api/practice/report/*) ----------
async function loadReport() {
  const cat = $('#reportCat').value;
  const q = cat ? `?category=${encodeURIComponent(cat)}` : '';
  try {
    const [stats, daily, history] = await Promise.all([
      apiRequest('/practice/report/stats'),
      apiRequest(`/practice/report/daily${q || '?days=30'}`),
      apiRequest(`/practice/history${q ? q + '&limit=10' : '?limit=10'}`),
    ]);
    $('#stAttempts').textContent = stats.totalAttempts;
    $('#stAvg').textContent = stats.avgScore;
    $('#stWords').textContent = stats.totalWordsLearned;

    const passAvg = stats.avgScore >= 70;
    const totalDoneDays = stats.categories.reduce((s, c) => s + c.completed_days.length, 0);
    const totalAllDays = lessonCats.reduce((s, c) => s + (c.totalDays || (c.levels || []).reduce((a, l) => a + l.totalDays, 0)), 0) || 64;
    $('#taskStatus').innerHTML = totalDoneDays >= totalAllDays && passAvg
      ? `<span class="badge pass">🎉 TUGAS SELESAI — ${totalAllDays} hari + rata-rata ${stats.avgScore}</span>`
      : `<span class="badge ${passAvg ? 'pass' : 'fail'}">${passAvg ? '✅ Rata-rata lulus (≥70)' : '⚠️ Rata-rata belum 70'} • ${totalDoneDays}/${totalAllDays} hari selesai</span>
         <p class="note">Patokan: selesaikan Basic 20 + Middle 6 + Expert 6 per kategori + jaga rata-rata kuis ≥ 70.</p>`;

    $('#dailyBars').innerHTML = daily.length ? daily.slice(0, 7).reverse().map((d) => {
      const color = d.avg_score >= 70 ? '#2F8F5B' : '#C98A1B';
      return `<div class="bar-row"><span class="lbl">${escapeHtml(d.date)}</span><div class="track"><div class="fill" style="width:${d.avg_score}%;background:${color}"></div></div><b>${d.avg_score}</b></div>`;
    }).join('') : '<p class="note">Belum ada latihan. Kerjakan kuis dulu, nilainya muncul di sini.</p>';

    $('#dailyTable').innerHTML = daily.length ? daily.map((d) => `
      <tr><td>${escapeHtml(d.date)}</td><td>${d.attempts}×</td><td>${d.avg_score}</td><td>${d.best_score}</td>
      <td><span class="badge ${d.avg_score >= 70 ? 'pass' : 'fail'}">${d.avg_score >= 70 ? 'Lulus' : 'Belum'}</span></td></tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#999">Belum ada data</td></tr>';

    $('#historyList').innerHTML = history.length ? history.map((h) => `
      <p class="note">[${escapeHtml(h.created_at?.slice(0, 16).replace('T', ' ') || '')}] <b>${escapeHtml(h.category)} • ${escapeHtml(h.level || 'basic')}</b> hari ${h.day} — <b>${h.score}/${h.total} (${h.percentage}%)</b></p>`).join('')
      : '<p class="note">Belum ada riwayat.</p>';

    const sel = $('#reportCat');
    if (sel.options.length <= 1) {
      lessonCats.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.title; sel.appendChild(o); });
      sel.value = cat;
    }
  } catch (err) { showToast(err.message, 'error'); }
}

// ---------- wire up ----------
$('#loginForm').addEventListener('submit', handleLogin);
$('#registerForm').addEventListener('submit', handleRegister);
$('#authToggle').addEventListener('click', () => switchAuthMode(!$('#loginForm').classList.contains('hidden')));
$('#forgotToggle')?.addEventListener('click', () => showForgot(true));
$('#forgotBack')?.addEventListener('click', () => showForgot(false));
$('#forgotForm')?.addEventListener('submit', handleForgot);
$('#changeForm')?.addEventListener('submit', handleChangePassword);
$('#logoutBtn').addEventListener('click', () => { clearAuth(); showToast('Sudah logout'); });
$('#openModalBtn').addEventListener('click', () => openModal());
$('#closeModal').addEventListener('click', closeModal);
$('#cancelModal').addEventListener('click', closeModal);
$('#vocabForm').addEventListener('submit', saveVocab);
$('#searchInput').addEventListener('input', debounce(loadVocab, 300));
$('#categoryFilter').addEventListener('change', loadVocab);
$('#reportCat').addEventListener('change', loadReport);
$('#resetLevelBtn')?.addEventListener('click', resetLevelProgress);
$('#vocabModal').addEventListener('click', (e) => { if (e.target === $('#vocabModal')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

if (authToken) {
  mustChangePassword = localStorage.getItem('mustChange') === '1';
  apiRequest('/auth/me').then((d) => {
    localStorage.setItem('email', d.user.email);
    mustChangePassword = !!d.user.mustChangePassword;
    localStorage.setItem('mustChange', mustChangePassword ? '1' : '0');
    updateUIForAuth();
  }).catch(() => clearAuth());
} else updateUIForAuth();
