'use strict';
/**
 * Cálculos deportivos: marcador de cada partido, tabla de posiciones y tabla de goleadores.
 * El marcador se calcula a partir de los goles registrados (un autogol suma al rival).
 */
const db = require('../db');

function marcador(partido) {
  let local = 0;
  let visitante = 0;
  for (const g of db.data.goles) {
    if (g.partidoId !== partido.id) continue;
    const paraLocal = g.autogol ? g.equipoId === partido.visitanteId : g.equipoId === partido.localId;
    if (paraLocal) local++;
    else visitante++;
  }
  return { local, visitante };
}

function nombreEquipo(id) {
  const e = db.data.equipos.find(x => x.id === id);
  return e ? e.nombre : '(equipo eliminado)';
}

function partidoDetallado(p) {
  const jugado = p.estado === 'jugado';
  const m = jugado ? marcador(p) : { local: null, visitante: null };
  const goles = db.data.goles
    .filter(g => g.partidoId === p.id)
    .sort((a, b) => a.minuto - b.minuto)
    .map(g => {
      const j = db.data.jugadores.find(x => x.id === g.jugadorId);
      return {
        id: g.id,
        minuto: g.minuto,
        autogol: !!g.autogol,
        jugadorId: g.jugadorId,
        jugador: j ? j.nombre : '(jugador eliminado)',
        equipoId: g.equipoId,
        equipo: nombreEquipo(g.equipoId)
      };
    });
  return {
    ...p,
    local: nombreEquipo(p.localId),
    visitante: nombreEquipo(p.visitanteId),
    golesLocal: m.local,
    golesVisitante: m.visitante,
    goles
  };
}

function posiciones() {
  const tabla = new Map(
    db.data.equipos.map(e => [e.id, { equipoId: e.id, equipo: e.nombre, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 }])
  );
  for (const p of db.data.partidos) {
    if (p.estado !== 'jugado') continue;
    const L = tabla.get(p.localId);
    const V = tabla.get(p.visitanteId);
    if (!L || !V) continue;
    const m = marcador(p);
    L.pj++; V.pj++;
    L.gf += m.local; L.gc += m.visitante;
    V.gf += m.visitante; V.gc += m.local;
    if (m.local > m.visitante) { L.pg++; V.pp++; L.pts += 3; }
    else if (m.local < m.visitante) { V.pg++; L.pp++; V.pts += 3; }
    else { L.pe++; V.pe++; L.pts++; V.pts++; }
  }
  const filas = [...tabla.values()].map(f => ({ ...f, dg: f.gf - f.gc }));
  filas.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.equipo.localeCompare(b.equipo));
  return filas.map((f, i) => ({ pos: i + 1, ...f }));
}

function goleadores() {
  const conteo = new Map();
  const jugadosIds = new Set(db.data.partidos.filter(p => p.estado === 'jugado').map(p => p.id));
  for (const g of db.data.goles) {
    if (g.autogol || !jugadosIds.has(g.partidoId)) continue;
    conteo.set(g.jugadorId, (conteo.get(g.jugadorId) || 0) + 1);
  }
  const filas = [...conteo.entries()].map(([jugadorId, goles]) => {
    const j = db.data.jugadores.find(x => x.id === jugadorId);
    return {
      jugadorId,
      jugador: j ? j.nombre : '(jugador eliminado)',
      numero: j ? j.numero : null,
      equipo: j ? nombreEquipo(j.equipoId) : '-',
      goles
    };
  });
  filas.sort((a, b) => b.goles - a.goles || a.jugador.localeCompare(b.jugador));
  return filas.map((f, i) => ({ pos: i + 1, ...f }));
}

module.exports = { marcador, partidoDetallado, posiciones, goleadores, nombreEquipo };
