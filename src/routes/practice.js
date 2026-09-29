import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { validate, validateQuery } from '../middleware/validation.js';
import {
  savePracticeResult, getPracticeHistory, getDailyReport, getStats,
} from '../db/database.js';
import { VOCAB } from '../data/lessons.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authMiddleware);

// Submit jawaban kuis — skor dihitung di SERVER dari data VOCAB (anti manipulasi)
const submitSchema = z.object({
  category: z.string().min(1),
  day: z.number().int().min(1),
  quiz_type: z.string().optional().default('review'),
  answers: z.array(z.object({
    en: z.string().min(1),
    chosen: z.string().min(1),
  })).min(1).max(20),
});

router.post('/submit', validate(submitSchema), (req, res, next) => {
  try {
    const { category, day, quiz_type, answers } = req.validated;
    if (!VOCAB[category]) throw new AppError('Category not found', 404);

    // Cari arti benar dari semua kosakata kategori tsb
    const answerKey = new Map();
    VOCAB[category].flat().forEach((w) => answerKey.set(w[0], w[1]));

    let score = 0;
    const graded = answers.map((a) => {
      const correct = answerKey.get(a.en) || null;
      const isCorrect = correct !== null && a.chosen === correct;
      if (isCorrect) score++;
      return { en: a.en, chosen: a.chosen, correct, isCorrect };
    });

    const saved = savePracticeResult(req.user.id, {
      category, day, quiz_type, score, total: answers.length, answers: graded,
    });
    res.status(201).json({
      id: saved.id,
      category, day, quiz_type,
      score, total: answers.length,
      percentage: saved.percentage,
      graded,
      created_at: saved.created_at,
    });
  } catch (err) { next(err); }
});

const historyQuery = z.object({
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/history', validateQuery(historyQuery), (req, res, next) => {
  try {
    const rows = getPracticeHistory(req.user.id, req.query);
    res.json(rows.map((r) => ({
      ...r,
      answers: r.answers_json ? JSON.parse(r.answers_json) : [],
      answers_json: undefined,
    })));
  } catch (err) { next(err); }
});

// Report nilai harian — patokan menyelesaikan tugas
const reportQuery = z.object({
  category: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

router.get('/report/daily', validateQuery(reportQuery), (req, res, next) => {
  try {
    res.json(getDailyReport(req.user.id, req.query));
  } catch (err) { next(err); }
});

router.get('/report/stats', (req, res, next) => {
  try {
    res.json(getStats(req.user.id));
  } catch (err) { next(err); }
});

export default router;
