import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarLogin, pareceIdentificada, pideCaptcha } from '../src/portal-login.ts'

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

// Cabecera ANÓNIMA: copiada literal de `/id/login.php`.
const CABECERA_ANONIMA = `
<li id="acceso"><a href="https://subastas.boe.es/acceso.php" title="Pulse para acceder o registrarse como usuario en el Portal de Subastas">Iniciar sesi&#xF3;n</a></li>`

// Cabecera IDENTIFICADA. 🚨 Los rótulos («Desconectar», «Mi Perfil») son los
// que enseña el Portal de verdad — dos observaciones independientes de la
// página viva el 20/08/2026. El MARCADO de alrededor está reconstruido, no
// copiado: no se ha podido capturar esa página desde aquí. Se declara para que
// nadie lo tome por literal.
//
// Aquí ponía «Cerrar sesión», inventado por quien escribió el parser, y por eso
// este test daba verde sobre un detector que en producción no reconocía NUNCA
// una sesión abierta.
const CABECERA_IDENTIFICADA = `
<li id="acceso"><a href="https://subastas.boe.es/id/logout.php">Desconectar</a></li>
<li><a href="https://subastas.boe.es/reg/perfil.php">Mi Perfil</a></li>`

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

test('la cabecera con «Desconectar» es el éxito', () => {
  const r = interpretarLogin(CABECERA_IDENTIFICADA, [])
  assert.equal(r.estado, 'iniciada')
  assert.equal(r.motivo, null)
})

test('🚨 el Portal NO manda cookies: exigirlas anulaba todo login bueno', () => {
  // Comprobado con `-D` sobre `/id/login.php`: cero `Set-Cookie`. El estado
  // viaja en los ocultos del formulario (`usuario`/`password`/`idUsuario`).
  assert.equal(interpretarLogin(CABECERA_IDENTIFICADA, []).estado, 'iniciada')
  assert.equal(interpretarLogin(CABECERA_IDENTIFICADA, ['PHPSESSID=abc']).estado, 'iniciada')
})

test('🚨 «Cerrar sesión» era una invención: la barra dice «Desconectar»', () => {
  // Regresión del fallo real. Cada uno de los dos rótulos basta por separado.
  assert.equal(interpretarLogin('<a>Desconectar</a>').estado, 'iniciada')
  assert.equal(interpretarLogin('<a>Mi Perfil</a>').estado, 'iniciada')
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

// ── El Portal escala a captcha (20/08/2026) ────────────────────────────────
// Tras una ráfaga de intentos fallidos, el Portal dejó de pedir el código y
// empezó a pedir «los caracteres de la imagen». Fragmento LITERAL de esa
// respuesta, con la credencial ya redactada.
const CAPTCHA_REAL = `
<form action="/id/login.php" method="post" accept-charset="UTF-8">
  <input type="hidden" name="namespace" value="52035939c71f1fac8a69af7914afe49f"/>
  <input type="hidden" name="usuario" value="alberto@ejemplo.es"/>
  <input type="hidden" name="password" value="«REDACTADO»"/>
  <fieldset><legend>Verificaci&#xF3;n de seguridad</legend>
    <label for="casillaCaptcha">Como medida de seguridad, introduzca los caracteres de la imagen en la siguiente casilla</label>
    <input required type="text" name="captcha" id="casillaCaptcha" size="10" maxlength="6" />
  </fieldset>
  <input type="submit" class="boton" id="enviar" name="enviar" value="Enviar" />
</form>`

test('🚨 el captcha se reconoce y NO se trata como un fallo reintentable', () => {
  const r = interpretarLogin(CAPTCHA_REAL, [])
  assert.equal(r.estado, 'captcha')
  assert.match(r.motivo!, /pide una persona/)
})

test('el captcha exige la frase Y el campo, no uno de los dos', () => {
  assert.equal(pideCaptcha(CAPTCHA_REAL), true)
  // Solo el texto (una página de ayuda que lo mencione) no cuenta.
  assert.equal(pideCaptcha('<p>introduzca los caracteres de la imagen</p>'), false)
  // Y un campo suelto sin el aviso, tampoco.
  assert.equal(pideCaptcha('<input name="captcha">'), false)
})

test('una sesión abierta manda sobre el captcha', () => {
  // Si la página ya viene identificada, no hay nada que escalar.
  assert.equal(interpretarLogin(CABECERA_IDENTIFICADA + CAPTCHA_REAL, []).estado, 'iniciada')
})
