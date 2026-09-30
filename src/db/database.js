import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { encrypt, decrypt } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/vocab.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function columnExists(table, column) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return rows.some((r) => r.name === column);
  } catch { return false; }
}

function migrateUserProgressToLevels() {
  // Tabel lama: PRIMARY KEY (user_id, category) tanpa kolom level.
  // Tabel baru: PRIMARY KEY (user_id, category, level), data lama -> level 'basic'.
  if (!columnExists('user_progress', 'level')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_progress_new (
        user_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'basic',
        completed_days TEXT NOT NULL DEFAULT '[]',
        current_day INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, category, level),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT OR IGNORE INTO user_progress_new (user_id, category, level, completed_days, current_day, updated_at)
        SELECT user_id, category, 'basic', completed_days, current_day, updated_at FROM user_progress;
      DROP TABLE user_progress;
      ALTER TABLE user_progress_new RENAME TO user_progress;
    `);
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vocabularies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      word_encrypted TEXT NOT NULL,
      meaning_encrypted TEXT NOT NULL,
      example_encrypted TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_vocab_user ON vocabularies(user_id);
    CREATE INDEX IF NOT EXISTS idx_vocab_category ON vocabularies(category);

    CREATE TABLE IF NOT EXISTS user_progress (
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'basic',
      completed_days TEXT NOT NULL DEFAULT '[]',
      current_day INTEGER NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, category, level),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practice_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'basic',
      day INTEGER NOT NULL,
      quiz_type TEXT NOT NULL DEFAULT 'review',
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      percentage REAL NOT NULL,
      answers_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_practice_user ON practice_results(user_id);
    CREATE INDEX IF NOT EXISTS idx_practice_date ON practice_results(user_id, created_at);
  `);
  // Migrasi DB lama (tanpa kolom level / must_change_password)
  try { migrateUserProgressToLevels(); } catch (e) { console.warn('migrate progress:', e.message); }
  try { if (!columnExists('users', 'must_change_password')) db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { if (!columnExists('practice_results', 'level')) db.exec("ALTER TABLE practice_results ADD COLUMN level TEXT NOT NULL DEFAULT 'basic'"); } catch {}
  try { if (!columnExists('user_progress', 'level')) db.exec("ALTER TABLE user_progress ADD COLUMN level TEXT NOT NULL DEFAULT 'basic'"); } catch {}
}

function createUser(email, passwordHash) {
  const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
  const result = stmt.run(email, passwordHash);
  return result.lastInsertRowid;
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserById(id) {
  const row = db.prepare('SELECT id, email, created_at, must_change_password FROM users WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, must_change_password: Number(row.must_change_password || 0), mustChangePassword: Number(row.must_change_password || 0) === 1 };
}

function updateUserPassword(userId, passwordHash, mustChange = false) {
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(passwordHash, mustChange ? 1 : 0, userId);
}

function setMustChangePassword(userId, mustChange) {
  db.prepare('UPDATE users SET must_change_password = ? WHERE id = ?').run(mustChange ? 1 : 0, userId);
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    mustChangePassword: Number(row.must_change_password || 0) === 1,
  };
}

function createVocab(userId, word, meaning, example, category) {
  const stmt = db.prepare(`
    INSERT INTO vocabularies (user_id, word_encrypted, meaning_encrypted, example_encrypted, category)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    userId,
    encrypt(word),
    encrypt(meaning),
    example ? encrypt(example) : null,
    category
  );
  return result.lastInsertRowid;
}

function getVocabById(id, userId) {
  const row = db.prepare('SELECT * FROM vocabularies WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return null;
  return {
    ...row,
    word: decrypt(row.word_encrypted),
    meaning: decrypt(row.meaning_encrypted),
    example: row.example_encrypted ? decrypt(row.example_encrypted) : null,
  };
}

function getAllVocab(userId, { category, search, limit = 50, offset = 0 } = {}) {
  // NOTE: word/meaning disimpan terenkripsi, jadi LIKE di SQL tidak bisa dipakai.
  // Filter category di SQL, decrypt dulu, baru filter search di JS.
  let query = 'SELECT * FROM vocabularies WHERE user_id = ?';
  const params = [userId];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params);
  let result = rows.map(row => ({
    ...row,
    word: decrypt(row.word_encrypted),
    meaning: decrypt(row.meaning_encrypted),
    example: row.example_encrypted ? decrypt(row.example_encrypted) : null,
  }));

  if (search) {
    const s = search.toLowerCase();
    result = result.filter(r =>
      (r.word && r.word.toLowerCase().includes(s)) ||
      (r.meaning && r.meaning.toLowerCase().includes(s))
    );
  }

  return result.slice(offset, offset + limit);
}

function updateVocab(id, userId, updates) {
  const fields = [];
  const params = [];

  if (updates.word !== undefined) {
    fields.push('word_encrypted = ?');
    params.push(encrypt(updates.word));
  }
  if (updates.meaning !== undefined) {
    fields.push('meaning_encrypted = ?');
    params.push(encrypt(updates.meaning));
  }
  if (updates.example !== undefined) {
    fields.push('example_encrypted = ?');
    params.push(updates.example ? encrypt(updates.example) : null);
  }
  if (updates.category !== undefined) {
    fields.push('category = ?');
    params.push(updates.category);
  }

  if (fields.length === 0) return false;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id, userId);

  const result = db.prepare(`UPDATE vocabularies SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  return result.changes > 0;
}

function deleteVocab(id, userId) {
  const result = db.prepare('DELETE FROM vocabularies WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

function getCategories(userId) {
  return db.prepare('SELECT DISTINCT category FROM vocabularies WHERE user_id = ? AND category IS NOT NULL').all(userId);
}

// ---------- Progress latihan (per category + level, alur baru HTML) ----------

const VALID_LEVELS = ['basic', 'middle', 'expert'];
function normalizeLevel(level) {
  return VALID_LEVELS.includes(level) ? level : 'basic';
}

function getProgress(userId, category, level = 'basic') {
  level = normalizeLevel(level);
  const row = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND category = ? AND level = ?').get(userId, category, level);
  if (!row) return { user_id: userId, category, level, completed_days: [], current_day: 1 };
  let completed_days = [];
  try { completed_days = JSON.parse(row.completed_days || '[]'); } catch { completed_days = []; }
  return { user_id: userId, category, level, completed_days, current_day: row.current_day, updated_at: row.updated_at };
}

function getAllProgress(userId) {
  const rows = db.prepare('SELECT * FROM user_progress WHERE user_id = ?').all(userId);
  return rows.map(row => {
    let completed_days = [];
    try { completed_days = JSON.parse(row.completed_days || '[]'); } catch { completed_days = []; }
    return { category: row.category, level: row.level || 'basic', completed_days, current_day: row.current_day, updated_at: row.updated_at };
  });
}

// Unlock: basic selalu terbuka; middle butuh basic tuntas; expert butuh middle tuntas.
function isLevelUnlocked(userId, category, level, totalDaysLookup) {
  level = normalizeLevel(level);
  if (level === 'basic') return true;
  const prev = level === 'middle' ? 'basic' : 'middle';
  const prevTotal = totalDaysLookup ? totalDaysLookup(category, prev) : Infinity;
  const prevProg = getProgress(userId, category, prev);
  return prevProg.completed_days.length >= prevTotal && prevTotal > 0;
}

function completeDay(userId, category, level, day, totalDays = 20) {
  level = normalizeLevel(level);
  const current = getProgress(userId, category, level);
  const set = new Set(current.completed_days);
  set.add(day);
  const completed_days = [...set].sort((a, b) => a - b);
  const maxDone = Math.max(...completed_days, 0);
  const current_day = Math.min(totalDays, maxDone + 1);
  db.prepare(`
    INSERT INTO user_progress (user_id, category, level, completed_days, current_day, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, category, level) DO UPDATE SET
      completed_days = excluded.completed_days,
      current_day = excluded.current_day,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, category, level, JSON.stringify(completed_days), current_day);
  return getProgress(userId, category, level);
}

function resetProgress(userId, category, level) {
  if (level) {
    level = normalizeLevel(level);
    db.prepare('DELETE FROM user_progress WHERE user_id = ? AND category = ? AND level = ?').run(userId, category, level);
    return getProgress(userId, category, level);
  }
  db.prepare('DELETE FROM user_progress WHERE user_id = ? AND category = ?').run(userId, category);
  return getProgress(userId, category, 'basic');
}

// ---------- Hasil latihan ----------

function savePracticeResult(userId, { category, level = 'basic', day, quiz_type = 'review', score, total, answers = [] }) {
  level = normalizeLevel(level);
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const stmt = db.prepare(`
    INSERT INTO practice_results (user_id, category, level, day, quiz_type, score, total, percentage, answers_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, category, level, day, quiz_type, score, total, percentage, JSON.stringify(answers));
  return db.prepare('SELECT * FROM practice_results WHERE id = ?').get(result.lastInsertRowid);
}

function getPracticeHistory(userId, { category, level, limit = 50, offset = 0 } = {}) {
  let query = 'SELECT * FROM practice_results WHERE user_id = ?';
  const params = [userId];
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (level) { query += ' AND level = ?'; params.push(normalizeLevel(level)); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(query).all(...params);
}

// Report nilai harian: rata-rata per hari (YYYY-MM-DD), cocok jadi patokan tugas
function getDailyReport(userId, { category, level, days = 30 } = {}) {
  let query = `
    SELECT date(created_at) as date,
           COUNT(*) as attempts,
           AVG(percentage) as avg_score,
           MAX(percentage) as best_score,
           SUM(score) as total_correct,
           SUM(total) as total_questions
    FROM practice_results WHERE user_id = ?
  `;
  const params = [userId];
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (level) { query += ' AND level = ?'; params.push(normalizeLevel(level)); }
  query += ` GROUP BY date(created_at) ORDER BY date DESC LIMIT ?`;
  params.push(days);
  return db.prepare(query).all(...params).map(r => ({
    ...r,
    avg_score: Math.round(r.avg_score || 0),
  }));
}

function getStats(userId) {
  const totalAttempts = db.prepare('SELECT COUNT(*) as c FROM practice_results WHERE user_id = ?').get(userId).c;
  const avgRow = db.prepare('SELECT AVG(percentage) as a FROM practice_results WHERE user_id = ?').get(userId);
  const progress = getAllProgress(userId);
  const totalWords = progress.reduce((s, p) => s + p.completed_days.length * 5, 0);
  return {
    totalAttempts,
    avgScore: Math.round(avgRow.a || 0),
    totalWordsLearned: totalWords,
    categories: progress,
  };
}

initSchema();

export { db, createUser, getUserByEmail, getUserById, toPublicUser, updateUserPassword, setMustChangePassword, createVocab, getVocabById, getAllVocab, updateVocab, deleteVocab, getCategories, getProgress, getAllProgress, isLevelUnlocked, completeDay, resetProgress, savePracticeResult, getPracticeHistory, getDailyReport, getStats, normalizeLevel, VALID_LEVELS };