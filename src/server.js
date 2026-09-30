import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db/database.js';
import authRoutes from './routes/auth.js';
import vocabRoutes from './routes/vocab.js';
import lessonsRoutes from './routes/lessons.js';
import progressRoutes from './routes/progress.js';
import practiceRoutes from './routes/practice.js';
import configRoutes from './routes/config.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));
// CORS: izinkan localhost + URL tunnel Cloudflare (sama-origin selalu lolos)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.PUBLIC_URL,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
].map((o) => o?.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl / mobile
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
    if (/\.trycloudflare\.com$/.test(origin) || /\.cfargotunnel\.com$/.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Data semua user bersifat pribadi & berbeda per akun.
// Larang cache (browser/proxy/tunnel) agar response user A tidak pernah disajikan ke user B.
app.use('/api/', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/vocab', vocabRoutes);
app.use('/api/lessons', lessonsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/config', configRoutes);

// Halaman konfigurasi (akses via browser: /config)
app.get('/config', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/config.html'));
});

app.use(express.static('public'));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Config page: http://localhost:${PORT}/config`);
});

export default app;