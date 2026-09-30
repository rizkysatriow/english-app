import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { VOCAB, LABELS, LEVELS, LEVEL_NAMES, getDayWords, getTotalDays, isValidLevel } from '../data/lessons.js';
import { getProgress, isLevelUnlocked } from '../db/database.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authMiddleware);

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resolveLevel(req, fallback = 'basic') {
  const q = typeof req.query?.level === 'string' ? req.query.level.toLowerCase() : null;
  if (q && isValidLevel(q)) return q;
  if (fallback && isValidLevel(fallback)) return fallback;
  return 'basic';
}

function levelInfo(userId, category) {
  return LEVELS.map((lv) => {
    const totalDays = getTotalDays(category, lv);
    const p = getProgress(userId, category, lv);
    return {
      id: lv,
      title: LEVEL_NAMES[lv],
      totalDays,
      completedDays: p.completed_days,
      completedCount: p.completed_days.length,
      currentDay: p.current_day,
      unlocked: isLevelUnlocked(userId, category, lv, getTotalDays),
    };
  });
}

// Daftar kategori + level (alur baru: Kategori -> Level -> Hari)
// GET /api/lessons
router.get('/', (req, res) => {
  const categories = Object.keys(VOCAB).map((id) => {
    const levels = levelInfo(req.user.id, id);
    return {
      id,
      title: LABELS[id]?.title || id,
      emoji: LABELS[id]?.emoji || '',
      totalDays: levels.reduce((s, l) => s + l.totalDays, 0),
      levels,
    };
  });
  res.json(categories);
});

function buildQuiz(category, level, day) {
  if (!VOCAB[category]) throw new AppError('Category not found', 404);
  if (!isValidLevel(level)) throw new AppError('Level not found', 404);
  if (isNaN(day) || day < 1) throw new AppError('Invalid day', 400);
  const V = VOCAB[category][level];
  const ALL = V.flat();
  // pool: 2 hari sebelumnya dalam level yang sama (sama seperti HTML baru)
  let pool = [];
  [day - 1, day - 2].forEach((d) => {
    if (d >= 1 && d <= V.length) pool.push(...V[d - 1]);
  });
  if (pool.length === 0) return { category, level, day, questions: [], message: 'Belum ada materi review. Selesaikan hari ke-1 dulu.' };
  const count = Math.min(5, pool.length);
  const chosen = shuffle(pool).slice(0, count);
  const questions = chosen.map((w) => {
    const distractors = shuffle(ALL.filter((x) => x[0] !== w[0])).slice(0, 3).map((x) => x[1]);
    return { en: w[0], options: shuffle([w[1], ...distractors]) };
  });
  return { category, level, day, questions };
}

// Kuis review (baru): GET /api/lessons/:category/:level/quiz?day=3
router.get('/:category/:level/quiz', (req, res, next) => {
  try {
    const { category, level } = req.params;
    const day = parseInt(req.query.day);
    res.json(buildQuiz(category, level, day));
  } catch (err) { next(err); }
});

// Kuis review (lama, fallback level via ?level=): GET /api/lessons/:category/quiz?day=3
router.get('/:category/quiz', (req, res, next) => {
  try {
    const { category } = req.params;
    const day = parseInt(req.query.day);
    const level = resolveLevel(req);
    res.json(buildQuiz(category, level, day));
  } catch (err) { next(err); }
});

function sendDay(category, level, day, res) {
  if (!VOCAB[category]) throw new AppError('Category not found', 404);
  if (!isValidLevel(level)) throw new AppError('Level not found', 404);
  const total = getTotalDays(category, level);
  if (isNaN(day) || day < 1 || day > total) throw new AppError('Invalid day', 400);
  res.json({ category, level, day, totalDays: total, words: getDayWords(category, level, day) });
}

// Kata per hari (baru): GET /api/lessons/:category/:level/:day
router.get('/:category/:level/:day', (req, res, next) => {
  try {
    const { category, level } = req.params;
    if (level === 'quiz') return next();
    const day = parseInt(req.params.day);
    sendDay(category, level, day, res);
  } catch (err) { next(err); }
});

// Kata per hari (lama, fallback basic): GET /api/lessons/:category/:day
router.get('/:category/:day', (req, res, next) => {
  try {
    const { category } = req.params;
    if (req.params.day === 'quiz') return next();
    if (isValidLevel(req.params.day)) return next();
    const day = parseInt(req.params.day);
    const level = resolveLevel(req);
    sendDay(category, level, day, res);
  } catch (err) { next(err); }
});

export default router;
