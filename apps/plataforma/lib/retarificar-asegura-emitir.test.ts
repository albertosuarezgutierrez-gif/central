import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { interpretarEmitir } from './retarificar-asegura.ts'

// El 422 con el que asegura traduce el duodécimo 400 real de Codeoscopic
// («The bank account is mandatory according to the selected companies and
// payment types.», 12/09/2026): un hueco `iban`, no un fallo del vendor.
test('el 422 faltan_campos con `iban` llega a la pantalla como hueco, con su mensaje', () => {
  const r = interpretarEmitir(422, {
    estado: 'error',
    causa: 'faltan_campos',
    faltan: ['iban'],
    campos: null,
    mensaje: 'La compañía exige una cuenta bancaria (IBAN) para esta forma de pago…',
  })
  assert.equal(r.estado, 'faltan_campos')
  if (r.estado !== 'faltan_campos') return
  assert.deepEqual(r.faltan, ['iban'])
  assert.match(r.mensaje ?? '', /IBAN/)
  // Sin mensaje (respuestas antiguas) no rompe: `null`, no `undefined`.
  const sin = interpretarEmitir(422, { causa: 'faltan_campos', faltan: ['x'] })
  assert.equal(sin.estado === 'faltan_campos' ? sin.mensaje : 'x', null)
})

// Sin comentarios: se vigila el CÓDIGO, no lo que los comentarios citan.
function codigo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

test('la pantalla ofrece una caja de IBAN para el hueco y la manda como `iban` en `campos`', () => {
  const pantalla = codigo('../app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx')
  assert.match(pantalla, /estado\.faltan\.includes\('iban'\)/, 'el hueco `iban` tiene que pintar su propia caja, no el JSON avanzado.')
  assert.match(pantalla, /campos = \{ \.\.\.campos, iban: iban\.trim\(\) \}/, 'lo tecleado viaja como `campos.iban`.')
  assert.doesNotMatch(pantalla, /setIban\(['"][^'"]+['"]\)/, 'el IBAN nunca se rellena por defecto con un literal.')
})

// La otra orilla del puerto: asegura tiene que mover `campos.iban` a
// `payment.bankAccount.iban` y traducir el 400 de la cuenta a este 422.
test('la ruta de emitir de asegura entiende `iban` y traduce el 400 de la cuenta bancaria', () => {
  const ruta = codigo('../../asegura/app/api/operador/codeoscopic/emitir/route.ts')
  assert.match(ruta, /extraerIbanTecleado\(camposCliente\)/, 'la ruta tiene que sacar `campos.iban` de lo que manda plataforma.')
  assert.match(ruta, /conCuentaBancaria\(/, 'y ponerlo en `payment.bankAccount.iban`, que es donde lo lee el vendor.')
  assert.match(ruta, /esFalloDeCuentaBancaria\(envio\.mensaje\)/, 'el 400 «bank account is mandatory» vuelve como 422 `faltan_campos: [\'iban\']`.')
  assert.match(ruta, /faltan: \['iban'\]/, 'el hueco se llama `iban`, igual que en la pantalla.')
})

// «iban importante siempre confirmar» (Alberto, 12/09/2026).
test('el 422 trae la cuenta conocida (enmascarada) y si pide confirmarla; nunca el IBAN entero', () => {
  const r = interpretarEmitir(422, {
    estado: 'error',
    causa: 'faltan_campos',
    faltan: ['iban'],
    campos: null,
    mensaje: 'Confirma la cuenta de cargo ES91…1332 …',
    cuenta: { enmascarada: 'ES91…1332', origen: 'recibo', descripcion: 'la cuenta con la que paga los recibos de su póliza actual' },
    confirmar: true,
  })
  assert.equal(r.estado, 'faltan_campos')
  if (r.estado !== 'faltan_campos') return
  assert.equal(r.confirmar, true)
  assert.deepEqual(r.cuenta, { enmascarada: 'ES91…1332', origen: 'recibo', descripcion: 'la cuenta con la que paga los recibos de su póliza actual' })
  // Sin `cuenta` ni `confirmar` (asegura anterior): null / false, no undefined.
  const viejo = interpretarEmitir(422, { causa: 'faltan_campos', faltan: ['iban'] })
  if (viejo.estado !== 'faltan_campos') return assert.fail('faltan_campos')
  assert.equal(viejo.cuenta, null)
  assert.equal(viejo.confirmar, false)
})

test('la cuenta de la ficha solo viaja con la máscara confirmada a mano: ni por defecto, ni con `true`', () => {
  const pantalla = codigo('../app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx')
  assert.match(pantalla, /useState\(false\)/, 'la casilla de confirmación arranca SIN marcar.')
  assert.doesNotMatch(pantalla, /defaultChecked|checked=\{true\}/, 'nunca se preselecciona.')
  assert.match(
    pantalla,
    /cuentaConfirmada = !otraCuenta && cuentaOk && cuenta \? cuenta\.enmascarada : null/,
    'lo que viaja es la MÁSCARA que el corredor vio, y solo con la casilla marcada y sin otro IBAN tecleado.',
  )
  assert.match(pantalla, /disabled=\{!cuentaDecidida\(estado\.cuenta, cuentaOk, iban\)\}/, 'el botón Emitir se apaga hasta decidir la cuenta.')

  const ruta = codigo('../../asegura/app/api/operador/codeoscopic/emitir/route.ts')
  assert.match(ruta, /decidirCuentaEnvio\(\{ ibanTecleado, ibanJson, ficha, cuentaConfirmada: cuerpo\.cuentaConfirmada \}\)/, 'la ruta decide con la función pura y la confirmación del cuerpo.')
  assert.match(ruta, /if \(decision\.tipo === 'confirmar'\) \{/, 'y con cuenta sin confirmar contesta ANTES de llamar al vendor.')
  assert.match(ruta, /confirmar: true,/, 'diciéndole a plataforma que es una confirmación, no un hueco vacío.')
  assert.doesNotMatch(ruta, /ibanEnvio = ibanHumano \?\? ficha\.iban/, 'la ficha ya no cae al envío por su cuenta.')
})

// 13/09/2026, proyecto 40685793: el Submit llegó al vendor con la persona
// completa y Codeoscopic contestó «500 Unknown error while waiting for the
// operation to complete». Eso no es un rechazo: no se sabe si la compañía
// emitió. asegura lo declara (`quizaEmitido`) y el siguiente intento exige
// confirmación (409 `reintento_sin_confirmar`) o se corta si el proyecto ya
// cuenta una solicitud (409 `solicitud_existente`).
test('un 502 del Submit con quizaEmitido llega a la pantalla como tal, y sin el flag no', () => {
  const r = interpretarEmitir(502, { estado: 'error', causa: 'vendor', mensaje: '500: {…}', quizaEmitido: true, crudo: null })
  assert.equal(r.estado, 'error')
  if (r.estado !== 'error') return
  assert.equal(r.quizaEmitido, true)
  const s = interpretarEmitir(502, { estado: 'error', causa: 'vendor', mensaje: '400: {…}', crudo: null })
  assert.equal(s.estado === 'error' ? s.quizaEmitido : 'x', undefined)
})

test('el 409 reintento_sin_confirmar trae el último error, el rastro y el proyecto; crudo ausente ≠ legible', () => {
  const r = interpretarEmitir(409, {
    estado: 'error',
    causa: 'reintento_sin_confirmar',
    mensaje: 'El último envío…',
    ultimoError: '500: {"message":"Unknown error while waiting for the operation to complete."}',
    rastro: [],
    proyectoLegible: true,
    crudo: { id: 40685793 },
  })
  assert.equal(r.estado, 'reintento_sin_confirmar')
  if (r.estado !== 'reintento_sin_confirmar') return
  assert.match(r.ultimoError ?? '', /Unknown error/)
  assert.deepEqual(r.rastro, [])
  assert.equal(r.proyectoLegible, true)
  assert.deepEqual(r.crudo, { id: 40685793 })
  const sin = interpretarEmitir(409, { causa: 'reintento_sin_confirmar', proyectoLegible: false })
  assert.equal(sin.estado === 'reintento_sin_confirmar' ? sin.proyectoLegible : 'x', false)
  assert.equal(sin.estado === 'reintento_sin_confirmar' ? sin.crudo : 'x', null)
  assert.deepEqual(sin.estado === 'reintento_sin_confirmar' ? sin.rastro : 'x', [])
})

test('el mismo 409 con rastro (el proyecto YA cuenta una solicitud) lo conserva, y en-vuelo sigue aparte', () => {
  const r = interpretarEmitir(409, {
    estado: 'error',
    causa: 'reintento_sin_confirmar',
    mensaje: 'Ya cuenta…',
    ultimoError: null,
    rastro: [{ ruta: 'policyApplication', valor: { id: 'PA-1' } }],
    proyectoLegible: true,
    crudo: {},
  })
  assert.equal(r.estado, 'reintento_sin_confirmar')
  if (r.estado !== 'reintento_sin_confirmar') return
  assert.equal(r.rastro.length, 1)
  assert.equal(r.ultimoError, null)
  assert.equal(interpretarEmitir(409, { causa: 'en-vuelo' }).estado, 'en_vuelo')
  // `ya_emitida` no es reintentable: cae al error genérico con el mensaje de asegura.
  const ya = interpretarEmitir(409, { estado: 'error', causa: 'ya_emitida', mensaje: 'ya consta como EMITIDO' })
  assert.equal(ya.estado, 'error')
  assert.match(ya.estado === 'error' ? ya.mensaje : '', /EMITIDO/)
})

test('emitirAsegura solo manda reintentoConfirmado cuando es true (lee el fuente)', () => {
  const src = readFileSync(fileURLToPath(new URL('./retarificar-asegura.ts', import.meta.url)), 'utf8')
  assert.match(src, /p\.reintentoConfirmado === true \? \{ reintentoConfirmado: true \} : \{\}/)
})

test('el 409 trae `solicitudes` (PolicyApplication del portal) y `consejo`; un veredicto raro cae a desconocido', () => {
  const r = interpretarEmitir(409, {
    estado: 'error',
    causa: 'reintento_sin_confirmar',
    mensaje: 'La compañía ya tiene una solicitud APROBADA.',
    ultimoError: '500: {"requestId":"0d65134e-161833"}',
    consejo: 'El portal documenta el 500 como «an unhandled exception»…',
    solicitudes: [
      { id: 'P63', creadaEn: '2026-09-13T06:27:29Z', estadoId: 'Approved', estadoNombre: null, numeroPoliza: '849651', veredicto: 'aprobada' },
      { id: 'P64', creadaEn: null, estadoId: 'Weird', estadoNombre: null, numeroPoliza: null, veredicto: 'lo-que-sea' },
      'basura',
    ],
    rastro: [],
    proyectoLegible: true,
    crudo: {},
  })
  assert.equal(r.estado, 'reintento_sin_confirmar')
  if (r.estado !== 'reintento_sin_confirmar') return
  assert.equal(r.solicitudes.length, 2)
  assert.equal(r.solicitudes[0].veredicto, 'aprobada')
  assert.equal(r.solicitudes[0].numeroPoliza, '849651')
  assert.equal(r.solicitudes[1].veredicto, 'desconocido')
  assert.match(r.consejo ?? '', /unhandled exception/)
  // Sin los campos (asegura vieja): listas vacías y consejo null, nunca un reventón.
  const viejo = interpretarEmitir(409, { causa: 'reintento_sin_confirmar' })
  assert.equal(viejo.estado === 'reintento_sin_confirmar' ? viejo.solicitudes.length : -1, 0)
  assert.equal(viejo.estado === 'reintento_sin_confirmar' ? viejo.consejo : 'x', null)
})

test('el 502 del Submit lleva el consejo del portal a la pantalla, y sin él no aparece', () => {
  const con = interpretarEmitir(502, { estado: 'error', causa: 'vendor', mensaje: '500: …', quizaEmitido: true, consejo: 'repórtalo a soporte' })
  assert.equal(con.estado === 'error' ? con.consejo : null, 'repórtalo a soporte')
  const sin = interpretarEmitir(502, { estado: 'error', causa: 'vendor', mensaje: '500: …', quizaEmitido: true })
  assert.equal(sin.estado === 'error' ? 'consejo' in sin : true, false)
})

test('emitirAsegura solo manda acunarExistente cuando es true (lee el fuente)', () => {
  const src = readFileSync(fileURLToPath(new URL('./retarificar-asegura.ts', import.meta.url)), 'utf8')
  assert.match(src, /p\.acunarExistente === true \? \{ acunarExistente: true \} : \{\}/)
})

test('emitirAsegura solo manda familiaEnAllianz cuando es true (lee el fuente)', () => {
  const src = readFileSync(fileURLToPath(new URL('./retarificar-asegura.ts', import.meta.url)), 'utf8')
  assert.match(src, /p\.familiaEnAllianz === true \? \{ familiaEnAllianz: true \} : \{\}/)
})

// 17/09/2026: la casilla "familia en Allianz" no tiene ningún efecto si el
// corredor ya pegó un `product` propio en el JSON avanzado (asegura lo
// respeta tal cual) — la pantalla tiene que avisarlo ANTES de emitir, no
// dejar creer que se pidió un descuento que asegura ignoró en silencio.
test('emision.tsx avisa si la casilla de familia en Allianz choca con un `product` del JSON avanzado (lee el fuente)', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx', import.meta.url)),
    'utf8',
  )
  // `yaTraeProduct` (17/09/2026, widget de la Product Form Library) es el
  // mismo `typeof campos.product === 'object' && campos.product !== null`
  // de antes, factorizado porque ahora dos guardas lo comparten (familia en
  // Allianz Y lo guardado del formulario de la compañía).
  assert.match(src, /const yaTraeProduct = typeof campos\.product === 'object' && campos\.product !== null/)
  assert.match(src, /esAllianz && familiaAllianz && yaTraeProduct/)
})

// El mismo aviso, pero para lo guardado del widget de la Product Form
// Library: si el JSON avanzado ya trae `product`, lo del formulario no viaja
// — nunca en silencio.
test('emision.tsx avisa si lo guardado del formulario de la compañía choca con un `product` del JSON avanzado (lee el fuente)', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx', import.meta.url)),
    'utf8',
  )
  assert.match(src, /productOptions !== null && yaTraeProduct/)
})
