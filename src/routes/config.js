import express from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, '../../.env');

// Semua endpoint config butuh login (mencegah orang asing ubah port server)
router.use(authMiddleware);

// GET /api/config — baca konfigurasi saat ini
router.get('/', (req, res) => {
  res.json({
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    publicUrl: process.env.PUBLIC_URL || '',
    localUrl: `http://localhost:${process.env.PORT || 3000}`,
    configUrl: `http://localhost:${process.env.PORT || 3000}/config`,
  });
});

const updateSchema = z.object({
  port: z.number().int().min(1).max(65535).optional(),
  frontendUrl: z.string().url('FRONTEND_URL harus URL valid, mis. http://localhost:4000').optional(),
  // URL publik dari tunnel Cloudflare, mis. https://abc-english.trycloudflare.com (boleh dikosongkan)
  publicUrl: z.string().max(200).optional(),
});

// PUT /api/config — simpan ke file .env (perlu restart server agar PORT baru aktif)
router.put('/', validate(updateSchema), (req, res) => {
  const { port, frontendUrl, publicUrl } = req.validated;

  const updates = {};
  if (port !== undefined) updates.PORT = String(port);
  if (frontendUrl !== undefined) updates.FRONTEND_URL = frontendUrl;
  if (publicUrl !== undefined) updates.PUBLIC_URL = publicUrl;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Tidak ada perubahan' });
  }

  let lines = [];
  try {
    lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
  } catch {
    lines = [];
  }

  const seen = new Set();
  const next = lines.map((line) => {
    const m = line.match(/^\s*([A-Z_]+)\s*=/);
    if (m && updates[m[1]] !== undefined) {
      seen.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) next.push(`${k}=${v}`);
  }
  fs.writeFileSync(ENV_PATH, next.join('\n'));

  const portChanged = updates.PORT !== undefined && updates.PORT !== String(process.env.PORT || '3000');

  res.json({
    ok: true,
    updated: updates,
    restartRequired: portChanged,
    message: portChanged
      ? `Port disimpan. Restart server (Ctrl+C lalu npm run dev) agar port ${updates.PORT} aktif.`
      : 'Konfigurasi disimpan.',
  });
});

export default router;
