import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  interpretarRiesgo, estadoPresupuestoVariante, textoFaltan,
  interpretarComparacion, mejoresComparacion, diferenciaComparacion, ordenarParaComparar,
} from './riesgo-asegura.ts'

const OP = { id: 'op-1', clienteId: 'cli-1', clienteNombre: 'Manuel', ramo: 'moto', estado: 'competencia' }

function variante(extra: Record<string, unknown>) {
  return { id: 'v', referencia: 'P1', creadoAt: '2026-09-29T08:00:00.000Z', tomador: { clienteId: 'cli-1', nombre: 'Manuel' }, ...extra }
}

test('404 o estado no_encontrado → no_encontrado, nunca un riesgo vacío', () => {
  assert.deepEqual(interpretarRiesgo(404, null), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarRiesgo(200, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
})

test('un fallo del puerto es error con su motivo, no un riesgo sin figuras', () => {
  const r = interpretarRiesgo(500, { estado: 'error', causa: 'credenciales' })
  assert.equal(r.estado, 'error')
  assert.equal(r.estado === 'error' && r.motivo, 'credenciales')
  assert.equal(interpretarRiesgo(200, { estado: 'ok' }).estado, 'error')
})

test('cambios: [] (primera o igual) ≠ null (no se puede comparar)', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [],
    variantes: [variante({ id: 'a', cambios: [] }), variante({ id: 'b', cambios: null }), variante({ id: 'c' })],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.riesgo.variantes[0].cambios, [])
  assert.equal(r.riesgo.variantes[1].cambios, null)
  assert.equal(r.riesgo.variantes[2].cambios, null, 'sin la clave: no consta, no «igual»')
})

test('nPrecios ausente o raro → null («—»), nunca 0 opciones', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [],
    variantes: [variante({ id: 'a', nPrecios: 12 }), variante({ id: 'b' }), variante({ id: 'c', nPrecios: '12' }), variante({ id: 'd', nPrecios: 0 })],
  })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  assert.deepEqual(r.riesgo.variantes.map((v) => v.nPrecios), [12, null, null, 0])
})

test('figura sin faltan legible → null (no se pudo leer), no «nada falta»', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador', 'propietario'], vinculos: [], variantes: [],
    figuras: [
      { rol: 'tomador', clienteId: 'cli-1', nombre: 'Manuel', porDefecto: true, faltan: [] },
      { rol: 'propietario', clienteId: 'cli-2', nombre: 'Antonio', vinculo: 'Padre/Madre' },
      { rol: 'inventado', clienteId: 'cli-3', nombre: 'X' },
    ],
  })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  assert.equal(r.riesgo.figuras.length, 2, 'un rol desconocido se descarta')
  assert.deepEqual(r.riesgo.figuras[0].faltan, [])
  assert.equal(r.riesgo.figuras[1].faltan, null)
  assert.equal(textoFaltan(null), 'No se pudo leer su ficha')
  assert.equal(textoFaltan([]), null)
})

test('estado del presupuesto: null = sin preparar; lo más avanzado manda', () => {
  assert.equal(estadoPresupuestoVariante(null), null)
  const base = { id: 'p', enviadoAt: null, vistoAt: null, elegidoAt: null, aceptadoAt: null, emitidoAt: null, retiradoAt: null }
  assert.equal(estadoPresupuestoVariante(base), 'Preparado, sin enviar')
  assert.equal(estadoPresupuestoVariante({ ...base, enviadoAt: 'x', vistoAt: 'y' }), 'Enviado · visto')
  assert.equal(estadoPresupuestoVariante({ ...base, enviadoAt: 'x', retiradoAt: 'z' }), 'Retirado')
})

// ─── Comparar dos variantes ─────────────────────────────────────────────────
test('comparar: 404 → no_encontrado; fallo → error con motivo, nunca una tabla vacía', () => {
  assert.deepEqual(interpretarComparacion(404, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
  const e = interpretarComparacion(500, { estado: 'error', causa: 'conexion' })
  assert.equal(e.estado, 'error')
  assert.equal(e.estado === 'error' && e.motivo, 'conexion')
  assert.equal(interpretarComparacion(200, { estado: 'ok' }).estado, 'error', 'sin a/b no se inventa la comparación')
})

test('comparar: cambios null ≠ [] y compañía sin precio en una columna → null, no 0', () => {
  const r = interpretarComparacion(200, {
    estado: 'ok', a: 'ta', b: 'tb', cambios: null,
    companias: [
      { compania: 'Mapfre', a: { primaEur: 300, modalidad: 'Terceros' }, b: { primaEur: 280.5, modalidad: null } },
      { compania: 'Allianz', a: null, b: { primaEur: 250 } },
      { compania: 'Reale', a: { primaEur: '200' }, b: null },
      { compania: '', a: { primaEur: 1 }, b: null },
    ],
  })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  assert.equal(r.comparacion.cambios, null)
  assert.equal(r.comparacion.companias.length, 2, 'una prima que no es número no cuenta; sin nombre se descarta')
  assert.equal(r.comparacion.companias[1].a, null)
  const igual = interpretarComparacion(200, { estado: 'ok', a: 'ta', b: 'tb', cambios: [], companias: [] })
  assert.deepEqual(igual.estado === 'ok' && igual.comparacion.cambios, [])
})

test('comparar: la mejor de cada columna, y la diferencia solo con las dos primas', () => {
  const filas = [
    { compania: 'Mapfre', a: { primaEur: 300, modalidad: null }, b: { primaEur: 280.5, modalidad: null } },
    { compania: 'Allianz', a: null, b: { primaEur: 250, modalidad: null } },
  ]
  assert.deepEqual(mejoresComparacion(filas), { a: 300, b: 250 })
  assert.deepEqual(mejoresComparacion([]), { a: null, b: null })
  assert.equal(diferenciaComparacion(filas[0]), -19.5)
  assert.equal(diferenciaComparacion(filas[1]), null)
})

test('comparar: la más antigua va como a, se marque en el orden que se marque', () => {
  const vs = [
    { ...variante({ id: 'p5', referencia: 'P5', creadoAt: '2026-09-29T10:00:00Z' }) },
    { ...variante({ id: 'p2', referencia: 'P2', creadoAt: '2026-09-20T10:00:00Z' }) },
  ]
  const r = interpretarRiesgo(200, { estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [], variantes: vs })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  const par = ordenarParaComparar(r.riesgo.variantes, ['p5', 'p2'])
  assert.deepEqual(par?.map((v) => v.referencia), ['P2', 'P5'])
  assert.equal(ordenarParaComparar(r.riesgo.variantes, ['p5']), null)
  assert.equal(ordenarParaComparar(r.riesgo.variantes, ['p5', 'nada']), null)
})

test('la variante trae de qué póliza es (null = presupuesto de cliente nuevo)', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [],
    variantes: [variante({ id: 'a', polizaId: 'pol-1' }), variante({ id: 'b' })],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.riesgo.variantes[0].polizaId, 'pol-1')
  assert.equal(r.riesgo.variantes[1].polizaId, null)
})
