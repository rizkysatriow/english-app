import { ZodError } from 'zod';

export function errorHandler(err, req, res, next) {
  // Error operasional (4xx seperti email duplikat) itu hal wajar,
  // jangan tampilkan stack trace agar log tidak terlihat seperti crash.
  if (err.isOperational && err.statusCode && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  console.error('Error:', err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  res.status(500).json({ error: 'Internal server error' });
}

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}