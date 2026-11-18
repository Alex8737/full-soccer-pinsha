'use strict';
/**
 * API pública de solo lectura (GET). Cualquier visitante o usuario puede consultarla.
 * Nunca expone datos de usuarios ni de la bitácora.
 */
const express = require('express');
const db = require('../db');
const stats = require('../services/stats');

const router = express.Router();

const porFecha = (a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || ''));

router.get('/info', (req, res) => {
  const d = db.data;
  res.json({
    ...d.config,
    totales: {
      equipos: d.equipos.length,
      jugadores: d.jugadores.length,
      partidosJugados: d.partidos.filter(p => p.estado === 'jugado').length,
      goles: d.goles.filter(g => d.partidos.some(p => p.id === g.partidoId && p.estado === 'jugado')).length
    }
  });
});

router.get('/equipos', (req, res) => {
  const equipos = db.data.equipos
    .map(e => ({
      ...e,
      jugadores: db.data.jugadores
        .filter(j => j.equipoId === e.id)
        .sort((a, b) => a.numero - b.numero)
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json(equipos);
});

router.get('/partidos', (req, res) => {
  res.json(db.data.partidos.slice().sort(porFecha).map(stats.partidoDetallado));
});

router.get('/posiciones', (req, res) => {
  res.json(stats.posiciones());
});

router.get('/goleadores', (req, res) => {
  res.json(stats.goleadores());
});

router.get('/reglamento', (req, res) => {
  res.json(db.data.reglamento.slice().sort((a, b) => a.orden - b.orden));
});

router.get('/noticias', (req, res) => {
  res.json(db.data.noticias.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)));
});

module.exports = router;
