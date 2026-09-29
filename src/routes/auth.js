import express from 'express';
import bcrypt from 'bcryptjs';
import { createUser, getUserByEmail } from '../db/database.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';
import { validate, registerSchema, loginSchema } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;

    const existing = getUserByEmail(email);
    if (existing) {
      throw new AppError('Email already registered', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = createUser(email, passwordHash);

    const token = generateToken(userId);
    res.status(201).json({ token, user: { id: userId, email } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;

    const user = getUserByEmail(email);
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});

export default router;