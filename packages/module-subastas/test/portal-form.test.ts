import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formularioOtp, pideCodigo, redactarSecretos } from '../src/portal-form.ts'

// Formulario REAL del segundo factor del Portal (subastas.boe.es/id/login.php,
// capturado el 20/08/2026 tras un login válido). Los dos valores derivados de
// la credencial van con marcador — el test comprueba ESTRUCTURA, y meter en el
// repo la contraseña codificada o el id de sesión sería justo la fuga que este
// mismo módulo redacta.
const OTP_REAL = `
<form action="/id/login.php" method="post" accept-charset="UTF-8">
            <input type="hidden" name="usuario" value="alberto@ejemplo.es">
            <input type="hidden" name="password" value="UEFTU1dPUkQtREUtUFJVRUJB">
            <input type="hidden" name="idUsuario" value="aaaaaaaaaaaaaaaaaaaaaa==">
            <fieldset class="caja gris">
              <div class="tabla">
                <p class="fila">
                  <span class="celda">
                    <label for="labelCodigo">C&#xF3;digo</label>
                  </span>
                  <span class="celda">
                    <input type="text" id="labelCodigo" name="codVerif" value="" size="8" maxlength="32">
                  </span>
                </p>
              </div>
            </fieldset>
            <div class="bloqueBotones">
              <input type="submit" class="boton" id="enviar" name="verificar" value="Verificar">
            </div>
          </form>`

const AVISO = `<p>Por su seguridad, para iniciar sesi&#xF3;n en el Portal de Subastas, introduzca el
c&#xF3;digo de verificaci&#xF3;n que le hemos enviado tanto a su correo electr&#xF3;nico como a su
tel&#xE9;fono m&#xF3;vil:</p>`

// El de usuario+contraseña, para comprobar que NO se confunde con el del código.
const LOGIN_NORMAL = `
<form action="/id/login.php" method="post" accept-charset="UTF-8" autocomplete="off">
  <input type="text" id="labelUsuario" name="usuario" value="" size="40" maxlength="100">
  <input type="password" id="labelPassword" name="password" value="" size="20" maxlength="20">
  <input type="submit" class="boton" id="conectar" name="conectar" value="Conectar" />
</form>`

test('lee el formulario REAL del segundo factor', () => {
  const f = formularioOtp(AVISO + OTP_REAL)!
  assert.ok(f, 'debería reconocerlo')
  assert.equal(f.action, '/id/login.php')
  assert.equal(f.method, 'post')
  assert.equal(f.campoCodigo, 'codVerif')
})

test('🚨 el campo se llama `codVerif`: sin la pista «verif» no se encuentra por nombre', () => {
  // Aquí acertaba de rebote por el `id="labelCodigo"`. Este test fija que el
  // NOMBRE basta, para que un rediseño que quite ese id no deje al cron mudo.
  const soloNombre = OTP_REAL.replace('id="labelCodigo" ', '')
  assert.equal(formularioOtp(soloNombre)?.campoCodigo, 'codVerif')
})

test('reenvía los TRES ocultos y el botón: el Portal los exige', () => {
  const f = formularioOtp(OTP_REAL)!
  // 🚨 El Portal reenvía la credencial en el propio formulario del código: si
  // se manda solo el código, el POST no completa el login.
  assert.deepEqual(Object.keys(f.campos).sort(), ['idUsuario', 'password', 'usuario', 'verificar'])
  assert.equal(f.campos.verificar, 'Verificar')
  assert.ok(!('codVerif' in f.campos), 'el campo del código lo rellena quien llama')
})

test('🚨 el formulario de usuario+contraseña NO se confunde con el del código', () => {
  // Sus campos están vacíos y ninguno se llama como el del código: si esto
  // devolviera algo, el cron mandaría el código al login y quemaría el intento.
  assert.equal(formularioOtp(LOGIN_NORMAL), null)
  assert.equal(pideCodigo(LOGIN_NORMAL), false)
})

test('`pideCodigo` exige el aviso Y el formulario, no uno de los dos', () => {
  assert.equal(pideCodigo(AVISO + OTP_REAL), true)
  // Texto sin formulario (una página de ayuda que mencione el código) no cuenta.
  assert.equal(pideCodigo(AVISO), false)
  // Y formulario sin el aviso tampoco: no se da por hecho lo que no se ha leído.
  assert.equal(pideCodigo(OTP_REAL), false)
})

// ── La fuga que encontró Claude en Chrome al capturar la página ─────────────

test('🚨 redactar NO deja pasar la contraseña de un volcado', () => {
  const limpio = redactarSecretos(OTP_REAL)
  assert.ok(!limpio.includes('UEFTU1dPUkQtREUtUFJVRUJB'), limpio)
  assert.match(limpio, /name="password" value="«REDACTADO»"/)
  // Y no se lleva por delante lo que sí hace falta para depurar.
  assert.match(limpio, /name="codVerif"/)
  assert.match(limpio, /name="idUsuario"/)
  assert.match(limpio, /action="\/id\/login\.php"/)
})

test('redactar también tapa el campo de contraseña del login normal', () => {
  const conValor = LOGIN_NORMAL.replace('name="password" value=""', 'name="password" value="hunter2"')
  assert.ok(!redactarSecretos(conValor).includes('hunter2'))
})

test('un HTML ya redactado sigue siendo parseable', () => {
  // El volcado de diagnóstico se lee después: si redactar lo rompiera, el
  // fixture que se saque de ahí no valdría para escribir el parser.
  const f = formularioOtp(redactarSecretos(OTP_REAL))!
  assert.equal(f.campoCodigo, 'codVerif')
  assert.equal(f.campos.password, '«REDACTADO»')
})
