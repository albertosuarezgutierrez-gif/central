import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leerCotizacion } from './respuesta.ts'
import { compararReproceso, type FilaGuardadaReproceso } from './reproceso.ts'

// Respuesta REAL del vendor (proyecto hecho en Avant2, 26/09/2026): no un fixture escrito a mano.
const CRUDO = JSON.parse(readFileSync(new URL('../../fixtures/codeoscopic/2026-09-26-proyecto-web-avant2.json', import.meta.url), 'utf8'))
const guardadasDeHoy = (conId: boolean): FilaGuardadaReproceso[] =>
  leerCotizacion(CRUDO).precios.map((p) => ({
    compania: p.compania, categoria: p.categoria, modalidad: p.modalidad,
    primaEur: p.primaEur, franquiciaEur: p.franquiciaEur, idPrecio: conId ? p.id : null,
  }))

test('re-leer una respuesta con el mismo lector no da diferencias', () => {
  const r = compararReproceso(CRUDO, guardadasDeHoy(true))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.ok(r.precios > 0)
  assert.deepEqual(r.diferencias, [])
})

test('una prima, una modalidad o una fila distinta de lo guardado salen como diferencia', () => {
  const g = guardadasDeHoy(true)
  g[0] = { ...g[0], primaEur: (g[0].primaEur ?? 0) + 10 }
  g[1] = { ...g[1], modalidad: 'Otra modalidad' }
  const quitada = g.pop()!
  const r = compararReproceso(CRUDO, g)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  const tipos = r.diferencias.map((d) => (d.tipo === 'cambia' ? `cambia:${d.campo}` : d.tipo)).sort()
  assert.deepEqual(tipos, ['cambia:modalidad', 'cambia:primaEur', 'sobra'])
  assert.ok(r.diferencias.some((d) => d.tipo === 'sobra' && d.clave === `id:${quitada.idPrecio}`))
})

test('filas viejas sin id se emparejan por compañía + nivel + modalidad', () => {
  const r = compararReproceso(CRUDO, guardadasDeHoy(false))
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.deepEqual(r.diferencias, [])
  const menos = guardadasDeHoy(false).slice(1)
  const r2 = compararReproceso(CRUDO, [...menos, { compania: 'X', categoria: 'Y', modalidad: 'Z', primaEur: 1, franquiciaEur: null, idPrecio: null }])
  if (r2.estado === 'ok') assert.deepEqual(r2.diferencias.map((d) => d.tipo).sort(), ['falta', 'sobra'])
})

test('una respuesta que el lector no entiende es «ilegible», no «sin diferencias»', () => {
  const r = compararReproceso('esto no es json de vendor', [])
  assert.equal(r.estado, 'ilegible')
})
