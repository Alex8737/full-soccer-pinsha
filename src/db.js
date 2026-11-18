'use strict';
/**
 * Almacenamiento en un archivo JSON (data/db.json).
 * - Escritura atómica (archivo temporal + rename) para no corromper datos.
 * - Los IDs se generan con crypto.randomUUID() (no predecibles).
 * Para producción se puede migrar a MySQL/PostgreSQL manteniendo la misma API.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('./config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const VACIO = () => ({
  config: {
    nombreLiga: 'FULL SOCCER',
    lugar: 'San Francisco de Pinsha',
    temporada: String(new Date().getFullYear()),
    descripcion: 'Liga deportiva comunitaria de fútbol de San Francisco de Pinsha.',
    contacto: ''
  },
  usuarios: [],
  equipos: [],
  jugadores: [],
  partidos: [],
  goles: [],
  reglamento: [],
  noticias: [],
  bitacora: []
});

const db = {
  data: null,

  id() {
    return crypto.randomUUID();
  },

  load() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      this.data = Object.assign(VACIO(), JSON.parse(raw));
    } else {
      this.data = VACIO();
    }
    return this;
  },

  save() {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, DB_FILE);
  },

  async seed() {
    const d = this.data;
    if (!d.usuarios.some(u => u.rol === 'admin')) {
      let pass = config.admin.password;
      let generada = false;
      if (!pass) {
        pass = crypto.randomBytes(9).toString('base64url') + 'A1#';
        generada = true;
      }
      d.usuarios.push({
        id: this.id(),
        nombre: config.admin.nombre,
        email: config.admin.email,
        passwordHash: await bcrypt.hash(pass, config.bcryptRounds),
        rol: 'admin',
        activo: true,
        intentosFallidos: 0,
        bloqueadoHasta: null,
        tokenVersion: 0,
        equipoFavoritoId: null,
        creado: new Date().toISOString()
      });
      console.log('──────────────────────────────────────────────');
      console.log(' Cuenta de administrador creada');
      console.log('  Email:      ' + config.admin.email);
      if (generada) console.log('  Contraseña: ' + pass + '   (guárdala y cámbiala)');
      else console.log('  Contraseña: la definida en ADMIN_PASSWORD (.env)');
      console.log('──────────────────────────────────────────────');
    }
    if (config.seedDemo && d.equipos.length === 0) seedDemo(this);
    this.save();
  }
};

function seedDemo(db) {
  const d = db.data;
  const equipos = [
    ['Deportivo Pinsha', 'Verde'],
    ['Atlético San Francisco', 'Rojo'],
    ['Unión Juvenil', 'Azul'],
    ['Halcones FC', 'Negro'],
    ['Real Comunidad', 'Blanco'],
    ['Leones del Barrio', 'Amarillo']
  ].map(([nombre, color]) => ({ id: db.id(), nombre, color, delegado: '', creado: new Date().toISOString() }));
  d.equipos.push(...equipos);

  const nombres = ['Carlos', 'Luis', 'Andrés', 'Diego', 'Jorge', 'Mateo', 'Kevin', 'Bryan', 'Santiago', 'Pablo', 'Javier', 'Fernando'];
  const apellidos = ['Quishpe', 'Guamán', 'Tipán', 'Andrango', 'Simbaña', 'Pilataxi', 'Farinango', 'Cuascota', 'Chicaiza', 'Tituaña', 'Morales', 'Paucar'];
  let k = 0;
  for (const e of equipos) {
    for (let n = 1; n <= 6; n++) {
      d.jugadores.push({
        id: db.id(),
        nombre: `${nombres[k % 12]} ${apellidos[(k + Math.floor(k / 12) * 5) % 12]}`,
        numero: n * 2 + 1,
        posicion: ['Arquero', 'Defensa', 'Defensa', 'Medio', 'Medio', 'Delantero'][n - 1],
        equipoId: e.id
      });
      k++;
    }
  }

  // Calendario de ejemplo: 3 jornadas jugadas + 1 programada
  const hoy = new Date();
  const fecha = dias => {
    const f = new Date(hoy);
    f.setDate(f.getDate() + dias);
    return f.toISOString().slice(0, 10);
  };
  const cruces = [
    [[0, 1], [2, 3], [4, 5]],
    [[0, 2], [1, 4], [3, 5]],
    [[0, 3], [1, 5], [2, 4]],
    [[0, 4], [1, 2], [3, 5]]
  ];
  const resultados = [
    [[2, 1], [0, 0], [3, 2]],
    [[1, 1], [2, 0], [1, 3]],
    [[4, 0], [1, 2], [2, 2]]
  ];
  cruces.forEach((jornada, j) => {
    jornada.forEach(([a, b], i) => {
      const jugado = j < 3;
      const p = {
        id: db.id(),
        jornada: j + 1,
        fecha: fecha(-21 + j * 7),
        hora: ['09:00', '11:00', '13:00'][i],
        cancha: 'Cancha comunal de Pinsha',
        localId: equipos[a].id,
        visitanteId: equipos[b].id,
        estado: jugado ? 'jugado' : 'programado'
      };
      if (!jugado) p.fecha = fecha(3);
      d.partidos.push(p);
      if (jugado) {
        const [gl, gv] = resultados[j][i];
        const anotar = (equipo, cant, desfase) => {
          const plantel = d.jugadores.filter(x => x.equipoId === equipo.id && x.posicion !== 'Arquero');
          for (let g = 0; g < cant; g++) {
            const jug = plantel[(g * 3 + j + i) % plantel.length];
            d.goles.push({ id: db.id(), partidoId: p.id, jugadorId: jug.id, equipoId: equipo.id, minuto: 3 + ((g * 23 + j * 11 + i * 7 + desfase) % 87), autogol: false });
          }
        };
        anotar(equipos[a], gl, 0);
        anotar(equipos[b], gv, 13);
      }
    });
  });

  d.reglamento.push(
    { id: db.id(), orden: 1, titulo: 'Art. 1 – De la organización', contenido: 'El campeonato FULL SOCCER es organizado por la directiva de la liga comunitaria de San Francisco de Pinsha. Sus resoluciones son de cumplimiento obligatorio para todos los equipos inscritos.' },
    { id: db.id(), orden: 2, titulo: 'Art. 2 – De la inscripción', contenido: 'Cada equipo podrá inscribir un máximo de 20 jugadores. Todo jugador debe presentar su cédula de identidad al momento del encuentro.' },
    { id: db.id(), orden: 3, titulo: 'Art. 3 – Del sistema de puntuación', contenido: 'Partido ganado: 3 puntos.\nPartido empatado: 1 punto.\nPartido perdido: 0 puntos.\nEn caso de igualdad se define por diferencia de goles y luego por goles a favor.' },
    { id: db.id(), orden: 4, titulo: 'Art. 4 – De las sanciones', contenido: 'La acumulación de tres tarjetas amarillas implica un partido de suspensión. Una tarjeta roja directa implica la suspensión mínima de un partido, sujeta a revisión de la comisión disciplinaria.' }
  );

  d.noticias.push(
    { id: db.id(), titulo: '¡Arranca el campeonato FULL SOCCER!', contenido: 'Damos la bienvenida a todos los equipos participantes de esta temporada. Revisa el calendario de partidos y la tabla de posiciones actualizada cada jornada.', fecha: new Date().toISOString() },
    { id: db.id(), titulo: 'Inscripciones abiertas', contenido: 'Los delegados pueden acercarse a la directiva para inscribir nuevos jugadores hasta la jornada 5.', fecha: new Date(Date.now() - 86400000 * 3).toISOString() }
  );
}

module.exports = db;
