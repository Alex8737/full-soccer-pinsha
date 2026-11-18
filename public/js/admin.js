'use strict';
/* Panel de administración FULL SOCCER */
(() => {
  const { api, el, limpiar, toast, fecha } = FS;
  const $ = id => document.getElementById(id);
  const panel = $('panel');
  const cache = { equipos: [], jugadores: [], partidos: [], yo: null };

  // ───────────────────────── Modal genérico ─────────────────────────
  const modal = $('modal');
  let alGuardar = null;

  function abrirModal({ titulo, cuerpo, guardar, textoGuardar = 'Guardar' }) {
    $('modal-titulo').textContent = titulo;
    limpiar($('modal-cuerpo')).append(cuerpo);
    $('modal-guardar').hidden = !guardar;
    $('modal-guardar').textContent = textoGuardar;
    $('modal-cancelar').textContent = guardar ? 'Cancelar' : 'Cerrar';
    alGuardar = guardar || null;
    modal.showModal();
  }
  const cerrarModal = () => { modal.close(); alGuardar = null; };
  $('modal-x').addEventListener('click', cerrarModal);
  $('modal-cancelar').addEventListener('click', cerrarModal);
  $('modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!alGuardar) return; // modales sin "Guardar" (p. ej. goles) no se cierran con Enter
    const btn = $('modal-guardar');
    btn.disabled = true;
    try {
      const ok = await alGuardar();
      if (ok !== false) cerrarModal();
    } finally {
      btn.disabled = false;
    }
  });

  /**
   * Formulario declarativo dentro del modal.
   * campos: [{ name, label, type, options, required, max, min, step }]
   */
  function formulario({ titulo, campos, valores = {}, onGuardar }) {
    const cont = el('div');
    const inputs = {};
    const errores = {};
    let fila = null;
    for (const c of campos) {
      let input;
      const v = valores[c.name] ?? c.def ?? '';
      if (c.type === 'textarea') {
        input = el('textarea', { id: 'f-' + c.name, maxlength: c.max, required: c.required });
        input.value = v;
      } else if (c.type === 'select') {
        input = el('select', { id: 'f-' + c.name, required: c.required },
          (c.vacio ? [el('option', { value: '' }, c.vacio)] : []).concat(c.options.map(o => el('option', { value: o.value }, o.text))));
        input.value = v;
      } else if (c.type === 'checkbox') {
        input = el('input', { type: 'checkbox', id: 'f-' + c.name });
        input.checked = !!v;
      } else {
        input = el('input', { type: c.type || 'text', id: 'f-' + c.name, maxlength: c.max, min: c.min, max: c.type === 'number' ? c.maxNum : null, required: c.required, step: c.step });
        input.value = v;
      }
      inputs[c.name] = input;
      errores[c.name] = el('div', { class: 'err' });
      const bloque = c.type === 'checkbox'
        ? el('div', { class: 'campo check' }, input, el('label', { for: 'f-' + c.name }, c.label))
        : el('div', { class: 'campo' }, el('label', { for: 'f-' + c.name }, c.label + (c.required ? ' *' : '')), input, errores[c.name]);
      if (c.mitad) {
        if (!fila) { fila = el('div', { class: 'fila' }); cont.append(fila); }
        fila.append(bloque);
      } else {
        fila = null;
        cont.append(bloque);
      }
    }
    abrirModal({
      titulo,
      cuerpo: cont,
      guardar: async () => {
        Object.values(errores).forEach(e => { e.textContent = ''; });
        const datos = {};
        for (const c of campos) {
          const i = inputs[c.name];
          if (c.type === 'checkbox') datos[c.name] = i.checked;
          else if (c.type === 'number') datos[c.name] = i.value === '' ? '' : Number(i.value);
          else datos[c.name] = i.value;
          if (c.required && datos[c.name] === '') errores[c.name].textContent = 'Campo obligatorio';
        }
        if (campos.some(c => c.required && datos[c.name] === '')) return false;
        try {
          await onGuardar(datos);
          return true;
        } catch (err) {
          if (err.campos) for (const [k, m] of Object.entries(err.campos)) if (errores[k]) errores[k].textContent = m;
          toast(err.message, 'error');
          return false;
        }
      }
    });
  }

  async function eliminar(url, que, despues) {
    if (!confirm(`¿Seguro que deseas eliminar ${que}? Esta acción no se puede deshacer.`)) return;
    try {
      await api('DELETE', url);
      toast('Eliminado correctamente.');
      despues();
    } catch (err) { toast(err.message, 'error'); }
  }

  // ───────────────────────── Ayudas de UI ─────────────────────────
  function cabecera(titulo, ...botones) {
    return el('div', { class: 'cabecera' }, el('h2', { class: 'titulo' }, titulo), el('div', { class: 'acciones' }, botones));
  }
  const boton = (texto, onclick, clase = '') => el('button', { type: 'button', class: `btn btn-sm ${clase}`, onclick }, texto);

  function tabla(columnas, filas, vacio = 'No hay registros.') {
    if (!filas.length) return el('p', { class: 'vacio tarjeta' }, vacio);
    return el('div', { class: 'tabla-wrap' },
      el('table', null,
        el('thead', null, el('tr', null, columnas.map(c => el('th', { class: c.num ? 'num' : null }, c.t)))),
        el('tbody', null, filas.map(f => el('tr', null, columnas.map(c => el('td', { class: c.num ? 'num' : null }, c.v(f))))))));
  }

  const opcionesEquipos = () => cache.equipos.map(e => ({ value: e.id, text: e.nombre }));

  async function refrescarCache() {
    const [equipos, jugadores, partidos] = await Promise.all([
      api('GET', '/api/public/equipos'),
      api('GET', '/api/admin/jugadores'),
      api('GET', '/api/public/partidos')
    ]);
    Object.assign(cache, { equipos, jugadores, partidos });
  }

  // ───────────────────────── Paneles ─────────────────────────
  const paneles = {
    async resumen() {
      const r = await api('GET', '/api/admin/resumen');
      const stat = (n, t) => el('div', { class: 'stat' }, el('b', null, n), el('span', null, t));
      panel.append(
        cabecera('Resumen general'),
        el('div', { class: 'stats' },
          stat(r.equipos, 'Equipos'), stat(r.jugadores, 'Jugadores'), stat(`${r.jugados}/${r.partidos}`, 'Partidos jugados'), stat(r.goles, 'Goles'),
          stat(r.usuarios, 'Usuarios'), stat(r.noticias, 'Noticias'), stat(r.articulos, 'Artículos del reglamento')),
        el('div', { class: 'grid g2 espacio-arriba' },
          el('div', { class: 'tarjeta' }, el('h3', null, 'Actividad reciente'),
            tabla([
              { t: 'Fecha', v: b => new Date(b.fecha).toLocaleString('es-EC') },
              { t: 'Usuario', v: b => b.usuario },
              { t: 'Acción', v: b => b.accion }
            ], r.ultimosEventos, 'Sin actividad')),
          el('div', { class: 'tarjeta' }, el('h3', null, 'Seguridad activa en la plataforma'),
            el('div', { class: 'seg-lista' },
              ['Contraseñas cifradas con bcrypt (12 rondas)',
                'Sesión con JWT firmado en cookie httpOnly + SameSite=Strict',
                'Control de acceso por roles (admin / usuario)',
                'Protección CSRF (double submit + verificación de Origin)',
                'Cabeceras seguras con Helmet y Content-Security-Policy',
                'Limitación de peticiones y bloqueo tras 5 intentos fallidos',
                'Validación estricta de entradas (lista blanca)',
                'Salida segura en el navegador (sin innerHTML) contra XSS',
                'Bitácora de auditoría de accesos y cambios'
              ].map(t => el('div', null, t)))))
      );
    },

    async noticias() {
      const lista = await api('GET', '/api/public/noticias');
      const editar = n => formulario({
        titulo: n ? 'Editar noticia' : 'Nueva noticia',
        valores: n || {},
        campos: [
          { name: 'titulo', label: 'Título', required: true, max: 120 },
          { name: 'contenido', label: 'Contenido', type: 'textarea', required: true, max: 3000 }
        ],
        onGuardar: async d => {
          if (n) await api('PUT', `/api/admin/noticias/${n.id}`, d);
          else await api('POST', '/api/admin/noticias', d);
          toast('Noticia guardada.');
          ir('noticias');
        }
      });
      panel.append(
        cabecera('Noticias', boton('+ Nueva noticia', () => editar(), 'btn-primario')),
        tabla([
          { t: 'Fecha', v: n => fecha(n.fecha) },
          { t: 'Título', v: n => n.titulo },
          { t: 'Acciones', v: n => el('div', { class: 'acciones' }, boton('Editar', () => editar(n)), boton('Eliminar', () => eliminar(`/api/admin/noticias/${n.id}`, 'la noticia', () => ir('noticias')), 'btn-peligro')) }
        ], lista, 'Aún no hay noticias publicadas.')
      );
    },

    async equipos() {
      await refrescarCache();
      const editar = e => formulario({
        titulo: e ? 'Editar equipo' : 'Nuevo equipo',
        valores: e || {},
        campos: [
          { name: 'nombre', label: 'Nombre del equipo', required: true, max: 60 },
          { name: 'color', label: 'Color de camiseta', max: 30, mitad: true },
          { name: 'delegado', label: 'Delegado', max: 80, mitad: true }
        ],
        onGuardar: async d => {
          if (e) await api('PUT', `/api/admin/equipos/${e.id}`, d);
          else await api('POST', '/api/admin/equipos', d);
          toast('Equipo guardado.');
          ir('equipos');
        }
      });
      panel.append(
        cabecera('Equipos', boton('+ Nuevo equipo', () => editar(), 'btn-primario')),
        tabla([
          { t: 'Equipo', v: e => e.nombre },
          { t: 'Color', v: e => e.color || '—' },
          { t: 'Delegado', v: e => e.delegado || '—' },
          { t: 'Jugadores', v: e => e.jugadores.length, num: true },
          { t: 'Acciones', v: e => el('div', { class: 'acciones' }, boton('Editar', () => editar(e)), boton('Eliminar', () => eliminar(`/api/admin/equipos/${e.id}`, `el equipo "${e.nombre}"`, () => ir('equipos')), 'btn-peligro')) }
        ], cache.equipos, 'Registra el primer equipo.')
      );
    },

    async jugadores() {
      await refrescarCache();
      const filtro = el('select', null, el('option', { value: '' }, 'Todos los equipos'), cache.equipos.map(e => el('option', { value: e.id }, e.nombre)));
      const cont = el('div');
      const editar = j => {
        if (!cache.equipos.length) return toast('Primero registra un equipo.', 'error');
        formulario({
          titulo: j ? 'Editar jugador' : 'Nuevo jugador',
          valores: j || { equipoId: filtro.value },
          campos: [
            { name: 'nombre', label: 'Nombre completo', required: true, max: 80 },
            { name: 'numero', label: 'Número de camiseta', type: 'number', required: true, min: 0, maxNum: 99, mitad: true },
            { name: 'posicion', label: 'Posición', type: 'select', required: true, mitad: true, options: ['Arquero', 'Defensa', 'Medio', 'Delantero'].map(p => ({ value: p, text: p })) },
            { name: 'equipoId', label: 'Equipo', type: 'select', required: true, vacio: '— Selecciona —', options: opcionesEquipos() }
          ],
          onGuardar: async d => {
            if (j) await api('PUT', `/api/admin/jugadores/${j.id}`, d);
            else await api('POST', '/api/admin/jugadores', d);
            toast('Jugador guardado.');
            await refrescarCache();
            pintar();
          }
        });
      };
      const pintar = () => {
        const lista = cache.jugadores
          .filter(j => !filtro.value || j.equipoId === filtro.value)
          .sort((a, b) => a.equipo.localeCompare(b.equipo) || a.numero - b.numero);
        limpiar(cont).append(tabla([
          { t: '#', v: j => j.numero, num: true },
          { t: 'Jugador', v: j => j.nombre },
          { t: 'Posición', v: j => j.posicion },
          { t: 'Equipo', v: j => j.equipo },
          { t: 'Acciones', v: j => el('div', { class: 'acciones' }, boton('Editar', () => editar(j)), boton('Eliminar', () => eliminar(`/api/admin/jugadores/${j.id}`, `a ${j.nombre}`, async () => { await refrescarCache(); pintar(); }), 'btn-peligro')) }
        ], lista, 'No hay jugadores registrados.'));
      };
      filtro.addEventListener('change', pintar);
      panel.append(cabecera('Jugadores', boton('+ Nuevo jugador', () => editar(), 'btn-primario')), el('div', { class: 'filtros' }, filtro), cont);
      pintar();
    },

    async partidos() {
      await refrescarCache();
      const fJornada = el('select', null, el('option', { value: '' }, 'Todas las jornadas'),
        [...new Set(cache.partidos.map(p => p.jornada))].sort((a, b) => a - b).map(j => el('option', { value: j }, `Jornada ${j}`)));
      const fEstado = el('select', null, ['', 'programado', 'jugado', 'suspendido'].map(s => el('option', { value: s }, s ? s[0].toUpperCase() + s.slice(1) : 'Todos los estados')));
      const cont = el('div');
      const hoy = new Date().toISOString().slice(0, 10);
      const sigJornada = cache.partidos.reduce((m, p) => Math.max(m, p.jornada), 0) || 1;

      const editar = p => {
        if (cache.equipos.length < 2) return toast('Necesitas al menos dos equipos.', 'error');
        formulario({
          titulo: p ? 'Editar partido' : 'Programar partido',
          valores: p || { jornada: sigJornada, fecha: hoy, hora: '10:00', estado: 'programado', cancha: 'Cancha comunal de Pinsha' },
          campos: [
            { name: 'jornada', label: 'Jornada', type: 'number', required: true, min: 1, maxNum: 99, mitad: true },
            { name: 'estado', label: 'Estado', type: 'select', required: true, mitad: true, options: [{ value: 'programado', text: 'Programado' }, { value: 'jugado', text: 'Jugado (finalizado)' }, { value: 'suspendido', text: 'Suspendido' }] },
            { name: 'fecha', label: 'Fecha', type: 'date', required: true, mitad: true },
            { name: 'hora', label: 'Hora', type: 'time', required: true, mitad: true },
            { name: 'localId', label: 'Equipo local', type: 'select', required: true, vacio: '— Selecciona —', options: opcionesEquipos(), mitad: true },
            { name: 'visitanteId', label: 'Equipo visitante', type: 'select', required: true, vacio: '— Selecciona —', options: opcionesEquipos(), mitad: true },
            { name: 'cancha', label: 'Cancha / lugar', max: 80 }
          ],
          onGuardar: async d => {
            if (p) await api('PUT', `/api/admin/partidos/${p.id}`, d);
            else await api('POST', '/api/admin/partidos', d);
            toast('Partido guardado.');
            await refrescarCache();
            pintar();
          }
        });
      };

      const pintar = () => {
        const lista = cache.partidos.filter(p => (!fJornada.value || p.jornada === Number(fJornada.value)) && (!fEstado.value || p.estado === fEstado.value));
        limpiar(cont).append(tabla([
          { t: 'J', v: p => p.jornada, num: true },
          { t: 'Fecha', v: p => `${fecha(p.fecha)} ${p.hora}` },
          { t: 'Local', v: p => p.local },
          { t: 'Marcador', v: p => (p.estado === 'jugado' ? `${p.golesLocal} - ${p.golesVisitante}` : '—'), num: true },
          { t: 'Visitante', v: p => p.visitante },
          { t: 'Estado', v: p => el('span', { class: `estado ${p.estado}` }, p.estado) },
          { t: 'Acciones', v: p => el('div', { class: 'acciones' },
              boton(`⚽ Goles (${p.goles.length})`, () => goles(p), 'btn-primario'),
              boton('Editar', () => editar(p)),
              boton('Eliminar', () => eliminar(`/api/admin/partidos/${p.id}`, 'el partido y sus goles', async () => { await refrescarCache(); pintar(); }), 'btn-peligro')) }
        ], lista, 'No hay partidos con esos filtros.'));
      };

      const goles = p => {
        const cuerpo = el('div');
        const render = partido => {
          const plantel = cache.jugadores.filter(j => j.equipoId === partido.localId || j.equipoId === partido.visitanteId)
            .sort((a, b) => a.equipo.localeCompare(b.equipo) || a.numero - b.numero);
          const selJug = el('select', { id: 'g-jugador' }, el('option', { value: '' }, '— Jugador —'),
            plantel.map(j => el('option', { value: j.id }, `${j.equipo} · #${j.numero} ${j.nombre}`)));
          const minuto = el('input', { type: 'number', id: 'g-minuto', min: 0, max: 130, placeholder: 'Min.' });
          const autogol = el('input', { type: 'checkbox', id: 'g-autogol' });
          const agregar = boton('+ Registrar gol', async () => {
            if (!selJug.value || minuto.value === '') return toast('Selecciona el jugador y el minuto.', 'error');
            try {
              const r = await api('POST', `/api/admin/partidos/${partido.id}/goles`, { jugadorId: selJug.value, minuto: Number(minuto.value), autogol: autogol.checked });
              toast('Gol registrado.');
              render(r);
            } catch (err) { toast(err.message, 'error'); }
          }, 'btn-primario');

          limpiar(cuerpo).append(...[
            el('div', { class: 'partido' },
              el('div', { class: 'eq local' }, partido.local),
              el('div', { class: 'marcador' }, `${partido.golesLocal ?? 0} - ${partido.golesVisitante ?? 0}`),
              el('div', { class: 'eq' }, partido.visitante),
              el('div', { class: 'meta' }, el('span', { class: `estado ${partido.estado}` }, partido.estado))),
            partido.estado !== 'jugado' ? el('p', { class: 'alerta info' }, 'Los goles solo cuentan en la tabla cuando el partido está en estado "jugado". Cambia el estado con "Editar".') : null,
            el('h4', null, 'Goles registrados'),
            partido.goles.length
              ? tabla([
                  { t: 'Min', v: g => `${g.minuto}'`, num: true },
                  { t: 'Jugador', v: g => g.jugador + (g.autogol ? ' (autogol)' : '') },
                  { t: 'Equipo', v: g => g.equipo },
                  { t: '', v: g => boton('Quitar', async () => {
                      try { render(await api('DELETE', `/api/admin/goles/${g.id}`)); toast('Gol eliminado.'); } catch (err) { toast(err.message, 'error'); }
                    }, 'btn-peligro') }
                ], partido.goles)
              : el('p', { class: 'muted' }, 'Sin goles registrados.'),
            el('h4', null, 'Agregar gol'),
            plantel.length
              ? el('div', null,
                  el('div', { class: 'campo' }, el('label', { for: 'g-jugador' }, 'Jugador que anotó'), selJug),
                  el('div', { class: 'fila' },
                    el('div', { class: 'campo' }, el('label', { for: 'g-minuto' }, 'Minuto'), minuto),
                    el('div', { class: 'campo check' }, autogol, el('label', { for: 'g-autogol' }, 'Autogol (cuenta para el rival)'))),
                  agregar)
              : el('p', { class: 'alerta error' }, 'Los equipos de este partido no tienen jugadores registrados.')
          ].filter(Boolean));
        };
        render(p);
        abrirModal({ titulo: 'Goles del partido', cuerpo });
        modal.addEventListener('close', async () => { await refrescarCache(); pintar(); }, { once: true });
      };

      fJornada.addEventListener('change', pintar);
      fEstado.addEventListener('change', pintar);
      panel.append(cabecera('Partidos y goles', boton('+ Programar partido', () => editar(), 'btn-primario')), el('div', { class: 'filtros' }, fJornada, fEstado), cont);
      pintar();
    },

    async reglamento() {
      const lista = await api('GET', '/api/public/reglamento');
      const siguiente = lista.reduce((m, a) => Math.max(m, a.orden), 0) + 1;
      const editar = a => formulario({
        titulo: a ? 'Editar artículo' : 'Nuevo artículo',
        valores: a || { orden: siguiente, titulo: `Art. ${siguiente} – ` },
        campos: [
          { name: 'orden', label: 'Orden', type: 'number', required: true, min: 1, maxNum: 999 },
          { name: 'titulo', label: 'Título', required: true, max: 120 },
          { name: 'contenido', label: 'Contenido', type: 'textarea', required: true, max: 5000 }
        ],
        onGuardar: async d => {
          if (a) await api('PUT', `/api/admin/reglamento/${a.id}`, d);
          else await api('POST', '/api/admin/reglamento', d);
          toast('Artículo guardado.');
          ir('reglamento');
        }
      });
      panel.append(
        cabecera('Reglamento', boton('+ Nuevo artículo', () => editar(), 'btn-primario')),
        tabla([
          { t: 'Orden', v: a => a.orden, num: true },
          { t: 'Título', v: a => a.titulo },
          { t: 'Contenido', v: a => (a.contenido.length > 70 ? a.contenido.slice(0, 70) + '…' : a.contenido) },
          { t: 'Acciones', v: a => el('div', { class: 'acciones' }, boton('Editar', () => editar(a)), boton('Eliminar', () => eliminar(`/api/admin/reglamento/${a.id}`, 'el artículo', () => ir('reglamento')), 'btn-peligro')) }
        ], lista, 'Aún no hay artículos en el reglamento.')
      );
    },

    async config() {
      const info = await api('GET', '/api/public/info');
      const campos = [
        ['nombreLiga', 'Nombre de la liga', 'input', 60],
        ['lugar', 'Lugar', 'input', 80],
        ['temporada', 'Temporada', 'input', 20],
        ['contacto', 'Contacto (teléfono / correo)', 'input', 120],
        ['descripcion', 'Descripción', 'textarea', 500]
      ];
      const form = el('form', { class: 'tarjeta', novalidate: true });
      const inputs = {};
      for (const [name, label, tag, max] of campos) {
        const i = el(tag, { id: 'c-' + name, maxlength: max });
        i.value = info[name] || '';
        inputs[name] = i;
        form.append(el('div', { class: 'campo' }, el('label', { for: 'c-' + name }, label), i));
      }
      form.append(el('button', { class: 'btn btn-primario', type: 'submit' }, 'Guardar cambios'));
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
        try { await api('PUT', '/api/admin/config', d); toast('Información actualizada.'); } catch (err) { toast(err.message, 'error'); }
      });
      panel.append(cabecera('Información de la liga'), form);
    },

    async usuarios() {
      const lista = await api('GET', '/api/admin/usuarios');
      const actualizar = async (u, d, msg) => {
        try { await api('PUT', `/api/admin/usuarios/${u.id}`, d); toast(msg); ir('usuarios'); } catch (err) { toast(err.message, 'error'); }
      };
      panel.append(
        cabecera('Usuarios'),
        el('p', { class: 'muted' }, 'Los visitantes se registran como "usuario". Solo un administrador puede otorgar el rol "admin". Al cambiar rol o estado se cierran las sesiones del usuario.'),
        tabla([
          { t: 'Nombre', v: u => u.nombre },
          { t: 'Correo', v: u => u.email },
          { t: 'Rol', v: u => el('span', { class: `badge ${u.rol === 'admin' ? 'admin' : ''}` }, u.rol) },
          { t: 'Estado', v: u => el('span', { class: `badge ${u.activo ? 'on' : 'off'}` }, u.bloqueado ? 'bloqueado' : u.activo ? 'activo' : 'inactivo') },
          { t: 'Último acceso', v: u => (u.ultimoAcceso ? new Date(u.ultimoAcceso).toLocaleString('es-EC') : '—') },
          { t: 'Acciones', v: u => u.id === cache.yo.id
              ? el('span', { class: 'muted' }, '(tú)')
              : el('div', { class: 'acciones' },
                  boton(u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin', () => {
                    if (confirm(`¿Cambiar el rol de ${u.email}?`)) actualizar(u, { rol: u.rol === 'admin' ? 'usuario' : 'admin' }, 'Rol actualizado.');
                  }),
                  boton(u.activo ? 'Desactivar' : 'Activar', () => actualizar(u, { activo: !u.activo }, 'Estado actualizado.')),
                  u.bloqueado ? boton('Desbloquear', async () => {
                    try { await api('POST', `/api/admin/usuarios/${u.id}/desbloquear`); toast('Cuenta desbloqueada.'); ir('usuarios'); } catch (err) { toast(err.message, 'error'); }
                  }) : null,
                  boton('Eliminar', () => eliminar(`/api/admin/usuarios/${u.id}`, `la cuenta ${u.email}`, () => ir('usuarios')), 'btn-peligro')) }
        ], lista)
      );
    },

    async bitacora() {
      const lista = await api('GET', '/api/admin/bitacora?limite=300');
      const filtro = el('input', { type: 'search', placeholder: 'Buscar (usuario, acción, IP)…' });
      const cont = el('div');
      const pintar = () => {
        const q = filtro.value.toLowerCase();
        const filas = lista.filter(b => !q || `${b.usuario} ${b.accion} ${b.detalle} ${b.ip}`.toLowerCase().includes(q));
        limpiar(cont).append(tabla([
          { t: 'Fecha', v: b => new Date(b.fecha).toLocaleString('es-EC') },
          { t: 'Usuario', v: b => b.usuario },
          { t: 'Acción', v: b => el('span', { class: `badge ${/fallido|bloqueado|rechazado/.test(b.accion) ? 'off' : ''}` }, b.accion) },
          { t: 'Detalle', v: b => b.detalle },
          { t: 'IP', v: b => b.ip }
        ], filas, 'Sin eventos.'));
      };
      filtro.addEventListener('input', pintar);
      panel.append(cabecera('Bitácora de seguridad'), el('div', { class: 'filtros' }, filtro), cont);
      pintar();
    }
  };

  // ───────────────────────── Navegación ─────────────────────────
  async function ir(nombre) {
    document.querySelectorAll('#menu button').forEach(b => b.classList.toggle('activo', b.dataset.panel === nombre));
    limpiar(panel);
    try {
      await paneles[nombre]();
    } catch (err) {
      if (err.status === 401 || err.status === 403) return location.replace('/login.html?next=admin');
      limpiar(panel).append(el('p', { class: 'alerta error' }, 'Error: ' + err.message));
    }
  }

  document.querySelectorAll('#menu button').forEach(b => b.addEventListener('click', () => ir(b.dataset.panel)));
  $('btn-salir').addEventListener('click', FS.logout);

  (async () => {
    cache.yo = await FS.sesion();
    if (!cache.yo || cache.yo.rol !== 'admin') return location.replace('/login.html?next=admin');
    $('admin-nombre').textContent = cache.yo.nombre;
    ir('resumen');
  })();
})();
