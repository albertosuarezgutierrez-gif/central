import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarLogin, pareceIdentificada } from '../src/portal-login.ts'

// Fragmentos LITERALES del Portal (subastas.boe.es, 20/08/2026). El de error es
// la respuesta real a un `POST /id/login.php` con credenciales inexistentes; el
// de cabecera, el `<div id="cabecera">` que sirve a un anónimo. Copiados tal
// cual — con sus entidades `&#xE1;` — porque el fallo clásico de este parser es
// buscar acentos sobre un HTML que los escribe codificados.
const ERROR_REAL = `
<div id="contenedor">
  <div id="contenido">
    <div class="caja gris error">
      <p>
        <strong>ERROR: </strong> Los datos de acceso proporcionados son incorrectos, el usuario no est&#xE1; activo o est&#xE1; bloqueado.
      </p>
    </div>
  </div>
</div>`

const CABECERA_ANONIMA = `
<li id="acceso"><a href="https://subastas.boe.es/acceso.php" title="Pulse para acceder o registrarse como usuario en el Portal de Subastas">Iniciar sesi&#xF3;n</a></li>`

const CABECERA_IDENTIFICADA = `
<li id="acceso"><a href="https://subastas.boe.es/id/logout.php">Cerrar sesi&#xF3;n</a></li>
<div id="contenido"><h2>Mis subastas</h2></div>`

// ── Rechazo: el estado que PROHÍBE reintentar ──────────────────────────────

test('el error real del Portal se lee como rechazo, no como fallo cualquiera', () => {
  const r = interpretarLogin(CABECERA_ANONIMA + ERROR_REAL, ['PHPSESSID=abc'])
  assert.equal(r.estado, 'rechazada')
  assert.match(r.motivo!, /usuario o la contrase/)
})

test('🚨 una cookie de sesión NO convierte un rechazo en un acceso', () => {
  // El Portal entrega PHPSESSID también a los anónimos: si la cookie bastara,
  // cada pasada reintentaría una contraseña mala hasta bloquear la cuenta.
  const r = interpretarLogin(ERROR_REAL, ['PHPSESSID=abc', 'otra=1'])
  assert.equal(r.estado, 'rechazada')
})

// ── Éxito: se exige POSITIVO ───────────────────────────────────────────────

test('la cabecera con «Cerrar sesión» + cookie es el único éxito', () => {
  const r = interpretarLogin(CABECERA_IDENTIFICADA, ['PHPSESSID=abc'])
  assert.equal(r.estado, 'iniciada')
  assert.equal(r.motivo, null)
})

test('🚨 sin cookie no hay sesión que mantener, aunque la página lo parezca', () => {
  const r = interpretarLogin(CABECERA_IDENTIFICADA, [])
  assert.equal(r.estado, 'desconocido')
  assert.match(r.motivo!, /no ha enviado cookie/)
})

// ── Lo que no se sabe se dice ──────────────────────────────────────────────

test('🚨 una respuesta que no demuestra nada NO se da por buena', () => {
  // Portal caído, mantenimiento, rediseño: todo esto es «no lo sé». Darlo por
  // sesión abierta haría que el muro documental se grabara como lo que ve un
  // usuario registrado, que es justo la afirmación falsa que se quiere evitar.
  for (const html of ['', '<html><body>502 Bad Gateway</body></html>', CABECERA_ANONIMA]) {
    assert.equal(interpretarLogin(html, ['PHPSESSID=abc']).estado, 'desconocido', html)
  }
})

// ── Caducidad a mitad de pasada ────────────────────────────────────────────

test('`pareceIdentificada` distingue la ficha anónima de la identificada', () => {
  assert.equal(pareceIdentificada(CABECERA_IDENTIFICADA), true)
  assert.equal(pareceIdentificada(CABECERA_ANONIMA), false)
  assert.equal(pareceIdentificada(''), false)
})
