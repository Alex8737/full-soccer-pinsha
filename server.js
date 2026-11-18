'use strict';
/**
 * FULL SOCCER – San Francisco de Pinsha
 * Servidor Express con capas de seguridad:
 *   Helmet (cabeceras + CSP) · JWT en cookie httpOnly · bcrypt · RBAC (admin/usuario)
 *   CSRF (double submit) · Rate limiting · Bloqueo de cuenta · Validación whitelist · Bitácora
 */
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./src/config');
const db = require('./src/db');
const { cargarUsuario } = require('./src/security/auth');
const { verificarCsrf } = require('./src/security/csrf');
const { apiLimiter } = require('./src/security/rateLimiters');

const app = express();
app.disable('x-powered-by');
// Detrás de un proxy (Render, Railway, Nginx) se confía en 1 salto para obtener la IP real del cliente
if (config.trustProxy) app.set('trust proxy', 1);

// 1) Cabeceras de seguridad HTTP
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProd ? [] : null
      }
    },
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' }
  })
);
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

// 2) Parseo seguro del cuerpo y cookies (límite de tamaño contra abuso)
app.use(express.json({ limit: '20kb', strict: true }));
app.use(cookieParser());

// 3) Identificar al usuario a partir del JWT (si existe)
app.use(cargarUsuario);

// 4) API: límite de peticiones + CSRF + sin caché
app.use('/api', apiLimiter, verificarCsrf, (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/public', require('./src/routes/public.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// 5) Panel de administración: el HTML solo se entrega a un admin autenticado
app.get(['/admin', '/admin.html'], (req, res) => {
  if (!req.user || req.user.rol !== 'admin') return res.redirect('/login.html?next=admin');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// 6) Archivos públicos (HTML, CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', index: 'index.html', maxAge: '1h' }));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// 7) Manejo de errores sin filtrar detalles internos
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande.' });
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

(async () => {
  db.load();
  await db.seed();
  app.listen(config.port, () => {
    console.log(`⚽ FULL SOCCER listo en http://localhost:${config.port}`);
    console.log(`   Panel admin: http://localhost:${config.port}/admin`);
  });
})();

module.exports = app;
