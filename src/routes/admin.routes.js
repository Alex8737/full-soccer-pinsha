'use strict';
/**
 * API del administrador. TODAS las rutas exigen sesión con rol "admin" (RBAC)
 * y, al ser POST/PUT/DELETE, un token CSRF válido (aplicado en server.js).
 * Cada cambio queda registrado en la bitácora.
 */
const express = require('express');
const db = require('../db');
const { requireRole, usuarioPublico } = require('../security/auth');
const { validarBody, validarIdParam } = require('../security/validate');
const { registrar } = require('../security/audit');
const stats = require('../services/stats');

const router = express.Router();
router.use(requireRole('admin'));

const POSICIONES = ['Arquero', 'Defensa', 'Medio', 'Delantero'];
const ESTADOS = ['programado', 'jugado', 'suspendido'];

const buscar = (col, id) => db.data[col].find(x => x.id === id);
const noEncontrado = (res, que) => res.status(404).json({ error: `${que} no encontrado.` });
const idParam = validarIdParam('id');

// ───────────────────────── Resumen ─────────────────────────
router.get('/resumen', (req, res) => {
  const d = db.data;
  res.json({
    equipos: d.equipos.length,
    jugadores: d.jugadores.length,
    partidos: d.partidos.length,
    jugados: d.partidos.filter(p => p.estado === 'jugado').length,
    goles: d.goles.length,
    usuarios: d.usuarios.length,
    noticias: d.noticias.length,
    articulos: d.reglamento.length,
    ultimosEventos: d.bitacora.slice(0, 8)
  });
});

// ───────────────────────── Configuración ─────────────────────────
router.put(
  '/config',
  validarBody({
    nombreLiga: { tipo: 'texto', requerido: true, min: 2, max: 60 },
    lugar: { tipo: 'texto', requerido: true, min: 2, max: 80 },
    temporada: { tipo: 'texto', requerido: true, min: 2, max: 20 },
    descripcion: { tipo: 'texto', max: 500, multilinea: true },
    contacto: { tipo: 'texto', max: 120 }
  }),
  (req, res) => {
    Object.assign(db.data.config, req.valid);
    db.save();
    registrar(req, 'config', 'Actualizó la información de la liga');
    res.json(db.data.config);
  }
);

// ───────────────────────── Equipos ─────────────────────────
const esquemaEquipo = {
  nombre: { tipo: 'texto', requerido: true, min: 2, max: 60 },
  color: { tipo: 'texto', max: 30 },
  delegado: { tipo: 'texto', max: 80 }
};

function nombreEquipoDuplicado(nombre, exceptoId) {
  const n = nombre.toLowerCase();
  return db.data.equipos.some(e => e.id !== exceptoId && e.nombre.toLowerCase() === n);
}

router.post('/equipos', validarBody(esquemaEquipo), (req, res) => {
  if (nombreEquipoDuplicado(req.valid.nombre)) return res.status(409).json({ error: 'Ya existe un equipo con ese nombre.' });
  const e = { id: db.id(), nombre: req.valid.nombre, color: req.valid.color || '', delegado: req.valid.delegado || '', creado: new Date().toISOString() };
  db.data.equipos.push(e);
  db.save();
  registrar(req, 'equipo_crear', e.nombre);
  res.status(201).json(e);
});

router.put('/equipos/:id', idParam, validarBody(esquemaEquipo, { parcial: true }), (req, res) => {
  const e = buscar('equipos', req.params.id);
  if (!e) return noEncontrado(res, 'Equipo');
  if (req.valid.nombre && nombreEquipoDuplicado(req.valid.nombre, e.id)) return res.status(409).json({ error: 'Ya existe un equipo con ese nombre.' });
  Object.assign(e, req.valid);
  db.save();
  registrar(req, 'equipo_editar', e.nombre);
  res.json(e);
});

router.delete('/equipos/:id', idParam, (req, res) => {
  const e = buscar('equipos', req.params.id);
  if (!e) return noEncontrado(res, 'Equipo');
  if (db.data.partidos.some(p => p.localId === e.id || p.visitanteId === e.id)) {
    return res.status(409).json({ error: 'No se puede eliminar: el equipo tiene partidos registrados.' });
  }
  if (db.data.jugadores.some(j => j.equipoId === e.id)) {
    return res.status(409).json({ error: 'No se puede eliminar: primero elimina o mueve sus jugadores.' });
  }
  db.data.equipos = db.data.equipos.filter(x => x.id !== e.id);
  db.data.usuarios.forEach(u => { if (u.equipoFavoritoId === e.id) u.equipoFavoritoId = null; });
  db.save();
  registrar(req, 'equipo_eliminar', e.nombre);
  res.json({ ok: true });
});

// ───────────────────────── Jugadores ─────────────────────────
const esquemaJugador = {
  nombre: { tipo: 'texto', requerido: true, min: 3, max: 80, patron: /^[\p{L} .'-]+$/u, mensaje: 'solo letras y espacios' },
  numero: { tipo: 'entero', requerido: true, min: 0, max: 99 },
  posicion: { tipo: 'enum', requerido: true, valores: POSICIONES },
  equipoId: { tipo: 'id', requerido: true }
};

function validarJugador(datos, exceptoId) {
  if (!buscar('equipos', datos.equipoId)) return 'El equipo no existe.';
  if (db.data.jugadores.some(j => j.id !== exceptoId && j.equipoId === datos.equipoId && j.numero === datos.numero)) {
    return `El número ${datos.numero} ya está ocupado en ese equipo.`;
  }
  return null;
}

router.get('/jugadores', (req, res) => {
  res.json(db.data.jugadores.map(j => ({ ...j, equipo: stats.nombreEquipo(j.equipoId) })));
});

router.post('/jugadores', validarBody(esquemaJugador), (req, res) => {
  const err = validarJugador(req.valid);
  if (err) return res.status(400).json({ error: err });
  const j = { id: db.id(), ...req.valid };
  db.data.jugadores.push(j);
  db.save();
  registrar(req, 'jugador_crear', `${j.nombre} (#${j.numero})`);
  res.status(201).json(j);
});

router.put('/jugadores/:id', idParam, validarBody(esquemaJugador, { parcial: true }), (req, res) => {
  const j = buscar('jugadores', req.params.id);
  if (!j) return noEncontrado(res, 'Jugador');
  const nuevo = { ...j, ...req.valid };
  const err = validarJugador(nuevo, j.id);
  if (err) return res.status(400).json({ error: err });
  if (nuevo.equipoId !== j.equipoId && db.data.goles.some(g => g.jugadorId === j.id)) {
    return res.status(409).json({ error: 'No se puede cambiar de equipo a un jugador con goles registrados.' });
  }
  Object.assign(j, req.valid);
  db.save();
  registrar(req, 'jugador_editar', j.nombre);
  res.json(j);
});

router.delete('/jugadores/:id', idParam, (req, res) => {
  const j = buscar('jugadores', req.params.id);
  if (!j) return noEncontrado(res, 'Jugador');
  if (db.data.goles.some(g => g.jugadorId === j.id)) {
    return res.status(409).json({ error: 'No se puede eliminar: el jugador tiene goles registrados.' });
  }
  db.data.jugadores = db.data.jugadores.filter(x => x.id !== j.id);
  db.save();
  registrar(req, 'jugador_eliminar', j.nombre);
  res.json({ ok: true });
});

// ───────────────────────── Partidos ─────────────────────────
const esquemaPartido = {
  jornada: { tipo: 'entero', requerido: true, min: 1, max: 99 },
  fecha: { tipo: 'fecha', requerido: true },
  hora: { tipo: 'hora', requerido: true },
  cancha: { tipo: 'texto', max: 80 },
  localId: { tipo: 'id', requerido: true },
  visitanteId: { tipo: 'id', requerido: true },
  estado: { tipo: 'enum', requerido: true, valores: ESTADOS }
};

function validarPartido(p) {
  if (!buscar('equipos', p.localId) || !buscar('equipos', p.visitanteId)) return 'Equipo no encontrado.';
  if (p.localId === p.visitanteId) return 'Un equipo no puede jugar contra sí mismo.';
  return null;
}

router.post('/partidos', validarBody(esquemaPartido), (req, res) => {
  const err = validarPartido(req.valid);
  if (err) return res.status(400).json({ error: err });
  const p = { id: db.id(), cancha: '', ...req.valid };
  db.data.partidos.push(p);
  db.save();
  registrar(req, 'partido_crear', `J${p.jornada}: ${stats.nombreEquipo(p.localId)} vs ${stats.nombreEquipo(p.visitanteId)}`);
  res.status(201).json(stats.partidoDetallado(p));
});

router.put('/partidos/:id', idParam, validarBody(esquemaPartido, { parcial: true }), (req, res) => {
  const p = buscar('partidos', req.params.id);
  if (!p) return noEncontrado(res, 'Partido');
  const nuevo = { ...p, ...req.valid };
  const err = validarPartido(nuevo);
  if (err) return res.status(400).json({ error: err });
  const equipos = [nuevo.localId, nuevo.visitanteId];
  if (db.data.goles.some(g => g.partidoId === p.id && !equipos.includes(g.equipoId))) {
    return res.status(409).json({ error: 'Hay goles de un equipo que ya no está en el partido. Elimínalos primero.' });
  }
  Object.assign(p, req.valid);
  db.save();
  registrar(req, 'partido_editar', `J${p.jornada}: ${stats.nombreEquipo(p.localId)} vs ${stats.nombreEquipo(p.visitanteId)} (${p.estado})`);
  res.json(stats.partidoDetallado(p));
});

router.delete('/partidos/:id', idParam, (req, res) => {
  const p = buscar('partidos', req.params.id);
  if (!p) return noEncontrado(res, 'Partido');
  db.data.partidos = db.data.partidos.filter(x => x.id !== p.id);
  db.data.goles = db.data.goles.filter(g => g.partidoId !== p.id);
  db.save();
  registrar(req, 'partido_eliminar', `J${p.jornada}: ${stats.nombreEquipo(p.localId)} vs ${stats.nombreEquipo(p.visitanteId)}`);
  res.json({ ok: true });
});

// ───────────────────────── Goles ─────────────────────────
router.post(
  '/partidos/:id/goles',
  idParam,
  validarBody({
    jugadorId: { tipo: 'id', requerido: true },
    minuto: { tipo: 'entero', requerido: true, min: 0, max: 130 },
    autogol: { tipo: 'bool' }
  }),
  (req, res) => {
    const p = buscar('partidos', req.params.id);
    if (!p) return noEncontrado(res, 'Partido');
    const j = buscar('jugadores', req.valid.jugadorId);
    if (!j) return noEncontrado(res, 'Jugador');
    if (j.equipoId !== p.localId && j.equipoId !== p.visitanteId) {
      return res.status(400).json({ error: 'El jugador no pertenece a ninguno de los equipos del partido.' });
    }
    const g = { id: db.id(), partidoId: p.id, jugadorId: j.id, equipoId: j.equipoId, minuto: req.valid.minuto, autogol: !!req.valid.autogol };
    db.data.goles.push(g);
    db.save();
    registrar(req, 'gol_registrar', `${j.nombre} min ${g.minuto}${g.autogol ? ' (autogol)' : ''}`);
    res.status(201).json(stats.partidoDetallado(p));
  }
);

router.delete('/goles/:id', idParam, (req, res) => {
  const g = buscar('goles', req.params.id);
  if (!g) return noEncontrado(res, 'Gol');
  db.data.goles = db.data.goles.filter(x => x.id !== g.id);
  db.save();
  registrar(req, 'gol_eliminar', `Gol min ${g.minuto}`);
  const p = buscar('partidos', g.partidoId);
  res.json(p ? stats.partidoDetallado(p) : { ok: true });
});

// ───────────────────────── Reglamento ─────────────────────────
const esquemaArticulo = {
  orden: { tipo: 'entero', requerido: true, min: 1, max: 999 },
  titulo: { tipo: 'texto', requerido: true, min: 3, max: 120 },
  contenido: { tipo: 'texto', requerido: true, min: 1, max: 5000, multilinea: true }
};

router.post('/reglamento', validarBody(esquemaArticulo), (req, res) => {
  const a = { id: db.id(), ...req.valid };
  db.data.reglamento.push(a);
  db.save();
  registrar(req, 'reglamento_crear', a.titulo);
  res.status(201).json(a);
});

router.put('/reglamento/:id', idParam, validarBody(esquemaArticulo, { parcial: true }), (req, res) => {
  const a = buscar('reglamento', req.params.id);
  if (!a) return noEncontrado(res, 'Artículo');
  Object.assign(a, req.valid);
  db.save();
  registrar(req, 'reglamento_editar', a.titulo);
  res.json(a);
});

router.delete('/reglamento/:id', idParam, (req, res) => {
  const a = buscar('reglamento', req.params.id);
  if (!a) return noEncontrado(res, 'Artículo');
  db.data.reglamento = db.data.reglamento.filter(x => x.id !== a.id);
  db.save();
  registrar(req, 'reglamento_eliminar', a.titulo);
  res.json({ ok: true });
});

// ───────────────────────── Noticias ─────────────────────────
const esquemaNoticia = {
  titulo: { tipo: 'texto', requerido: true, min: 3, max: 120 },
  contenido: { tipo: 'texto', requerido: true, min: 1, max: 3000, multilinea: true }
};

router.post('/noticias', validarBody(esquemaNoticia), (req, res) => {
  const n = { id: db.id(), ...req.valid, fecha: new Date().toISOString() };
  db.data.noticias.push(n);
  db.save();
  registrar(req, 'noticia_crear', n.titulo);
  res.status(201).json(n);
});

router.put('/noticias/:id', idParam, validarBody(esquemaNoticia, { parcial: true }), (req, res) => {
  const n = buscar('noticias', req.params.id);
  if (!n) return noEncontrado(res, 'Noticia');
  Object.assign(n, req.valid);
  db.save();
  registrar(req, 'noticia_editar', n.titulo);
  res.json(n);
});

router.delete('/noticias/:id', idParam, (req, res) => {
  const n = buscar('noticias', req.params.id);
  if (!n) return noEncontrado(res, 'Noticia');
  db.data.noticias = db.data.noticias.filter(x => x.id !== n.id);
  db.save();
  registrar(req, 'noticia_eliminar', n.titulo);
  res.json({ ok: true });
});

// ───────────────────────── Usuarios ─────────────────────────
router.get('/usuarios', (req, res) => {
  const ahora = new Date();
  res.json(
    db.data.usuarios.map(u => ({
      ...usuarioPublico(u),
      ultimoAcceso: u.ultimoAcceso || null,
      bloqueado: !!(u.bloqueadoHasta && new Date(u.bloqueadoHasta) > ahora)
    }))
  );
});

router.put(
  '/usuarios/:id',
  idParam,
  validarBody({ rol: { tipo: 'enum', valores: ['admin', 'usuario'] }, activo: { tipo: 'bool' } }, { parcial: true }),
  (req, res) => {
    const u = buscar('usuarios', req.params.id);
    if (!u) return noEncontrado(res, 'Usuario');
    if (u.id === req.user.id) return res.status(400).json({ error: 'No puedes modificar tu propio rol o estado.' });
    Object.assign(u, req.valid);
    u.tokenVersion = (u.tokenVersion || 0) + 1; // obliga a iniciar sesión con los nuevos permisos
    db.save();
    registrar(req, 'usuario_editar', `${u.email} → rol ${u.rol}, ${u.activo ? 'activo' : 'desactivado'}`);
    res.json(usuarioPublico(u));
  }
);

router.post('/usuarios/:id/desbloquear', idParam, (req, res) => {
  const u = buscar('usuarios', req.params.id);
  if (!u) return noEncontrado(res, 'Usuario');
  u.bloqueadoHasta = null;
  u.intentosFallidos = 0;
  db.save();
  registrar(req, 'usuario_desbloquear', u.email);
  res.json({ ok: true });
});

router.delete('/usuarios/:id', idParam, (req, res) => {
  const u = buscar('usuarios', req.params.id);
  if (!u) return noEncontrado(res, 'Usuario');
  if (u.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  db.data.usuarios = db.data.usuarios.filter(x => x.id !== u.id);
  db.save();
  registrar(req, 'usuario_eliminar', u.email);
  res.json({ ok: true });
});

// ───────────────────────── Bitácora ─────────────────────────
router.get('/bitacora', (req, res) => {
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 200, 1), 2000);
  res.json(db.data.bitacora.slice(0, limite));
});

module.exports = router;
