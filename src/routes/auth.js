import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createUser, getUserByEmail, updateUserPassword, setMustChangePassword, toPublicUser } from '../db/database.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';
import { validate, registerSchema, loginSchema } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

const DEFAULT_RESET_PASSWORD = 'user123';

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
    res.status(201).json({ token, user: { id: userId, email, mustChangePassword: false } });
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
    const publicUser = toPublicUser(user);
    res.json({ token, user: { id: publicUser.id, email: publicUser.email, mustChangePassword: publicUser.mustChangePassword } });
  } catch (err) {
    next(err);
  }
});

// Lupa password: reset ke password default "user123".
// Response menampilkan password default agar bisa langsung dipakai login,
// dan menandai akun wajib ganti password saat login berikutnya.
const forgotSchema = z.object({ email: z.string().email('Invalid email format') });

router.post('/forgot-password', validate(forgotSchema), async (req, res, next) => {
  try {
    const { email } = req.validated;
    const user = getUserByEmail(email);
    // Selalu balas sukses agar email tidak bisa di-enumerate, tapi flag hanya diubah bila user ada.
    if (!user) {
      return res.json({ ok: true, message: 'Jika email terdaftar, password sudah direset ke user123.' });
    }
    const passwordHash = await bcrypt.hash(DEFAULT_RESET_PASSWORD, 12);
    updateUserPassword(user.id, passwordHash, true);
    res.json({
      ok: true,
      message: 'Password direset. Silakan login lalu wajib ganti password.',
      defaultPassword: DEFAULT_RESET_PASSWORD,
      mustChangePassword: true,
    });
  } catch (err) {
    next(err);
  }
});

// Wajib ganti password (dipakai setelah reset maupun ganti rutin).
// Bila akun flagged must_change_password, currentPassword boleh dikosongkan.
const changeSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter').max(100),
});

router.post('/change-password', authMiddleware, validate(changeSchema), async (req, res, next) => {
  try {
    const full = getUserByEmail(req.user.email);
    if (!full) throw new AppError('User not found', 404);
    const mustChange = Number(full.must_change_password || 0) === 1;
    const { currentPassword, newPassword } = req.validated;

    if (!mustChange) {
      if (!currentPassword) throw new AppError('Password lama wajib diisi', 400);
      const valid = await bcrypt.compare(currentPassword, full.password_hash);
      if (!valid) throw new AppError('Password lama salah', 401);
    }
    if (await bcrypt.compare(newPassword, full.password_hash)) {
      throw new AppError('Password baru tidak boleh sama dengan password lama', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    updateUserPassword(full.id, passwordHash, false);
    res.json({ ok: true, message: 'Password berhasil diganti. Silakan lanjut belajar.' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, mustChangePassword: !!req.user.mustChangePassword } });
});

export default router;