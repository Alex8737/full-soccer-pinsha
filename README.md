# ⚽ FULL SOCCER – San Francisco de Pinsha

Plataforma web segura para la liga comunitaria de fútbol **FULL SOCCER**.
Tiene dos tipos de usuario:

| Rol | Qué puede hacer |
|-----|-----------------|
| **Administrador** | Entra a `/admin` y gestiona noticias, equipos, jugadores, partidos, goles, reglamento, información de la liga, usuarios y revisa la bitácora de seguridad. |
| **Usuario** | Se registra, consulta posiciones, partidos, goleadores, equipos y reglamento; elige su equipo favorito y cambia su contraseña en *Mi panel*. |

Los visitantes sin cuenta también pueden ver la información pública (como en una liga deportiva comunitaria).

---

## 1. Requisitos
- [Node.js](https://nodejs.org) 18 o superior (recomendado 20/22 LTS)
- Visual Studio Code

## 2. Instalación y ejecución (en la terminal de VS Code)
```bash
cd full-soccer
npm install
copy .env.example .env      # Windows   (en Linux/Mac: cp .env.example .env)
npm start
```
Abre **http://localhost:3000** (sitio público) y **http://localhost:3000/admin** (panel).

### Cuenta de administrador inicial
Se crea automáticamente la primera vez con los datos del archivo `.env`:
- Correo: `admin@fullsoccer.ec`
- Contraseña: `Admin#Pinsha2026`

> Cámbiala en `.env` **antes** del primer arranque, o luego desde *Mi panel*.
> Si borras `ADMIN_PASSWORD`, el sistema genera una contraseña aleatoria y la muestra en la consola.

Para empezar sin datos de ejemplo pon `SEED_DEMO=false` y borra `data/db.json`.

---

## 3. Seguridad aplicada (APIs y técnicas)

| Amenaza (OWASP) | Protección | Dónde |
|---|---|---|
| Robo/cracking de contraseñas | **bcryptjs** (hash con sal, 12 rondas) + política de contraseña fuerte | `src/routes/auth.routes.js`, `src/security/validate.js` |
| Secuestro de sesión | **JWT (jsonwebtoken, HS256)** en cookie `httpOnly`, `SameSite=Strict`, `Secure` en producción, expira en 2 h, revocable (`tokenVersion`) | `src/security/auth.js` |
| Acceso indebido | **RBAC**: middleware `requireRole('admin')`; el rol lo asigna solo el servidor; el HTML del panel solo se entrega a admins | `src/security/auth.js`, `server.js` |
| CSRF | Token *double submit* (`X-CSRF-Token`) + verificación de `Origin` | `src/security/csrf.js` |
| Fuerza bruta / abuso | **express-rate-limit** (login 10/15 min, registro 5/h, API 500/15 min) + bloqueo de cuenta tras 5 intentos | `src/security/rateLimiters.js` |
| Enumeración de usuarios | Mensaje genérico y tiempo de respuesta constante en el login | `auth.routes.js` |
| XSS | **Helmet** con *Content-Security-Policy* estricta (sin scripts inline) + el frontend usa `textContent`, nunca `innerHTML` | `server.js`, `public/js/api.js` |
| Inyección / datos maliciosos | Validación por lista blanca, límites de longitud, IDs UUID, tamaño máximo de JSON (20 kb) | `src/security/validate.js` |
| Clickjacking, sniffing, etc. | Helmet: `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS (prod), `Permissions-Policy` | `server.js` |
| Falta de trazabilidad | **Bitácora de auditoría** (logins, fallos, bloqueos y cambios del admin con IP) | `src/security/audit.js` |
| Fuga de información | Errores genéricos, sin `X-Powered-By`, nunca se envía el hash de contraseña | `server.js` |

---

## 4. Estructura
```
full-soccer/
├─ server.js                 # Servidor Express + capas de seguridad
├─ .env.example              # Variables de entorno (copiar a .env)
├─ src/
│  ├─ config.js
│  ├─ db.js                  # Almacenamiento JSON (data/db.json) + datos iniciales
│  ├─ security/              # auth (JWT/RBAC), csrf, rateLimiters, validate, audit
│  ├─ routes/                # auth, public (solo lectura), admin (CRUD)
│  └─ services/stats.js      # Marcadores, tabla de posiciones, goleadores
├─ views/admin.html          # Panel admin (protegido por el servidor)
└─ public/                   # Sitio público, login, registro, CSS, JS, logo
```

## 5. API principal
- Pública (GET): `/api/public/info | equipos | partidos | posiciones | goleadores | reglamento | noticias`
- Autenticación: `GET /api/auth/csrf`, `POST /api/auth/registro`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PUT /api/auth/password`, `PUT /api/auth/favorito`
- Admin (requiere rol admin + CSRF): `/api/admin/equipos`, `/jugadores`, `/partidos`, `/partidos/:id/goles`, `/goles/:id`, `/reglamento`, `/noticias`, `/config`, `/usuarios`, `/bitacora`, `/resumen`

## 6. Cómo funciona la tabla
- El marcador se calcula a partir de los goles registrados (un **autogol** suma al rival y no cuenta para goleadores).
- Solo los partidos en estado **jugado** cuentan para posiciones y goleadores.
- Puntos: ganado 3, empate 1, perdido 0. Desempate: diferencia de goles → goles a favor.

## 7. Publicarlo en internet (Render, gratis)
1. En [render.com](https://render.com) inicia sesión con GitHub → **New → Blueprint** → elige este repositorio (usa `render.yaml`).
2. Cuando lo pida, escribe una **ADMIN_PASSWORD** propia (no uses la de ejemplo: este repositorio es público).
   `JWT_SECRET` se genera solo; `NODE_ENV=production` activa cookies `Secure` y HSTS.
3. Render entrega una URL `https://full-soccer-pinsha.onrender.com` que cualquiera puede abrir.

> **Nota del plan gratuito:** el disco de Render Free no es permanente; al reiniciarse o redesplegar, `data/db.json`
> vuelve a los datos iniciales. Para datos permanentes: plan con disco persistente o migrar `src/db.js` a una base de
> datos (PostgreSQL/MySQL con consultas parametrizadas).
