'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { abrirSesion, cerrarSesion, requireAuth, usuarioPublico } = require('../security/auth');
const { emitirCsrf } = require('../security/csrf');
const { loginLimiter, registroLimiter } = require('../security/rateLimiters');
const { validarBody } = require('../security/validate');
const { registrar } = require('../security/audit');

const router = express.Router();

// Hash ficticio para que el tiempo de respuesta sea igual exista o no el usuario (evita enumeración).
const HASH_FICTICIO = bcrypt.hashSync('NoExiste#2026', 10);
const MSG_LOGIN = 'Correo o contraseña incorrectos.';

router.get('/csrf', (req, res) => {
  res.json({ csrfToken: emitirCsrf(req, res) });
});

router.get('/me', (req, res) => {
  res.json({ usuario: usuarioPublico(req.user) });
});

router.post(
  '/registro',
  registroLimiter,
  validarBody({
    nombre: { tipo: 'texto', requerido: true, min: 3, max: 80, patron: /^[\p{L} .'-]+$/u, mensaje: 'solo letras y espacios' },
    email: { tipo: 'email', requerido: true },
    password: { tipo: 'password', requerido: true }
  }),
  async (req, res) => {
    const { nombre, email, password } = req.valid;
    if (db.data.usuarios.some(u => u.email === email)) {
      return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    }
    const usuario = {
      id: db.id(),
      nombre,
      email,
      passwordHash: await bcrypt.hash(password, config.bcryptRounds),
      rol: 'usuario', // El rol SIEMPRE lo asigna el servidor, nunca el cliente.
      activo: true,
      intentosFallidos: 0,
      bloqueadoHasta: null,
      tokenVersion: 0,
      equipoFavoritoId: null,
      creado: new Date().toISOString()
    };
    db.data.usuarios.push(usuario);
    db.save();
    req.user = usuario;
    registrar(req, 'registro', `Nuevo usuario ${email}`);
    abrirSesion(res, usuario);
    res.status(201).json({ usuario: usuarioPublico(usuario) });
  }
);

router.post(
  '/login',
  loginLimiter,
  validarBody({
    email: { tipo: 'email', requerido: true },
    password: { tipo: 'texto', requerido: true, max: 72 }
  }),
  async (req, res) => {
    const { email } = req.valid;
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const u = db.data.usuarios.find(x => x.email === email);

    if (!u) {
      await bcrypt.compare(password, HASH_FICTICIO);
      registrar(req, 'login_fallido', `Correo no registrado: ${email}`);
      return res.status(401).json({ error: MSG_LOGIN });
    }

    if (u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date()) {
      const min = Math.ceil((new Date(u.bloqueadoHasta) - new Date()) / 60000);
      registrar(req, 'login_bloqueado', `Intento sobre cuenta bloqueada: ${email}`);
      return res.status(423).json({ error: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta en ${min} min.` });
    }

    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) {
      u.intentosFallidos = (u.intentosFallidos || 0) + 1;
      let detalle = `Contraseña incorrecta (${u.intentosFallidos}/${config.maxIntentosLogin}) para ${email}`;
      if (u.intentosFallidos >= config.maxIntentosLogin) {
        u.bloqueadoHasta = new Date(Date.now() + config.bloqueoMinutos * 60000).toISOString();
        u.intentosFallidos = 0;
        detalle += ' → cuenta bloqueada';
      }
      db.save();
      registrar(req, 'login_fallido', detalle);
      return res.status(401).json({ error: MSG_LOGIN });
    }

    if (!u.activo) {
      registrar(req, 'login_rechazado', `Cuenta desactivada: ${email}`);
      return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
    }

    u.intentosFallidos = 0;
    u.bloqueadoHasta = null;
    u.ultimoAcceso = new Date().toISOString();
    db.save();
    req.user = u;
    registrar(req, 'login', `Inicio de sesión (${u.rol})`);
    abrirSesion(res, u);
    res.json({ usuario: usuarioPublico(u) });
  }
);

router.post('/logout', (req, res) => {
  if (req.user) {
    // Revoca todos los tokens emitidos para este usuario
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
    db.save();
    registrar(req, 'logout', 'Cierre de sesión');
  }
  cerrarSesion(res);
  res.json({ ok: true });
});

router.put(
  '/password',
  requireAuth,
  validarBody({
    actual: { tipo: 'texto', requerido: true, max: 72 },
    nueva: { tipo: 'password', requerido: true }
  }),
  async (req, res) => {
    const actual = typeof req.body.actual === 'string' ? req.body.actual : '';
    if (!(await bcrypt.compare(actual, req.user.passwordHash))) {
      registrar(req, 'cambio_clave_fallido', 'Contraseña actual incorrecta');
      return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    }
    req.user.passwordHash = await bcrypt.hash(req.valid.nueva, config.bcryptRounds);
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1; // cierra otras sesiones
    db.save();
    registrar(req, 'cambio_clave', 'Contraseña actualizada');
    abrirSesion(res, req.user);
    res.json({ ok: true });
  }
);

router.put(
  '/favorito',
  requireAuth,
  validarBody({ equipoId: { tipo: 'id', vacio: null } }),
  (req, res) => {
    const equipoId = req.valid.equipoId || null;
    if (equipoId && !db.data.equipos.some(e => e.id === equipoId)) {
      return res.status(404).json({ error: 'Equipo no encontrado.' });
    }
    req.user.equipoFavoritoId = equipoId;
    db.save();
    res.json({ usuario: usuarioPublico(req.user) });
  }
);

module.exports = router;
