'use strict';
/** Checklist visual de la política de contraseñas (la validación real se hace en el servidor). */
function activarReglasPassword(input, lista) {
  const reglas = [
    ['Entre 8 y 72 caracteres', v => v.length >= 8 && v.length <= 72],
    ['Una letra mayúscula', v => /[A-Z]/.test(v)],
    ['Una letra minúscula', v => /[a-z]/.test(v)],
    ['Un número', v => /\d/.test(v)],
    ['Un símbolo (#, $, !, ...)', v => /[^A-Za-z0-9]/.test(v)]
  ];
  const items = reglas.map(([txt]) => FS.el('li', null, txt));
  lista.append(...items);
  const actualizar = () => reglas.forEach(([, fn], i) => items[i].classList.toggle('ok', fn(input.value)));
  input.addEventListener('input', actualizar);
  actualizar();
  return () => reglas.every(([, fn]) => fn(input.value));
}
