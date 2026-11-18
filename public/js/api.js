'use strict';
/**
 * Utilidades compartidas del frontend.
 * SEGURIDAD: todo el contenido que viene del servidor se inserta con textContent
 * (función el()), nunca con innerHTML → evita XSS almacenado.
 */
const FS = (() => {
  function leerCookie(nombre) {
    const par = document.cookie.split('; ').find(c => c.startsWith(nombre + '='));
    return par ? decodeURIComponent(par.split('=')[1]) : '';
  }

  async function asegurarCsrf() {
    let t = leerCookie('fs_csrf');
    if (!t) {
      const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
      t = (await r.json()).csrfToken;
    }
    return t;
  }

  async function api(metodo, url, cuerpo) {
    const opts = { method: metodo, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (metodo !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-CSRF-Token'] = await asegurarCsrf();
      if (cuerpo !== undefined) opts.body = JSON.stringify(cuerpo);
    }
    const r = await fetch(url, opts);
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    if (!r.ok) {
      const err = new Error((data && data.error) || `Error ${r.status}`);
      err.status = r.status;
      err.campos = data && data.campos;
      throw err;
    }
    return data;
  }

  /** Crea elementos de forma segura: el('div', {class:'x'}, 'texto', hijo...) */
  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const h of hijos.flat()) {
      if (h === null || h === undefined || h === false) continue;
      n.append(h instanceof Node ? h : document.createTextNode(String(h)));
    }
    return n;
  }

  function limpiar(nodo) {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
    return nodo;
  }

  function toast(msg, tipo = 'ok') {
    let caja = document.getElementById('toasts');
    if (!caja) {
      caja = el('div', { id: 'toasts', 'aria-live': 'polite' });
      document.body.append(caja);
    }
    const t = el('div', { class: `toast toast-${tipo}` }, msg);
    caja.append(t);
    setTimeout(() => t.classList.add('fuera'), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  function fecha(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const f = new Date(y, m - 1, d);
    return `${DIAS[f.getDay()]} ${d} ${MESES[m - 1]} ${y}`;
  }

  async function sesion() {
    try {
      return (await api('GET', '/api/auth/me')).usuario;
    } catch {
      return null;
    }
  }

  async function logout() {
    try { await api('POST', '/api/auth/logout'); } catch { /* sin acción */ }
    location.href = '/';
  }

  return { api, el, limpiar, toast, fecha, sesion, logout };
})();
