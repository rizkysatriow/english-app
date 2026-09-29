import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { validate, validateQuery, vocabCreateSchema, vocabUpdateSchema, vocabQuerySchema } from '../middleware/validation.js';
import { createVocab, getVocabById, getAllVocab, updateVocab, deleteVocab, getCategories } from '../db/database.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', validate(vocabCreateSchema), (req, res, next) => {
  try {
    const { word, meaning, example, category } = req.validated;
    const id = createVocab(req.user.id, word, meaning, example, category);
    const vocab = getVocabById(id, req.user.id);
    res.status(201).json(vocab);
  } catch (err) {
    next(err);
  }
});

router.get('/', validateQuery(vocabQuerySchema), (req, res, next) => {
  try {
    const { category, search, limit, offset } = req.query;
    const vocab = getAllVocab(req.user.id, { category, search, limit, offset });
    res.json(vocab);
  } catch (err) {
    next(err);
  }
});

router.get('/categories', (req, res, next) => {
  try {
    const categories = getCategories(req.user.id);
    res.json(categories.map(c => c.category));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('Invalid ID', 400);

    const vocab = getVocabById(id, req.user.id);
    if (!vocab) throw new AppError('Not found', 404);

    res.json(vocab);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(vocabUpdateSchema), (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('Invalid ID', 400);

    const updated = updateVocab(id, req.user.id, req.validated);
    if (!updated) throw new AppError('Not found', 404);

    const vocab = getVocabById(id, req.user.id);
    res.json(vocab);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('Invalid ID', 400);

    const deleted = deleteVocab(id, req.user.id);
    if (!deleted) throw new AppError('Not found', 404);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;