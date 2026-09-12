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
