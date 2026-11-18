'use strict';
/**
 * Autenticación con JWT (HS256) guardado en cookie httpOnly + control de acceso por roles (RBAC).
 * - httpOnly: el JavaScript del navegador no puede leer el token (mitiga robo por XSS).
 * - SameSite=Strict: el navegador no envía la cookie en peticiones de otros sitios (mitiga CSRF).
 * - Secure (en producción): la cookie solo viaja por HTTPS.
 * - tokenVersion: permite revocar todas las sesiones de un usuario (logout, cambio de clave, desactivación).
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

const JWT_OPTS = { algorithm: 'HS256', issuer: 'full-soccer', audience: 'full-soccer-web' };

function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, rol: usuario.rol, tv: usuario.tokenVersion || 0 },
    config.jwtSecret,
    { ...JWT_OPTS, expiresIn: config.jwtExpira }
  );
}

function opcionesCookie() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000
  };
}

function abrirSesion(res, usuario) {
  res.cookie(config.cookieToken, firmarToken(usuario), opcionesCookie());
}

function cerrarSesion(res) {
  const { maxAge, ...opts } = opcionesCookie();
  res.clearCookie(config.cookieToken, opts);
}

/** Lee la cookie (si existe), valida el JWT y carga el usuario en req.user. No bloquea. */
function cargarUsuario(req, res, next) {
  req.user = null;
  const token = req.cookies && req.cookies[config.cookieToken];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret, { ...JWT_OPTS, algorithms: ['HS256'] });
    const u = db.data.usuarios.find(x => x.id === payload.sub);
    if (u && u.activo && (u.tokenVersion || 0) === payload.tv && u.rol === payload.rol) {
      req.user = u;
    } else {
      cerrarSesion(res);
    }
  } catch (e) {
    // Token expirado, alterado o firmado con otra clave
    cerrarSesion(res);
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
    }
    next();
  };
}

/** Devuelve solo los campos seguros del usuario (nunca el hash ni datos internos). */
function usuarioPublico(u) {
  if (!u) return null;
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    activo: u.activo,
    equipoFavoritoId: u.equipoFavoritoId || null,
    creado: u.creado
  };
}

module.exports = { abrirSesion, cerrarSesion, cargarUsuario, requireAuth, requireRole, usuarioPublico };
