import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarOferta } from './retarificar-asegura.ts'

// El 422 que asegura devuelve cuando la compañía pide un dato que ni el
// proyecto ni la ficha tienen (11º 400 real, la calle).
const FALTAN = {
  estado: 'faltan_vendor',
  faltan: [{ campo: 'nombreVia', motivo: 'la compañía lo exige para confirmar el precio: «The road name…»' }],
  sugeridos: { nombreVia: 'SAN VICENTE' },
  noReconocidos: ['The `policyApplications` body part is required.'],
  mensaje: 'codeoscopic_validacion: {...}',
}

test('un 422 faltan_vendor llega a la pantalla como huecos, no como error', () => {
  const r = interpretarOferta(422, FALTAN)
  assert.equal(r.estado, 'faltan_vendor')
  if (r.estado !== 'faltan_vendor') return
  assert.deepEqual(r.faltan.map((f) => f.campo), ['nombreVia'])
  assert.deepEqual(r.sugeridos, { nombreVia: 'SAN VICENTE' })
  assert.deepEqual(r.noReconocidos, ['The `policyApplications` body part is required.'])
})

test('sugeridos y noReconocidos con forma rara degradan a vacío, no rompen', () => {
  const r = interpretarOferta(422, { ...FALTAN, sugeridos: 'x', noReconocidos: [1, 'ok'] })
  assert.equal(r.estado, 'faltan_vendor')
  if (r.estado !== 'faltan_vendor') return
  assert.deepEqual(r.sugeridos, {})
  assert.deepEqual(r.noReconocidos, ['ok'])
})

test('un 409 patch_no_aplicado es su propio estado: manda a cotizar de cero, no a reintentar', () => {
  const r = interpretarOferta(409, { estado: 'error', causa: 'patch_no_aplicado', mensaje: 'no cuajó' })
  assert.equal(r.estado, 'patch_no_aplicado')
  if (r.estado !== 'patch_no_aplicado') return
  assert.match(r.mensaje, /no cuajó/)
})

test('un 502 del vendor sin traducir sigue siendo error, como antes', () => {
  const r = interpretarOferta(502, { estado: 'error', causa: 'vendor', mensaje: 'codeoscopic_servidor: 500' })
  assert.equal(r.estado, 'error')
})
