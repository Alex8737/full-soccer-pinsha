'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const passValida = activarReglasPassword($('password'), $('reglas'));

  $('form-registro').addEventListener('submit', async e => {
    e.preventDefault();
    const error = $('error');
    error.hidden = true;
    const mostrar = msg => { error.textContent = msg; error.hidden = false; };

    const nombre = $('nombre').value.trim();
    const email = $('email').value.trim();
    const password = $('password').value;
    if (nombre.length < 3) return mostrar('Ingresa tu nombre completo.');
    if (!email.includes('@')) return mostrar('Ingresa un correo válido.');
    if (!passValida()) return mostrar('La contraseña no cumple la política de seguridad.');
    if (password !== $('password2').value) return mostrar('Las contraseñas no coinciden.');

    $('btn').disabled = true;
    try {
      await FS.api('POST', '/api/auth/registro', { nombre, email, password });
      location.replace('/#mi-panel');
    } catch (err) {
      const detalle = err.campos ? ' ' + Object.entries(err.campos).map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
      mostrar(err.message + detalle);
    } finally {
      $('btn').disabled = false;
    }
  });
})();
