import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const vocabCreateSchema = z.object({
  word: z.string().min(1, 'Word is required').max(100, 'Word too long'),
  meaning: z.string().min(1, 'Meaning is required').max(500, 'Meaning too long'),
  example: z.string().max(500, 'Example too long').optional(),
  category: z.string().max(50, 'Category too long').optional(),
});

export const vocabUpdateSchema = z.object({
  word: z.string().min(1).max(100).optional(),
  meaning: z.string().min(1).max(500).optional(),
  example: z.string().max(500).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
});

export const vocabQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    req.validated = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    req.query = result.data;
    next();
  };
}