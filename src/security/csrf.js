'use strict';
/**
 * Protección CSRF con el patrón "double submit cookie":
 * 1. El servidor entrega un token aleatorio en la cookie fs_csrf (legible por JS, SameSite=Strict).
 * 2. El frontend lo reenvía en la cabecera X-CSRF-Token en cada POST/PUT/PATCH/DELETE.
 * 3. El servidor compara ambos valores en tiempo constante.
 * Un sitio atacante no puede leer la cookie, así que no puede fabricar la cabecera.
 * Además se valida la cabecera Origin cuando el navegador la envía.
 */
const crypto = require('crypto');
const config = require('../config');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function emitirCsrf(req, res) {
  let token = req.cookies && req.cookies[config.cookieCsrf];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(config.cookieCsrf, token, {
      httpOnly: false,
      secure: config.isProd,
      sameSite: 'strict',
      path: '/'
    });
  }
  return token;
}

function iguales(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function verificarCsrf(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = null; }
    if (host !== req.get('host')) {
      return res.status(403).json({ error: 'Origen de la petición no permitido.' });
    }
  }

  const cookie = req.cookies && req.cookies[config.cookieCsrf];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !iguales(cookie, header)) {
    return res.status(403).json({ error: 'Token CSRF inválido. Recarga la página.' });
  }
  next();
}

module.exports = { emitirCsrf, verificarCsrf };
