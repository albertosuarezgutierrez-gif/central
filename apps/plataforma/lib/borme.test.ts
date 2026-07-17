// Tests del parser BORME. Runner: `node --test` (Node 22, type-stripping nativo).
// Los datos reproducen la estructura real del XML provincial (pares articulo/parrafo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarActo, normalizarEmpresa, parseActosProvincia, type PElem } from './borme.ts'

test('clasificarActo detecta concurso (incl. "Situación concursal")', () => {
  assert.equal(clasificarActo('Situación concursal. Auto de declaración de concurso.'), 'concurso')
  assert.equal(clasificarActo('Declaración de concurso de acreedores'), 'concurso')
})
test('clasificarActo detecta disolución/extinción', () => {
  assert.equal(clasificarActo('Disolución. Voluntaria. Extinción.'), 'disolucion')
})
test('clasificarActo detecta ampliación de capital', () => {
  assert.equal(clasificarActo('Ampliación de capital. Suscripción'), 'ampliacion_capital')
})
test('clasificarActo: ceses/nombramientos → cese; constitución → otro', () => {
  assert.equal(clasificarActo('Ceses/Dimisiones. Adm. Unico: X. Nombramientos.'), 'cese')
  assert.equal(clasificarActo('Constitución. Comienzo de operaciones: 8.04.26.'), 'otro')
})

test('normalizarEmpresa: mayúsculas sin puntuación ni forma societaria', () => {
  assert.equal(normalizarEmpresa('Talleres López, S.L.'), 'TALLERES LOPEZ')
  assert.equal(normalizarEmpresa('MAQUINARIA SHIZUKANI, SOCIEDAD LIMITADA'), 'MAQUINARIA SHIZUKANI')
})

test('parseActosProvincia: empareja empresa↔acto y clasifica', () => {
  const ps: PElem[] = [
    { clazz: 'articulo', text: '335848 - BDW DEVELOPMENT SL.' },
    { clazz: 'parrafo', text: 'Constitución. Comienzo de operaciones: 8.04.26. Datos registrales.' },
    { clazz: 'articulo', text: '335851 - CALZADOS PASOLI SL.' },
    { clazz: 'parrafo', text: 'Situación concursal. Auto de declaración de concurso. Voluntario.' },
    { clazz: 'articulo', text: '335852 - SWIPE LEVANTE SL.' },
    { clazz: 'parrafo', text: 'Ceses/Dimisiones. Liquidador: X. Disolución. Voluntaria. Extinción.' },
  ]
  const evs = parseActosProvincia(ps, 'ALICANTE/ALACANT', 'BORME-A-2026-136-03', '2026-07-17')
  // La constitución se descarta (otro); quedan concurso + disolución.
  assert.equal(evs.length, 2)
  const concurso = evs.find((e) => e.tipo === 'concurso')!
  assert.ok(concurso)
  assert.equal(concurso.empresa, 'CALZADOS PASOLI SL')
  assert.equal(concurso.empresaNorm, 'CALZADOS PASOLI')
  assert.equal(concurso.provincia, 'ALICANTE/ALACANT')
  assert.equal(concurso.fecha, '2026-07-17')
  assert.ok(concurso.dedupeKey.includes('335851'))
  assert.ok(evs.some((e) => e.tipo === 'disolucion' && e.empresaNorm === 'SWIPE LEVANTE'))
})

test('parseActosProvincia: parrafo sin empresa previa se ignora', () => {
  const evs = parseActosProvincia([{ clazz: 'parrafo', text: 'Concurso' }], 'X', 'B-1', '2026-07-17')
  assert.equal(evs.length, 0)
})
