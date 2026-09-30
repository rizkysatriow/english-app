import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { getProgress, getAllProgress, completeDay, resetProgress, isLevelUnlocked } from '../db/database.js';
import { getTotalDays, VOCAB, LEVELS, LEVEL_NAMES, isValidLevel } from '../data/lessons.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authMiddleware);

const completeSchema = z.object({
  day: z.number().int().min(1).max(100),
});

function requireCategory(category) {
  if (!VOCAB[category]) throw new AppError('Category not found', 404);
}

function requireLevel(level) {
  if (!isValidLevel(level)) throw new AppError('Level not found', 404);
}

function levelsSummary(userId, category) {
  return LEVELS.map((lv) => {
    const totalDays = getTotalDays(category, lv);
    const p = getProgress(userId, category, lv);
    return {
      level: lv,
      title: LEVEL_NAMES[lv],
      totalDays,
      ...p,
      unlocked: isLevelUnlocked(userId, category, lv, getTotalDays),
    };
  });
}

// Semua progres user (untuk lanjutkan latihan + dashboard)
router.get('/', (req, res, next) => {
  try {
    res.json(getAllProgress(req.user.id));
  } catch (err) { next(err); }
});

// Ringkasan per kategori (untuk menu level): GET /api/progress/:category
router.get('/:category', (req, res, next) => {
  try {
    const { category } = req.params;
    requireCategory(category);
    res.json({
      category,
      totalDays: getTotalDays(category),
      levels: levelsSummary(req.user.id, category),
    });
  } catch (err) { next(err); }
});

// Detail per level: GET /api/progress/:category/:level
router.get('/:category/:level', (req, res, next) => {
  try {
    const { category, level } = req.params;
    requireCategory(category);
    requireLevel(level);
    const p = getProgress(req.user.id, category, level);
    res.json({
      ...p,
      totalDays: getTotalDays(category, level),
      unlocked: isLevelUnlocked(req.user.id, category, level, getTotalDays),
    });
  } catch (err) { next(err); }
});

// Tandai hari selesai -> otomatis memajukan current_day
// Baru: POST /api/progress/:category/:level/complete
router.post('/:category/:level/complete', validate(completeSchema), (req, res, next) => {
  try {
    const { category, level } = req.params;
    requireCategory(category);
    requireLevel(level);
    if (!isLevelUnlocked(req.user.id, category, level, getTotalDays)) {
      throw new AppError('Selesaikan level sebelumnya dulu', 403);
    }
    const totalDays = getTotalDays(category, level);
    if (req.validated.day > totalDays) throw new AppError('Invalid day', 400);
    const p = completeDay(req.user.id, category, level, req.validated.day, totalDays);
    res.json({ ...p, totalDays, unlocked: true });
  } catch (err) { next(err); }
});

// Lama (fallback basic): POST /api/progress/:category/complete
router.post('/:category/complete', validate(completeSchema), (req, res, next) => {
  try {
    const { category } = req.params;
    if (isValidLevel(category)) return next();
    requireCategory(category);
    const level = 'basic';
    const totalDays = getTotalDays(category, level);
    if (req.validated.day > totalDays) throw new AppError('Invalid day', 400);
    const p = completeDay(req.user.id, category, level, req.validated.day, totalDays);
    res.json({ ...p, totalDays });
  } catch (err) { next(err); }
});

// Baru: DELETE /api/progress/:category/:level/reset
router.delete('/:category/:level/reset', (req, res, next) => {
  try {
    const { category, level } = req.params;
    requireCategory(category);
    requireLevel(level);
    const p = resetProgress(req.user.id, category, level);
    res.json({ ...p, totalDays: getTotalDays(category, level) });
  } catch (err) { next(err); }
});

// Lama: DELETE /api/progress/:category/reset (reset semua level kategori tsb)
router.delete('/:category/reset', (req, res, next) => {
  try {
    const { category } = req.params;
    if (isValidLevel(category)) return next();
    requireCategory(category);
    const p = resetProgress(req.user.id, category);
    res.json({ ...p, totalDays: getTotalDays(category) });
  } catch (err) { next(err); }
});

export default router;
