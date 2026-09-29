import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { getProgress, getAllProgress, completeDay, resetProgress } from '../db/database.js';
import { getTotalDays, VOCAB } from '../data/lessons.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authMiddleware);

const completeSchema = z.object({
  day: z.number().int().min(1).max(100),
});

// Semua progres user (untuk lanjutkan latihan + dashboard)
router.get('/', (req, res, next) => {
  try {
    res.json(getAllProgress(req.user.id));
  } catch (err) { next(err); }
});

router.get('/:category', (req, res, next) => {
  try {
    const { category } = req.params;
    if (!VOCAB[category]) throw new AppError('Category not found', 404);
    const p = getProgress(req.user.id, category);
    res.json({ ...p, totalDays: getTotalDays(category) });
  } catch (err) { next(err); }
});

// Tandai hari selesai -> otomatis memajukan current_day
router.post('/:category/complete', validate(completeSchema), (req, res, next) => {
  try {
    const { category } = req.params;
    if (!VOCAB[category]) throw new AppError('Category not found', 404);
    const totalDays = getTotalDays(category);
    if (req.validated.day > totalDays) throw new AppError('Invalid day', 400);
    const p = completeDay(req.user.id, category, req.validated.day, totalDays);
    res.json({ ...p, totalDays });
  } catch (err) { next(err); }
});

router.delete('/:category/reset', (req, res, next) => {
  try {
    const { category } = req.params;
    if (!VOCAB[category]) throw new AppError('Category not found', 404);
    const p = resetProgress(req.user.id, category);
    res.json({ ...p, totalDays: getTotalDays(category) });
  } catch (err) { next(err); }
});

export default router;
