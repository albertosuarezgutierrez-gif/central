// 🪤 Tres precios de la misma compañía no pueden llamarse igual (21/10/2026: «Allianz», «Allianz», «Allianz»).
// Para verlo en rojo: en `etiquetasOfertas` usa siempre solo la compañía → falla el primer test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { etiquetasOfertas, textoOpcionesComparadas } from './etiqueta-oferta.ts'

const o = (id: string, compania: string, nivel: string | null, producto: string | null = null, rol: 'actual' | 'oferta' = 'oferta') => ({ id, compania, nivel, producto, rol })

test('misma compañía → compañía + nivel; el producto que repite la compañía no se añade', () => {
  const e = etiquetasOfertas([
    o('1', 'Allianz', 'Básico', 'Allianz Hogar 2053'), o('2', 'Allianz', 'Estándar', 'Allianz Hogar 2053'), o('3', 'Allianz', 'Premium', 'Allianz Hogar 2053'),
    o('4', 'Fidelidade', 'Básico', 'Fidelidade Hogar 2024'),
  ])
  assert.deepEqual([...e.values()], ['Allianz · Básico', 'Allianz · Estándar', 'Allianz · Premium', 'Fidelidade · Hogar 2024'])
  assert.equal(new Set(e.values()).size, 4)
})

test('única: compañía (+ producto si dice algo); mismo nivel → producto; y si no, numeradas', () => {
  assert.equal(etiquetasOfertas([o('a', 'Compañía B', null, 'Hogar 360')]).get('a'), 'Compañía B · Hogar 360')
  assert.equal(etiquetasOfertas([o('a', 'Compañía C', null, null)]).get('a'), 'Compañía C')
  const mismoNivel = etiquetasOfertas([o('a', 'X', 'Básico', 'Plan Uno'), o('b', 'X', 'Básico', 'Plan Dos')])
  assert.deepEqual([...mismoNivel.values()], ['X · Básico · Plan Uno', 'X · Básico · Plan Dos'])
  const iguales = etiquetasOfertas([o('a', 'X', 'Básico'), o('b', 'X', 'Básico')])
  assert.deepEqual([...iguales.values()], ['X · Básico (opción 1)', 'X · Básico (opción 2)'])
})

test('«N opciones de M compañías» cuenta compañías distintas, no ofertas', () => {
  const seis = ['Allianz', 'Allianz', 'Allianz', 'Fidelidade', 'Fidelidade', 'Fidelidade'].map((c, i) => o(String(i), c, null))
  assert.equal(textoOpcionesComparadas(seis), '6 opciones de 2 compañías')
  assert.equal(textoOpcionesComparadas([o('a', 'A', null), o('b', 'B', null), o('x', 'Z', null, null, 'actual')]), '2 compañías y tu póliza actual')
  assert.equal(textoOpcionesComparadas([o('a', 'A', null)]), '1 compañía')
})

test('🪤 la etiqueta no atribuye una revisión que el corredor no ha hecho', async () => {
  // Para verlo en rojo: en `etiquetaResumen` ignora `revisada` → falla.
  const { etiquetaResumen } = await import('./resumen-comparativa.ts')
  assert.equal(etiquetaResumen('ia', false), 'Resumen preparado con IA')
  assert.equal(etiquetaResumen('ia', true), 'Resumen preparado con IA y revisado por tu corredor')
  assert.equal(etiquetaResumen('ia'), 'Resumen preparado con IA y revisado por tu corredor')
  assert.equal(etiquetaResumen('determinista', false), 'Resumen preparado por tu corredor a partir del cuadro comparativo')
})
