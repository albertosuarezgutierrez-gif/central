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
