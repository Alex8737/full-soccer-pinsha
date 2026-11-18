'use strict';
/**
 * Bitácora de auditoría: registra inicios de sesión, intentos fallidos y cambios del administrador.
 * Se conservan las últimas 2000 entradas.
 */
const db = require('../db');

const MAX = 2000;

function registrar(req, accion, detalle = '') {
  const entrada = {
    fecha: new Date().toISOString(),
    usuario: req.user ? req.user.email : 'anónimo',
    accion,
    detalle: String(detalle).slice(0, 300),
    ip: req.ip,
    agente: String(req.get('user-agent') || '').slice(0, 120)
  };
  db.data.bitacora.unshift(entrada);
  if (db.data.bitacora.length > MAX) db.data.bitacora.length = MAX;
  db.save();
}

module.exports = { registrar };
