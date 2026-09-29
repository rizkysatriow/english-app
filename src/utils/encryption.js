import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-secret-change-in-production-32chars!!';

export function encrypt(text) {
  if (!text) return null;
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext) {
  if (!ciphertext) return null;
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function hashPassword(password) {
  return CryptoJS.SHA256(password + ENCRYPTION_KEY).toString();
}

export function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}