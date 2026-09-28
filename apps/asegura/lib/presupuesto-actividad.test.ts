import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  MAX_ACTIVIDAD_DIA, MAX_COMPARADAS, MAX_GARANTIAS, clavesDelRamo, decidirActividad, normalizarActividad,
} from './presupuesto-actividad.ts'
import { agregarActividad, esEtapa, etapasAvisadas } from './presupuesto-seguimiento.ts'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const OCULTA = '33333333-3333-3333-3333-333333333333'

test('normalizarActividad: solo claves del catálogo del ramo, en su orden y sin repetir', () => {
  const d = normalizarActividad(
    { garantias: ['robo', 'lunas', 'inventada', 'lunas', 42, ' rc_obligatoria '], comparadas: [] },
    { ramo: 'auto', opcionesVisibles: [] },
  )
  assert.deepEqual(d.garantias, ['rc_obligatoria', 'lunas', 'robo'])
  // Un ramo sin catálogo no admite ninguna garantía.
  assert.deepEqual(normalizarActividad({ garantias: ['lunas'], comparadas: [] }, { ramo: 'responsabilidad civil', opcionesVisibles: [] }).garantias, [])
})

test('normalizarActividad: comparadas ⊆ opciones VISIBLES (la oculta y la ajena se tiran), ordenadas', () => {
  const d = normalizarActividad(
    { garantias: 'no-es-lista', comparadas: [B, OCULTA, A.toUpperCase(), 'basura', B] },
    { ramo: 'auto', opcionesVisibles: [A, B] },
  )
  assert.deepEqual(d, { garantias: [], comparadas: [A, B] })
})

test('normalizarActividad: topes de 20 garantías y 5 comparadas', () => {
  const claves = clavesDelRamo('auto')
  const muchas = Array.from({ length: 8 }, (_, i) => `${i}`.padStart(8, '0') + '-0000-0000-0000-000000000000')
  const d = normalizarActividad({ garantias: [...claves, ...claves], comparadas: muchas }, { ramo: 'auto', opcionesVisibles: muchas })
  assert.ok(d.garantias.length <= MAX_GARANTIAS)
  assert.equal(d.comparadas.length, MAX_COMPARADAS)
})

test('decidirActividad: vacía, duplicada (mismo detalle en otro orden), límite y guardar', () => {
  const d = { garantias: ['lunas'], comparadas: [A, B] }
  assert.equal(decidirActividad({ garantias: [], comparadas: [] }, { recientes: [], enUltimas24h: 0 }), 'vacia')
  assert.equal(decidirActividad(d, { recientes: [{ garantias: ['lunas'], comparadas: [A, B] }], enUltimas24h: 1 }), 'duplicada')
  assert.equal(decidirActividad(d, { recientes: [{ garantias: ['robo'], comparadas: [A, B] }, 'basura', null], enUltimas24h: 1 }), 'guardar')
  assert.equal(decidirActividad(d, { recientes: [], enUltimas24h: MAX_ACTIVIDAD_DIA }), 'limite')
  assert.equal(decidirActividad(d, { recientes: [], enUltimas24h: MAX_ACTIVIDAD_DIA - 1 }), 'guardar')
})

test('etapasAvisadas: solo eventos seguimiento_avisado con una etapa válida', () => {
  const t = new Date('2026-09-28T10:00:00Z')
  assert.deepEqual(etapasAvisadas([
    { tipo: 'seguimiento_avisado', ocurridoAt: t, detalle: { etapa: 'sin_abrir' } },
    { tipo: 'seguimiento_avisado', ocurridoAt: t, detalle: { etapa: 'otra' } },
    { tipo: 'actividad_cliente', ocurridoAt: t, detalle: { etapa: 'sin_elegir' } },
    { tipo: 'seguimiento_avisado', ocurridoAt: t, detalle: null },
  ]), ['sin_abrir'])
  assert.equal(esEtapa('sin_elegir'), true)
  assert.equal(esEtapa('SIN_ABRIR'), false)
})

test('agregarActividad: sin eventos → null (no consta ≠ no le interesa nada)', () => {
  assert.equal(agregarActividad([], 'auto', []), null)
  assert.equal(agregarActividad([{ tipo: 'seguimiento_avisado', ocurridoAt: new Date(), detalle: {} }], 'auto', []), null)
})

test('agregarActividad: unión de garantías → ETIQUETAS; ids → compañías; última fecha', () => {
  const r = agregarActividad([
    { tipo: 'actividad_cliente', ocurridoAt: new Date('2026-09-28T11:00:00Z'), detalle: { garantias: ['robo'], comparadas: [B] } },
    { tipo: 'actividad_cliente', ocurridoAt: new Date('2026-09-28T10:00:00Z'), detalle: { garantias: ['lunas', 'desconocida'], comparadas: [A, 'ya-no-existe'] } },
    { tipo: 'actividad_cliente', ocurridoAt: new Date('2026-09-28T09:00:00Z'), detalle: 'basura' },
  ], 'auto', [{ id: A, compania: 'Allianz' }, { id: B, compania: 'Reale' }])
  assert.deepEqual(r, {
    garantias: ['Lunas', 'Robo'],
    companiasComparadas: ['Allianz', 'Reale'],
    ultimaAt: '2026-09-28T11:00:00.000Z',
  })
})

test('las lecturas nuevas de presupuesto_opcion filtran las ocultas (fuente)', () => {
  for (const f of ['presupuesto-actividad-servicio.ts', 'presupuesto-seguimiento-servicio.ts']) {
    const src = readFileSync(join(import.meta.dirname, f), 'utf8')
    const lecturas = [...src.matchAll(/presupuestoOpcion\.findMany\(/g)]
    assert.ok(lecturas.length >= 1, `${f}: no lee opciones`)
    for (const m of lecturas) assert.match(src.slice(m.index!, m.index! + 300), /ocultaAt: null/, f)
  }
})

test('seguimiento: un fallo de lectura LANZA, no devuelve [] (fuente)', () => {
  const src = readFileSync(join(import.meta.dirname, 'presupuesto-seguimiento-servicio.ts'), 'utf8')
  assert.doesNotMatch(src, /catch\s*\(/, 'el servicio no puede tragarse el error: la ruta lo convierte en {estado:error}')
  const ruta = readFileSync(join(import.meta.dirname, '..', 'app', 'api', 'operador', 'presupuesto', 'seguimiento', 'route.ts'), 'utf8')
  assert.match(ruta, /estado: 'error', causa: registrarErrorCartera/)
})
