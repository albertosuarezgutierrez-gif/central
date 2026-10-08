import test from 'node:test'
import assert from 'node:assert/strict'
import { duracionPaso, leerRespuestaBandeja, leerRespuestaTraza, paginacionBandeja, rotuloCodigo, rotuloPaso } from './tarificador-bandeja.ts'

const ITEM = {
  id: '11111111-1111-4111-8111-111111111111', compania: 'allianz', ramo: 'comunidades', estado: 'requiere_humano',
  tipoError: 'captcha', motivo: 'Pide un código', fecha: '2026-10-08T10:00:00.000Z', intentos: 1, botVersion: '0.1.0',
  oportunidadId: null, puedeReintentar: true, puedeCancelar: true,
}

test('lee una bandeja válida y descarta filas rotas', () => {
  const r = leerRespuestaBandeja(200, { total: 2, hayMas: false, items: [ITEM, { id: 'x' }] })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.bandeja.items.length, 1)
    assert.equal(r.bandeja.total, 2)
  }
})

test('fail-closed: sin puedeReintentar/puedeCancelar explícitos no se ofrece ningún botón', () => {
  const { puedeReintentar: _a, puedeCancelar: _b, ...sinFlags } = ITEM
  const r = leerRespuestaBandeja(200, { total: 1, items: [sinFlags] })
  assert.equal(r.ok && r.bandeja.items[0].puedeReintentar, false)
  assert.equal(r.ok && r.bandeja.items[0].puedeCancelar, false)
})

test('errores de red, permiso y forma inesperada dan mensaje, nunca bandeja vacía fingida', () => {
  for (const [s, j] of [[502, null], [401, null], [503, { estado: 'sin_configurar' }], [200, { items: 'x' }], [500, {}]] as const) {
    const r = leerRespuestaBandeja(s, j)
    assert.equal(r.ok, false, String(s))
  }
})

test('traza: lectura defensiva y 404', () => {
  const r = leerRespuestaTraza(200, { botVersion: '0.1.0', pasos: [{ paso: 'login', inicio: '2026-10-08T10:00:00Z', duracionMs: 900, ok: false, errorCodigo: 'portal', capturaRef: null }, { paso: 5 }] })
  assert.equal(r.ok && r.traza.pasos.length, 1)
  assert.equal(leerRespuestaTraza(404, null).ok, false)
  assert.equal(leerRespuestaTraza(200, { pasos: [] }).ok, true)
})

test('rótulos y duraciones', () => {
  assert.equal(rotuloPaso('lectura_primas'), 'Leer las primas')
  assert.equal(rotuloPaso('raro'), 'raro')
  assert.equal(rotuloCodigo(null), '')
  assert.equal(duracionPaso(850), '0,9 s')
  assert.equal(duracionPaso(75_000), '1 min 15 s')
  assert.equal(duracionPaso(-1), '—')
})

test('paginación: tope 50', () => {
  assert.deepEqual(paginacionBandeja('51', null), { limite: 50, desde: 0 })
  assert.deepEqual(paginacionBandeja('10', '50'), { limite: 10, desde: 50 })
})
