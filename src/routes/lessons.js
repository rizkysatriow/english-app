import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { VOCAB, LABELS, getDayWords, getTotalDays } from '../data/lessons.js';
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

// Daftar kategori latihan
router.get('/', (req, res) => {
  const categories = Object.keys(VOCAB).map((id) => ({
    id,
    title: LABELS[id]?.title || id,
    totalDays: VOCAB[id].length,
  }));
  res.json(categories);
});

// Kata per hari: GET /api/lessons/:category/:day
// Generate kuis review: GET /api/lessons/:category/quiz?day=3
// NOTE: quiz dicek dulu agar "quiz" tidak dianggap :day
router.get('/:category/quiz', (req, res, next) => {
  try {
    const { category } = req.params;
    const day = parseInt(req.query.day);
    if (!VOCAB[category]) throw new AppError('Category not found', 404);
    if (isNaN(day) || day < 1) throw new AppError('Invalid day', 400);

    const V = VOCAB[category];
    const ALL = V.flat();
    // pool: 2 hari sebelumnya
    let pool = [];
    [day - 1, day - 2].forEach((d) => {
      if (d >= 1 && d <= V.length) pool.push(...V[d - 1]);
    });
    if (pool.length === 0) return res.json({ questions: [], message: 'Belum ada materi review. Selesaikan hari ke-1 dulu.' });

    const count = Math.min(5, pool.length);
    const chosen = shuffle(pool).slice(0, count);
    const questions = chosen.map((w) => {
      const distractors = shuffle(ALL.filter((x) => x[0] !== w[0])).slice(0, 3).map((x) => x[1]);
      return { en: w[0], options: shuffle([w[1], ...distractors]) };
    });
    res.json({ category, day, questions });
  } catch (err) { next(err); }
});

router.get('/:category/:day', (req, res, next) => {
  try {
    const { category } = req.params;
    if (req.params.day === 'quiz') return next();
    const day = parseInt(req.params.day);
    if (!VOCAB[category]) throw new AppError('Category not found', 404);
    if (isNaN(day) || day < 1 || day > VOCAB[category].length) throw new AppError('Invalid day', 400);
    res.json({
      category,
      day,
      totalDays: VOCAB[category].length,
      words: getDayWords(category, day),
    });
  } catch (err) { next(err); }
});

export default router;
