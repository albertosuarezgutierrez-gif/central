import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codigoDeCorreo, codigoDelIntento, esCorreoDeLogin, type CorreoOtp } from '../src/portal-otp.ts'

// Cuerpos LITERALES de los correos que mandó el Portal el 20/08/2026. Los dos
// tipos llevan la MISMA frase («código de verificación») y un código con la
// misma forma: por eso el fixture del de contraseña está aquí, es el que hace
// que el parser se equivoque si solo mira la expresión regular.
const LOGIN = (codigo: string) => `Estimado/a ALBERTO SUAREZ GUTIERREZ,

Se ha recibido en el Portal de Subastas Electrónicas un intento de inicio de sesión utilizando su usuario y contraseña. Para completar el proceso deberá introducir en la página de inicio de sesión el siguiente código de verificación: ${codigo}.

Un cordial saludo,
Portal de Subastas del Boletín Oficial del Estado.`

const CAMBIO_PASSWORD = `Estimado/a ALBERTO SUAREZ GUTIERREZ,

Para establecer su nueva contraseña deberá introducir en la página donde lo ha solicitado el siguiente código de verificación:

T84T2T52

Un cordial saludo,
Portal de Subastas del Boletín Oficial del Estado.`

const ASUNTO_LOGIN = 'Confirmar inicio de sesión en el Portal de Subastas Electrónicas'
const ASUNTO_PASSWORD = 'Cambio de contraseña en el Portal de Subastas Electrónicas'

const correo = (cuerpo: string, asunto: string, iso: string): CorreoOtp => ({
  asunto, cuerpo, fecha: new Date(iso),
})

// ── Extracción ─────────────────────────────────────────────────────────────

test('saca el código del correo real de login', () => {
  assert.equal(codigoDeCorreo({ asunto: ASUNTO_LOGIN, cuerpo: LOGIN('9A4CBF71') }), '9A4CBF71')
  // El punto final de la frase no se cuela en el código.
  assert.equal(codigoDeCorreo({ asunto: ASUNTO_LOGIN, cuerpo: LOGIN('F5BFBBT7') }), 'F5BFBBT7')
})

test('🚨 el código de CAMBIO DE CONTRASEÑA no vale para iniciar sesión', () => {
  // Misma frase, mismo formato, y no sirve: mandarlo quema un intento de login
  // contra un Portal que bloquea cuentas.
  assert.equal(esCorreoDeLogin({ asunto: ASUNTO_PASSWORD, cuerpo: CAMBIO_PASSWORD }), false)
  assert.equal(codigoDeCorreo({ asunto: ASUNTO_PASSWORD, cuerpo: CAMBIO_PASSWORD }), null)
})

test('el HTML y las entidades no despistan al extractor', () => {
  const html = `<p>…el siguiente c&#xF3;digo de verificaci&#xF3;n: <b>9T4D24E9</b>.</p>`
  assert.equal(codigoDeCorreo({ asunto: ASUNTO_LOGIN, cuerpo: html }), '9T4D24E9')
})

test('sin código reconocible devuelve null, no un trozo de texto', () => {
  assert.equal(codigoDeCorreo({ asunto: ASUNTO_LOGIN, cuerpo: 'Su sesión ha caducado.' }), null)
  assert.equal(codigoDeCorreo({ asunto: '', cuerpo: '' }), null)
})

// ── Frescura: el corazón de esto ───────────────────────────────────────────

const INTENTO = new Date('2026-08-20T15:09:55.000Z')

test('coge el código del intento en curso', () => {
  const bandeja = [
    correo(LOGIN('F5BFBBT7'), ASUNTO_LOGIN, '2026-08-20T14:44:11.000Z'),
    correo(LOGIN('9T4D24E9'), ASUNTO_LOGIN, '2026-08-20T14:53:16.000Z'),
    correo(LOGIN('9A4CBF71'), ASUNTO_LOGIN, '2026-08-20T15:09:59.000Z'),
  ]
  assert.equal(codigoDelIntento(bandeja, INTENTO), '9A4CBF71')
})

test('🚨 si el correo del intento NO ha llegado, devuelve null — nunca el anterior', () => {
  // Este es EL fallo caro: los tres códigos viejos siguen en el buzón y están
  // perfectamente formados. Devolver el más nuevo de ellos parece razonable y
  // quema el intento en curso con un código de otra sesión.
  const soloViejos = [
    correo(LOGIN('F5BFBBT7'), ASUNTO_LOGIN, '2026-08-20T14:44:11.000Z'),
    correo(LOGIN('9T4D24E9'), ASUNTO_LOGIN, '2026-08-20T14:53:16.000Z'),
  ]
  assert.equal(codigoDelIntento(soloViejos, INTENTO), null)
})

test('el margen tolera el desfase de reloj, pero NO 15 segundos', () => {
  // Gmail sella con SU reloj, no con el de Vercel: unos pocos segundos de
  // desfase no pueden descartar el correo bueno.
  const casi = [correo(LOGIN('9A4CBF71'), ASUNTO_LOGIN, '2026-08-20T15:09:52.000Z')]
  assert.equal(codigoDelIntento(casi, INTENTO), '9A4CBF71')

  // 🚨 Este test daba por bueno un correo de 15 s ANTES del intento, y eso es
  // lo que rompió la primera pasada real: dos logins seguidos van a 11 s de
  // distancia, así que a 15 s ya no se está tolerando el reloj — se está
  // aceptando el código de OTRO intento. Ahora se rechaza.
  const quinceSeg = [correo(LOGIN('9T4D24E9'), ASUNTO_LOGIN, '2026-08-20T15:09:40.000Z')]
  assert.equal(codigoDelIntento(quinceSeg, INTENTO), null)

  const diezMin = [correo(LOGIN('9T4D24E9'), ASUNTO_LOGIN, '2026-08-20T14:59:00.000Z')]
  assert.equal(codigoDelIntento(diezMin, INTENTO), null)
})

test('un correo de contraseña reciente NO tapa la ausencia del de login', () => {
  const bandeja = [correo(CAMBIO_PASSWORD, ASUNTO_PASSWORD, '2026-08-20T15:10:30.000Z')]
  assert.equal(codigoDelIntento(bandeja, INTENTO), null)
})

test('bandeja vacía o fechas corruptas no revientan', () => {
  assert.equal(codigoDelIntento([], INTENTO), null)
  const rota = [{ asunto: ASUNTO_LOGIN, cuerpo: LOGIN('9A4CBF71'), fecha: new Date('nada') }]
  assert.equal(codigoDelIntento(rota, INTENTO), null)
})

// ── El fallo REAL del 20/08/2026 ────────────────────────────────────────────
// El Portal mandó tres códigos en 40 s (16:11:47 · 16:11:58 · 16:12:27) porque
// una sola pasada disparaba varios logins. Con el margen de 30 s que había, el
// correo del intento ANTERIOR entraba en la ventana y ganaba por ser «el más
// reciente válido» → «El código de verificación proporcionado es incorrecto».

const T = (iso: string) => new Date(iso)

test('🚨 con dos intentos a 11 s, NO se coge el código del anterior', () => {
  const bandeja = [
    correo(LOGIN('AAAA1111'), ASUNTO_LOGIN, '2026-08-20T16:11:47.000Z'),
    correo(LOGIN('BBBB2222'), ASUNTO_LOGIN, '2026-08-20T16:11:58.000Z'),
  ]
  // Intento lanzado a las 16:12:20: los dos correos son de ANTES.
  assert.equal(codigoDelIntento(bandeja, T('2026-08-20T16:12:20.000Z')), null)
  // Con el margen viejo de 30 s se colaba el de 16:11:58 y quemaba el intento.
  assert.equal(codigoDelIntento(bandeja, T('2026-08-20T16:12:20.000Z'), 30_000), 'BBBB2222')
})

test('🚨 un código YA enviado no se reintenta: es de un solo uso', () => {
  const bandeja = [correo(LOGIN('CCCC3333'), ASUNTO_LOGIN, '2026-08-20T16:12:27.000Z')]
  const intento = T('2026-08-20T16:12:25.000Z')
  assert.equal(codigoDelIntento(bandeja, intento), 'CCCC3333')
  // Tras usarlo, la misma bandeja ya no lo ofrece — ni cae al siguiente viejo.
  assert.equal(codigoDelIntento(bandeja, intento, 5_000, new Set(['CCCC3333'])), null)
})

test('el margen de 5 s sigue tolerando el desfase de reloj real', () => {
  const bandeja = [correo(LOGIN('DDDD4444'), ASUNTO_LOGIN, '2026-08-20T16:12:22.000Z')]
  assert.equal(codigoDelIntento(bandeja, T('2026-08-20T16:12:25.000Z')), 'DDDD4444')
})
