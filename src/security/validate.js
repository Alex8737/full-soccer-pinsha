'use strict';
/**
 * Validación y saneamiento de entradas por lista blanca (whitelist).
 * Solo se aceptan los campos definidos en el esquema; todo lo demás se descarta.
 * Esto evita inyección de campos (p. ej. "rol":"admin"), prototype pollution y datos basura.
 */

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function limpiarTexto(v, multilinea) {
  let s = String(v).replace(CONTROL, '').normalize('NFC').trim();
  if (!multilinea) s = s.replace(/\s+/g, ' ');
  return s;
}

const reglas = {
  texto(v, r) {
    if (typeof v !== 'string' && typeof v !== 'number') return [null, 'debe ser texto'];
    const s = limpiarTexto(v, r.multilinea);
    if (r.min && s.length < r.min) return [null, `debe tener al menos ${r.min} caracteres`];
    if (r.max && s.length > r.max) return [null, `debe tener máximo ${r.max} caracteres`];
    if (r.patron && s && !r.patron.test(s)) return [null, r.mensaje || 'formato inválido'];
    return [s];
  },
  email(v) {
    if (typeof v !== 'string') return [null, 'debe ser un correo'];
    const s = v.trim().toLowerCase();
    if (!EMAIL.test(s) || s.length > 254) return [null, 'correo electrónico inválido'];
    return [s];
  },
  password(v) {
    if (typeof v !== 'string') return [null, 'contraseña inválida'];
    if (v.length < 8 || v.length > 72) return [null, 'debe tener entre 8 y 72 caracteres'];
    if (!/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v) || !/[^A-Za-z0-9]/.test(v)) {
      return [null, 'debe incluir mayúscula, minúscula, número y símbolo'];
    }
    return [v];
  },
  entero(v, r) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (!Number.isInteger(n)) return [null, 'debe ser un número entero'];
    if (r.min !== undefined && n < r.min) return [null, `debe ser mayor o igual a ${r.min}`];
    if (r.max !== undefined && n > r.max) return [null, `debe ser menor o igual a ${r.max}`];
    return [n];
  },
  bool(v) {
    if (typeof v === 'boolean') return [v];
    if (v === 'true' || v === 'false') return [v === 'true'];
    return [null, 'debe ser verdadero o falso'];
  },
  id(v) {
    if (typeof v !== 'string' || !UUID.test(v)) return [null, 'identificador inválido'];
    return [v.toLowerCase()];
  },
  fecha(v) {
    if (typeof v !== 'string' || !FECHA.test(v) || isNaN(Date.parse(v))) return [null, 'fecha inválida (AAAA-MM-DD)'];
    return [v];
  },
  hora(v) {
    if (typeof v !== 'string' || !HORA.test(v)) return [null, 'hora inválida (HH:MM)'];
    return [v];
  },
  enum(v, r) {
    if (!r.valores.includes(v)) return [null, 'valor no permitido'];
    return [v];
  }
};

/**
 * Middleware de validación del body.
 * @param {object} esquema  { campo: { tipo, requerido, ... } }
 * @param {object} opts     { parcial: true } para actualizaciones (campos opcionales)
 */
function validarBody(esquema, opts = {}) {
  return (req, res, next) => {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const datos = {};
    const errores = {};
    for (const [campo, regla] of Object.entries(esquema)) {
      const tieneClave = Object.prototype.hasOwnProperty.call(body, campo);
      const presente = tieneClave && body[campo] !== null && body[campo] !== '';
      if (!presente) {
        if (regla.requerido && (!opts.parcial || tieneClave)) errores[campo] = 'es obligatorio';
        else if (tieneClave) datos[campo] = regla.vacio !== undefined ? regla.vacio : '';
        continue;
      }
      const [valor, error] = reglas[regla.tipo](body[campo], regla);
      if (error) errores[campo] = error;
      else datos[campo] = valor;
    }
    if (Object.keys(errores).length) {
      return res.status(400).json({ error: 'Datos inválidos.', campos: errores });
    }
    req.valid = datos;
    next();
  };
}

function validarIdParam(nombre = 'id') {
  return (req, res, next) => {
    if (!UUID.test(req.params[nombre] || '')) return res.status(400).json({ error: 'Identificador inválido.' });
    next();
  };
}

module.exports = { validarBody, validarIdParam };
