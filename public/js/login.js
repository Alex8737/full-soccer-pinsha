'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  if (params.get('next') === 'admin') $('aviso').hidden = false;

  // Si ya hay sesión, redirigir
  FS.sesion().then(u => { if (u) location.replace(u.rol === 'admin' ? '/admin' : '/#mi-panel'); });

  $('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const error = $('error');
    error.hidden = true;
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || !password) {
      error.textContent = 'Ingresa tu correo y contraseña.';
      error.hidden = false;
      return;
    }
    $('btn').disabled = true;
    try {
      const { usuario } = await FS.api('POST', '/api/auth/login', { email, password });
      location.replace(usuario.rol === 'admin' ? '/admin' : '/#mi-panel');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      $('password').value = '';
    } finally {
      $('btn').disabled = false;
    }
  });
})();
