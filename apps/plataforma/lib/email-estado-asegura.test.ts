// Cepo de la lectura del estado del email que manda asegura (07/11/2026).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONTACTABILIDADES, ESTADOS_EMAIL, leerContactabilidad, leerEstadoEmail } from './email-estado-asegura.ts'

test('un valor desconocido o ausente es «no se sabe», nunca un estado inventado', () => {
  assert.equal(leerEstadoEmail(undefined), null)
  assert.equal(leerEstadoEmail('valido'), null)
  assert.equal(leerEstadoEmail('rebotado'), 'rebotado')
  assert.equal(leerContactabilidad(null), null)
  assert.equal(leerContactabilidad('ilocalizable'), 'ilocalizable')
})

test('los vocabularios son los MISMOS que los de asegura', () => {
  const fuente = readFileSync(new URL('../../asegura/lib/email-estado.ts', import.meta.url), 'utf8')
  const lista = (re: RegExp) => [...(re.exec(fuente)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(lista(/export type EstadoEmail = ([^\n]+)/), [...ESTADOS_EMAIL].sort())
  assert.deepEqual(lista(/export type Contactabilidad = ([^\n]+)/), [...CONTACTABILIDADES].sort())
})
