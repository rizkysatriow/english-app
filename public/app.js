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
function setAuth(token, email) {
  authToken = token;
  localStorage.setItem('token', token);
  if (email) localStorage.setItem('email', email);
  updateUIForAuth();
}
function clearAuth() {
  authToken = null; currentUser = null;
  localStorage.removeItem('token'); localStorage.removeItem('email');
  updateUIForAuth();
}
function updateUIForAuth() {
  const isAuth = !!authToken;
  $('#authSection').classList.toggle('hidden', isAuth);
  $('#appSection').classList.toggle('hidden', !isAuth);
  $('#header').classList.toggle('hidden', !isAuth);
  if (isAuth) {
    $('#userEmail').textContent = localStorage.getItem('email') || '';
    bootApp();
  }
}
function switchAuthMode(isRegister) {
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
  try {
    const data = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#email').value.trim(), password: $('#password').value }) });
    setAuth(data.token, data.user.email);
    showToast('Selamat datang kembali!');
  } catch (err) { showAlert($('#alert'), err.message); }
  finally { btn.disabled = false; btn.textContent = 'Masuk'; }
}
async function handleRegister(e) {
  e.preventDefault(); hideAlert($('#alert'));
  try {
    const data = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ email: $('#regEmail').value.trim(), password: $('#regPassword').value }) });
    setAuth(data.token, data.user.email);
    showToast('Akun berhasil dibuat!');
  } catch (err) { showAlert($('#alert'), err.message); }
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

// ---------- LATIHAN (via API, progres tersimpan di DB) ----------
let lessonCats = [];
let activeCat = 'kerja';
let activeDay = 1;
let progressMap = {};
let flipped = new Set();
let quizState = null;

async function bootApp() {
  await Promise.all([loadLessonCats(), loadProgress(), loadVocab()]);
  renderCats();
  await selectDay(activeDay, false);
}

async function loadLessonCats() {
  try { lessonCats = await apiRequest('/lessons'); if (!lessonCats.find((c) => c.id === activeCat)) activeCat = lessonCats[0]?.id || 'kerja'; }
  catch { lessonCats = [{ id: 'kerja', title: 'Kerja & Meeting', totalDays: 20 }, { id: 'harian', title: 'Kehidupan Sehari-hari', totalDays: 20 }]; }
}
async function loadProgress() {
  try {
    const all = await apiRequest('/progress');
    progressMap = {};
    all.forEach((p) => { progressMap[p.category] = p; });
    // tentukan hari aktif = current_day kategori aktif
    const p = progressMap[activeCat];
    if (p) activeDay = p.current_day;
  } catch (err) { console.warn(err.message); }
}

function catProgress(cat) {
  return progressMap[cat] || { completed_days: [], current_day: 1 };
}
function totalDaysOf(cat) {
  return lessonCats.find((c) => c.id === cat)?.totalDays || 20;
}

function renderCats() {
  const grid = $('#catGrid');
  grid.innerHTML = lessonCats.map((c) => {
    const p = catProgress(c.id);
    const done = p.completed_days.length;
    return `<button class="cat-card ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id}">
      <strong>${c.id === 'kerja' ? '💼' : '🌤️'} ${escapeHtml(c.title)}</strong>
      <span>${done}/${c.totalDays} hari • ${done * 5} kata • lanjut: hari ${p.current_day}</span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.cat-card').forEach((b) => b.addEventListener('click', async () => {
    activeCat = b.dataset.cat;
    await loadProgress();
    renderCats();
    await selectDay(progressMap[activeCat]?.current_day || 1);
  }));
}

async function selectDay(day, rerenderCats = true) {
  const total = totalDaysOf(activeCat);
  const p = catProgress(activeCat);
  const unlocked = Math.min(total, (p.completed_days.length ? Math.max(...p.completed_days) + 1 : 1));
  if (day > unlocked) { showToast('Selesaikan hari sebelumnya dulu', 'error'); return; }
  activeDay = day;
  flipped = new Set();
  quizState = null;
  if (rerenderCats) renderCats();
  await Promise.all([renderDay(), renderQuiz()]);
}

async function renderDay() {
  const total = totalDaysOf(activeCat);
  const p = catProgress(activeCat);
  const unlocked = Math.min(total, (p.completed_days.length ? Math.max(...p.completed_days) + 1 : 1));
  $('#latihanStat').textContent = `Hari ${activeDay} dari ${total} • ${p.completed_days.length} hari selesai • ${p.completed_days.length * 5} kata dihafal`;
  $('#latihanBar').style.width = `${(p.completed_days.length / total) * 100}%`;

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
    const data = await apiRequest(`/lessons/${activeCat}/${activeDay}`);
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
    $('#dayAction').innerHTML = done
      ? `<p class="note">✓ Hari ini sudah selesai. Kamu bisa mengulang kartu atau lanjut ke hari ${Math.min(total, activeDay + 1)}.</p>`
      : (activeDay === unlocked
        ? `<button class="btn btn-primary" id="doneBtn">Tandai Hari Ini Selesai</button>`
        : `<p class="note">Hari ini sudah terbuka untuk diulang.</p>`);
    $('#doneBtn')?.addEventListener('click', completeToday);
  } catch (err) { $('#flashList').innerHTML = `<p class="note">${escapeHtml(err.message)}</p>`; }
}

async function completeToday() {
  try {
    const updated = await apiRequest(`/progress/${activeCat}/complete`, { method: 'POST', body: JSON.stringify({ day: activeDay }) });
    progressMap[activeCat] = updated;
    showToast(`Hari ${activeDay} selesai! 🎉`);
    renderCats();
    await selectDay(updated.current_day);
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
    const data = await apiRequest(`/lessons/${activeCat}/quiz?day=${activeDay}`);
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
      const res = await apiRequest('/practice/submit', { method: 'POST', body: JSON.stringify({ category: activeCat, day: activeDay, quiz_type: 'review', answers: quizState.answers }) });
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
    $('#taskStatus').innerHTML = totalDoneDays >= 40 && passAvg
      ? `<span class="badge pass">🎉 TUGAS SELESAI — 40 hari + rata-rata ${stats.avgScore}</span>`
      : `<span class="badge ${passAvg ? 'pass' : 'fail'}">${passAvg ? '✅ Rata-rata lulus (≥70)' : '⚠️ Rata-rata belum 70'} • ${totalDoneDays}/40 hari selesai</span>
         <p class="note">Patokan: selesaikan 20 hari × 2 kategori + jaga rata-rata kuis ≥ 70.</p>`;

    $('#dailyBars').innerHTML = daily.length ? daily.slice(0, 7).reverse().map((d) => {
      const color = d.avg_score >= 70 ? '#2F8F5B' : '#C98A1B';
      return `<div class="bar-row"><span class="lbl">${escapeHtml(d.date)}</span><div class="track"><div class="fill" style="width:${d.avg_score}%;background:${color}"></div></div><b>${d.avg_score}</b></div>`;
    }).join('') : '<p class="note">Belum ada latihan. Kerjakan kuis dulu, nilainya muncul di sini.</p>';

    $('#dailyTable').innerHTML = daily.length ? daily.map((d) => `
      <tr><td>${escapeHtml(d.date)}</td><td>${d.attempts}×</td><td>${d.avg_score}</td><td>${d.best_score}</td>
      <td><span class="badge ${d.avg_score >= 70 ? 'pass' : 'fail'}">${d.avg_score >= 70 ? 'Lulus' : 'Belum'}</span></td></tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#999">Belum ada data</td></tr>';

    $('#historyList').innerHTML = history.length ? history.map((h) => `
      <p class="note">[${escapeHtml(h.created_at?.slice(0, 16).replace('T', ' ') || '')}] <b>${escapeHtml(h.category)}</b> hari ${h.day} — <b>${h.score}/${h.total} (${h.percentage}%)</b></p>`).join('')
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
$('#logoutBtn').addEventListener('click', () => { clearAuth(); showToast('Sudah logout'); });
$('#openModalBtn').addEventListener('click', () => openModal());
$('#closeModal').addEventListener('click', closeModal);
$('#cancelModal').addEventListener('click', closeModal);
$('#vocabForm').addEventListener('submit', saveVocab);
$('#searchInput').addEventListener('input', debounce(loadVocab, 300));
$('#categoryFilter').addEventListener('change', loadVocab);
$('#reportCat').addEventListener('change', loadReport);
$('#vocabModal').addEventListener('click', (e) => { if (e.target === $('#vocabModal')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

if (authToken) {
  apiRequest('/auth/me').then((d) => { localStorage.setItem('email', d.user.email); updateUIForAuth(); }).catch(() => clearAuth());
} else updateUIForAuth();
