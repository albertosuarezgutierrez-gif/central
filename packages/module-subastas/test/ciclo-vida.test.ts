import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DIAS_PARA_ARCHIVAR, esVigente, estadoCiclo, seConservaParaAprender } from '../src/ciclo-vida.ts'

const AHORA = new Date('2026-07-30T12:00:00Z')
const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000).toISOString()

test('con fecha futura está vigente', () => {
  assert.equal(estadoCiclo({ fechaFin: dias(1), resultado: null, ahora: AHORA }), 'vigente')
  assert.ok(esVigente({ fechaFin: dias(30), resultado: null, ahora: AHORA }))
})

test('recién pasada y sin resultado: CERRADA, se le sigue buscando el resultado', () => {
  assert.equal(estadoCiclo({ fechaFin: dias(-1), resultado: null, ahora: AHORA }), 'cerrada')
  assert.equal(estadoCiclo({ fechaFin: dias(-30), resultado: null, ahora: AHORA }), 'cerrada')
})

test('pasada CON resultado: archivada (ya no hay nada que esperar)', () => {
  assert.equal(estadoCiclo({ fechaFin: dias(-1), resultado: 'desierta', ahora: AHORA }), 'archivada')
  assert.equal(estadoCiclo({ fechaFin: dias(-1), resultado: 'adjudicada', ahora: AHORA }), 'archivada')
})

test('pasada sin resultado tras el plazo: archivada sin él', () => {
  assert.equal(estadoCiclo({ fechaFin: dias(-(DIAS_PARA_ARCHIVAR + 1)), resultado: null, ahora: AHORA }), 'archivada')
})

test('sin fecha de conclusión NO se archiva por tiempo (adquisición directa de la Junta)', () => {
  assert.equal(estadoCiclo({ fechaFin: null, resultado: null, ahora: AHORA }), 'vigente')
})

test('una fecha ilegible no saca la subasta de la lista', () => {
  assert.equal(estadoCiclo({ fechaFin: 'no es una fecha', resultado: null, ahora: AHORA }), 'vigente')
})

test('el histórico se conserva SIEMPRE: es la memoria del agente', () => {
  // Si alguien añade una purga de histórico, este test debe romperse: sin las
  // convocatorias viejas no hay reaparición (la misma finca más barata) ni
  // calibración (a qué % del tipo se remata de verdad).
  for (const e of [
    { fechaFin: dias(-500), resultado: 'desierta' },
    { fechaFin: dias(-500), resultado: null },
    { fechaFin: null, resultado: null },
  ]) {
    assert.ok(seConservaParaAprender(e))
  }
})
