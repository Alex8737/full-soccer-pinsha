'use strict';
(() => {
  const { api, el, limpiar, toast, fecha } = FS;
  const $ = id => document.getElementById(id);
  const SECCIONES = ['inicio', 'posiciones', 'partidos', 'goleadores', 'equipos', 'reglamento', 'mi-panel'];

  const estado = { usuario: null, info: null, partidos: [], posiciones: [], goleadores: [], equipos: [], reglamento: [], noticias: [] };

  // ─────────── Componentes ───────────
  function tarjetaPartido(p) {
    const jugado = p.estado === 'jugado';
    const marcador = jugado
      ? el('div', { class: 'marcador' }, `${p.golesLocal} - ${p.golesVisitante}`)
      : el('div', { class: 'marcador pend' }, p.estado === 'suspendido' ? 'SUSP.' : p.hora);
    const goles = jugado && p.goles.length
      ? el('div', { class: 'goles-lista' }, p.goles.map(g =>
          el('span', { class: g.autogol ? 'chip ag' : 'chip' }, `⚽ ${g.jugador} ${g.minuto}'${g.autogol ? ' (AG)' : ''}`)))
      : null;
    return el('div', { class: 'partido' },
      el('div', { class: 'eq local' }, p.local),
      marcador,
      el('div', { class: 'eq' }, p.visitante),
      el('div', { class: 'meta' },
        el('span', null, `Jornada ${p.jornada}`),
        el('span', null, `📅 ${fecha(p.fecha)} · ${p.hora}`),
        p.cancha ? el('span', null, `📍 ${p.cancha}`) : null,
        el('span', { class: `estado ${p.estado}` }, p.estado)
      ),
      goles
    );
  }

  function tabla(columnas, filas, claseFila) {
    if (!filas.length) return el('p', { class: 'vacio' }, 'Aún no hay datos.');
    return el('div', { class: 'tabla-wrap' },
      el('table', null,
        el('thead', null, el('tr', null, columnas.map(c => el('th', { class: c.num ? 'num' : null }, c.t)))),
        el('tbody', null, filas.map(f =>
          el('tr', { class: claseFila ? claseFila(f) : null },
            columnas.map(c => el('td', { class: [c.num ? 'num' : '', c.cls || ''].join(' ').trim() || null }, c.v(f))))))
      )
    );
  }

  const colsPosiciones = [
    { t: '#', v: f => f.pos, num: true },
    { t: 'Equipo', v: f => f.equipo },
    { t: 'PJ', v: f => f.pj, num: true },
    { t: 'PG', v: f => f.pg, num: true },
    { t: 'PE', v: f => f.pe, num: true },
    { t: 'PP', v: f => f.pp, num: true },
    { t: 'GF', v: f => f.gf, num: true },
    { t: 'GC', v: f => f.gc, num: true },
    { t: 'DG', v: f => (f.dg > 0 ? '+' : '') + f.dg, num: true },
    { t: 'PTS', v: f => f.pts, num: true, cls: 'pts' }
  ];
  const colsGoleadores = [
    { t: '#', v: f => f.pos, num: true },
    { t: 'Jugador', v: f => f.jugador },
    { t: 'Equipo', v: f => f.equipo },
    { t: 'Goles', v: f => f.goles, num: true, cls: 'pts' }
  ];
  const claseTop = f => (f.pos <= 3 ? `top${f.pos}` : null);

  // ─────────── Render de secciones ───────────
  function renderInicio() {
    const i = estado.info;
    if (i) {
      $('nombre-liga').textContent = i.nombreLiga;
      $('lugar').textContent = i.lugar;
      $('lugar-header').textContent = i.lugar;
      $('descripcion').textContent = i.descripcion || '';
      $('temporada').textContent = `Temporada ${i.temporada}`;
      $('st-equipos').textContent = i.totales.equipos;
      $('st-jugadores').textContent = i.totales.jugadores;
      $('st-partidos').textContent = i.totales.partidosJugados;
      $('st-goles').textContent = i.totales.goles;
      $('pie').textContent = `${i.nombreLiga} · ${i.lugar}${i.contacto ? ' · ' + i.contacto : ''}`;
      document.title = `${i.nombreLiga} | ${i.lugar}`;
    }
    const prox = estado.partidos.filter(p => p.estado === 'programado').slice(0, 4);
    const ult = estado.partidos.filter(p => p.estado === 'jugado').slice(-4).reverse();
    limpiar($('proximos')).append(...(prox.length ? prox.map(tarjetaPartido) : [el('p', { class: 'vacio' }, 'No hay partidos programados.')]));
    limpiar($('ultimos')).append(...(ult.length ? ult.map(tarjetaPartido) : [el('p', { class: 'vacio' }, 'Aún no hay resultados.')]));
    limpiar($('top-posiciones')).append(tabla(colsPosiciones.filter(c => ['#', 'Equipo', 'PJ', 'DG', 'PTS'].includes(c.t)), estado.posiciones.slice(0, 5), claseTop));
    limpiar($('top-goleadores')).append(tabla(colsGoleadores, estado.goleadores.slice(0, 5), claseTop));

    const cont = limpiar($('noticias'));
    if (!estado.noticias.length) cont.append(el('p', { class: 'vacio' }, 'Sin noticias por ahora.'));
    estado.noticias.forEach(n => cont.append(
      el('article', { class: 'tarjeta noticia' },
        el('time', { datetime: n.fecha }, fecha(n.fecha)),
        el('h3', null, n.titulo),
        el('p', null, n.contenido))));
  }

  function renderPosiciones() {
    limpiar($('tabla-posiciones')).append(tabla(colsPosiciones, estado.posiciones, claseTop));
  }

  function renderPartidos() {
    const fe = $('filtro-equipo').value;
    const fs = $('filtro-estado').value;
    const lista = estado.partidos.filter(p => (!fe || p.localId === fe || p.visitanteId === fe) && (!fs || p.estado === fs));
    const cont = limpiar($('lista-partidos'));
    if (!lista.length) return cont.append(el('p', { class: 'vacio' }, 'No hay partidos con esos filtros.'));
    const jornadas = [...new Set(lista.map(p => p.jornada))].sort((a, b) => a - b);
    for (const j of jornadas) {
      cont.append(el('h3', { class: 'jornada-titulo' }, `Jornada ${j}`));
      lista.filter(p => p.jornada === j).forEach(p => cont.append(tarjetaPartido(p)));
    }
  }

  function renderGoleadores() {
    const podio = limpiar($('podio'));
    const medallas = ['🥇', '🥈', '🥉'];
    estado.goleadores.slice(0, 3).forEach((g, i) => podio.append(
      el('div', { class: 'tarjeta' },
        el('div', { class: 'bal' }, medallas[i]),
        el('b', null, g.goles),
        el('div', null, el('strong', null, g.jugador)),
        el('div', { class: 'muted' }, g.equipo))));
    limpiar($('tabla-goleadores')).append(tabla(colsGoleadores, estado.goleadores, claseTop));
  }

  function renderEquipos() {
    const cont = limpiar($('lista-equipos'));
    if (!estado.equipos.length) return cont.append(el('p', { class: 'vacio' }, 'Aún no hay equipos registrados.'));
    estado.equipos.forEach(e => {
      const pos = estado.posiciones.find(p => p.equipoId === e.id);
      cont.append(el('div', { class: 'tarjeta equipo' },
        el('h3', null, e.nombre),
        el('div', { class: 'muted' },
          [e.color ? `Color: ${e.color}` : null, e.delegado ? `Delegado: ${e.delegado}` : null, pos ? `Posición: ${pos.pos}° (${pos.pts} pts)` : null].filter(Boolean).join(' · ')),
        el('ul', null, e.jugadores.length
          ? e.jugadores.map(j => el('li', null, el('span', { class: 'n' }, j.numero), el('span', null, j.nombre), el('span', { class: 'p' }, j.posicion)))
          : el('li', { class: 'muted' }, 'Sin jugadores registrados'))));
    });
  }

  function renderReglamento() {
    const cont = limpiar($('lista-reglamento'));
    if (!estado.reglamento.length) return cont.append(el('p', { class: 'vacio' }, 'El reglamento aún no ha sido publicado.'));
    estado.reglamento.forEach(a => cont.append(
      el('article', { class: 'tarjeta articulo' }, el('h3', null, a.titulo), el('p', null, a.contenido))));
  }

  function renderMiPanel() {
    if (!estado.usuario) return;
    const sel = $('fav-equipo');
    sel.value = estado.usuario.equipoFavoritoId || '';
    const id = sel.value;
    const res = limpiar($('fav-resumen'));
    const par = limpiar($('fav-partidos'));
    if (!id) return res.append(el('p', { class: 'muted' }, 'Selecciona un equipo para ver su resumen.'));
    const pos = estado.posiciones.find(p => p.equipoId === id);
    if (pos) res.append(el('p', null, el('strong', null, `${pos.pos}° lugar`), ` · ${pos.pts} pts · ${pos.pg}G ${pos.pe}E ${pos.pp}P · DG ${pos.dg}`));
    const proximos = estado.partidos.filter(p => p.estado === 'programado' && (p.localId === id || p.visitanteId === id));
    par.append(el('h4', null, 'Próximos partidos de tu equipo'));
    if (!proximos.length) par.append(el('p', { class: 'muted' }, 'No tiene partidos programados.'));
    proximos.forEach(p => par.append(tarjetaPartido(p)));
  }

  // ─────────── Navegación por hash ───────────
  function mostrar() {
    let sec = location.hash.replace('#', '') || 'inicio';
    if (!SECCIONES.includes(sec) || (sec === 'mi-panel' && !estado.usuario)) sec = 'inicio';
    SECCIONES.forEach(s => { $('sec-' + s).hidden = s !== sec; });
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('activo', a.dataset.sec === sec));
    $('nav').classList.remove('abierto');
    window.scrollTo({ top: 0 });
  }

  function renderCuenta() {
    const c = limpiar($('cuenta'));
    const u = estado.usuario;
    $('nav-mipanel').hidden = !u;
    if (!u) {
      c.append(el('a', { class: 'btn btn-sm', href: '/registro.html' }, 'Registrarse'), el('a', { class: 'btn btn-sm btn-primario', href: '/login.html' }, 'Ingresar'));
      return;
    }
    c.append(el('span', { class: 'muted' }, `Hola, ${u.nombre.split(' ')[0]}`));
    if (u.rol === 'admin') c.append(el('a', { class: 'btn btn-sm btn-primario', href: '/admin' }, '⚙ Panel admin'));
    c.append(el('button', { class: 'btn btn-sm', type: 'button', onclick: FS.logout }, 'Salir'));
  }

  function llenarSelectEquipos() {
    for (const id of ['filtro-equipo', 'fav-equipo']) {
      const s = $(id);
      const primero = s.options[0];
      limpiar(s).append(primero, ...estado.equipos.map(e => el('option', { value: e.id }, e.nombre)));
    }
  }

  // ─────────── Eventos ───────────
  $('menu-btn').addEventListener('click', () => $('nav').classList.toggle('abierto'));
  $('filtro-equipo').addEventListener('change', renderPartidos);
  $('filtro-estado').addEventListener('change', renderPartidos);
  window.addEventListener('hashchange', mostrar);

  $('fav-equipo').addEventListener('change', async e => {
    try {
      const r = await api('PUT', '/api/auth/favorito', { equipoId: e.target.value || null });
      estado.usuario = r.usuario;
      renderMiPanel();
      toast('Equipo favorito guardado.');
    } catch (err) { toast(err.message, 'error'); }
  });

  const passValida = activarReglasPassword($('pass-nueva'), $('reglas-pass'));
  $('form-pass').addEventListener('submit', async e => {
    e.preventDefault();
    if (!passValida()) return toast('La nueva contraseña no cumple la política.', 'error');
    const btn = e.submitter; btn.disabled = true;
    try {
      await api('PUT', '/api/auth/password', { actual: $('pass-actual').value, nueva: $('pass-nueva').value });
      e.target.reset();
      $('pass-nueva').dispatchEvent(new Event('input'));
      toast('Contraseña actualizada. Se cerraron tus otras sesiones.');
    } catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; }
  });

  // ─────────── Carga inicial ───────────
  async function cargar() {
    try {
      const [usuario, info, partidos, posiciones, goleadores, equipos, reglamento, noticias] = await Promise.all([
        FS.sesion(),
        api('GET', '/api/public/info'),
        api('GET', '/api/public/partidos'),
        api('GET', '/api/public/posiciones'),
        api('GET', '/api/public/goleadores'),
        api('GET', '/api/public/equipos'),
        api('GET', '/api/public/reglamento'),
        api('GET', '/api/public/noticias')
      ]);
      Object.assign(estado, { usuario, info, partidos, posiciones, goleadores, equipos, reglamento, noticias });
      renderCuenta();
      llenarSelectEquipos();
      renderInicio(); renderPosiciones(); renderPartidos(); renderGoleadores(); renderEquipos(); renderReglamento(); renderMiPanel();
      mostrar();
    } catch (err) {
      toast('No se pudo cargar la información: ' + err.message, 'error');
    }
  }
  cargar();
})();
