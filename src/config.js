'use strict';
const crypto = require('crypto');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32 || jwtSecret.startsWith('cambia_esta_clave')) {
  if (isProd) {
    console.error('[SEGURIDAD] JWT_SECRET falta o es débil. Configúralo en .env (mínimo 32 caracteres).');
    process.exit(1);
  }
  // En desarrollo se genera una clave aleatoria temporal (las sesiones se pierden al reiniciar).
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[SEGURIDAD] JWT_SECRET no configurado: se usa una clave temporal aleatoria (solo desarrollo).');
}

const PASS_EJEMPLO = 'Admin#Pinsha2026';
let adminPassword = process.env.ADMIN_PASSWORD || '';
if (isProd && adminPassword === PASS_EJEMPLO) {
  console.warn('[SEGURIDAD] ADMIN_PASSWORD es la de ejemplo (pública en GitHub): se ignora y se genera una aleatoria.');
  adminPassword = '';
}

module.exports = {
  isProd,
  trustProxy: (process.env.TRUST_PROXY || '').toLowerCase() === 'true' || !!process.env.RENDER,
  port: Number(process.env.PORT) || 3000,
  jwtSecret,
  jwtExpira: '2h',
  cookieToken: 'fs_token',
  cookieCsrf: 'fs_csrf',
  bcryptRounds: 12,
  maxIntentosLogin: 5,
  bloqueoMinutos: 15,
  admin: {
    nombre: process.env.ADMIN_NOMBRE || 'Administrador FULL SOCCER',
    email: (process.env.ADMIN_EMAIL || 'admin@fullsoccer.ec').toLowerCase(),
    password: adminPassword
  },
  seedDemo: (process.env.SEED_DEMO || 'true').toLowerCase() === 'true'
};
