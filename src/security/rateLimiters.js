'use strict';
/**
 * Limitación de peticiones (express-rate-limit) contra fuerza bruta y abuso de la API.
 */
const rateLimit = require('express-rate-limit');

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false
};

// Límite general para toda la API
const apiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 500,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en unos minutos.' }
});

// Inicio de sesión: 10 intentos por IP cada 15 minutos
const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' }
});

// Registro: 5 cuentas por IP cada hora
const registroLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { error: 'Demasiados registros desde esta red. Intenta más tarde.' }
});

module.exports = { apiLimiter, loginLimiter, registroLimiter };
