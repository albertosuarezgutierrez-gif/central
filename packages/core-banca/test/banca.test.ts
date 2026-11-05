import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNorma43, parseCsvBanco, cabecerasCsv, importeACentimos, fechaAIso, huellasDeMovimientos, proponerConciliacion, psd2NoConectado } from '../src/index.ts'
import type { Candidato, MovimientoBanco } from '../src/index.ts'
import { N43_EJEMPLO } from './_n43-ejemplo.ts'

test('N43: cabecera, tres movimientos con signo, conceptos 23 y saldo final (céntimos enteros)', () => {
  const [e, ...resto] = parseNorma43(N43_EJEMPLO)
  assert.equal(resto.length, 0)
  assert.equal(e.ccc, '000000010000012345')
  assert.equal(e.banco, 'BANCO DE PRUEBA')
  assert.equal(e.saldoInicial, 100000)
  assert.equal(e.saldoFinal, 216125)
  assert.equal(e.fechaInicio, '2026-11-01')
  assert.equal(e.fechaFin, '2026-11-30')
  assert.deepEqual(e.movimientos.map((m) => m.importe), [-4550, 121000, -325])
  assert.ok(e.movimientos.every((m) => Number.isInteger(m.importe)))
  assert.equal(e.movimientos[0].fechaOperacion, '2026-11-03')
  assert.equal(e.movimientos[1].fechaValor, '2026-11-11')
  assert.equal(e.movimientos[0].contraparte, 'ENDESA ENERGIA SA')
  assert.match(e.movimientos[0].concepto, /ENDESA ENERGIA SA FACTURA 2026-10 CLIENTE 123/)
  assert.match(e.movimientos[1].referencia, /0000000002/)
  // saldo coherente: inicial + Σ movimientos = final
  assert.equal(e.saldoInicial! + e.movimientos.reduce((t, m) => t + m.importe, 0), e.saldoFinal)
})

test('N43: fecha imposible (mes 13) no se inventa; fichero vacío no rompe', () => {
  const malo = N43_EJEMPLO.replace('261103261103', '261303261103')
  assert.equal(parseNorma43(malo)[0].movimientos[0].fechaOperacion, '')
  assert.deepEqual(parseNorma43(''), [])
})

test('importes: formatos españoles y signos, sin float', () => {
  const casos: [string, number | null][] = [
    ['1.234,56', 123456], ['-12,30', -1230], ['12,30-', -1230], ['(45,00)', -4500], ['1234.56', 123456], ['1 234,56 €', 123456],
    ['0,5', 50], ['1.234', 123400], ['1.234.567,8', 123456780], ['', null], ['abc', null], ['1,2,3', null], ['12,345', 1234500],
  ]
  for (const [t, esperado] of casos) assert.equal(importeACentimos(t), esperado, t)
  assert.equal(importeACentimos('0,29'), 29) // 0,29 * 100 en float da 28.999…
})

test('fechas: dd/mm/aaaa, dd-mm-aa, ISO; las inexistentes se rechazan', () => {
  assert.equal(fechaAIso('31/12/2026'), '2026-12-31')
  assert.equal(fechaAIso('1-2-26'), '2026-02-01')
  assert.equal(fechaAIso('2026-02-28'), '2026-02-28')
  assert.equal(fechaAIso('31/02/2026'), null)
  assert.equal(fechaAIso('hola'), null)
})

const CSV = [
  'Fecha operación;Fecha valor;Concepto;Importe;Saldo',
  '03/11/2026;03/11/2026;"RECIBO ENDESA; luz";-45,50;954,50',
  '10/11/2026;11/11/2026;TRANSF. TALLER MARTINEZ;1.210,00;2.164,50',
  '31/02/2026;31/02/2026;FECHA MALA;1,00;0,00',
  '20/11/2026;20/11/2026;COMISION;-3,25;2.161,25',
  '',
].join('\n')

test('CSV: separador ; con comillas, coma decimal, miles con punto; fila mala anotada sin tumbar el fichero', () => {
  const r = parseCsvBanco(CSV, { fecha: 'Fecha operación', fechaValor: 'Fecha valor', concepto: 'Concepto', importe: 'Importe', saldo: 'Saldo' })
  assert.equal(r.separador, ';')
  assert.deepEqual(r.extracto.movimientos.map((m) => m.importe), [-4550, 121000, -325])
  assert.equal(r.extracto.movimientos[0].concepto, 'RECIBO ENDESA; luz')
  assert.equal(r.extracto.movimientos[1].fechaValor, '2026-11-11')
  assert.equal(r.extracto.movimientos[1].saldoPosterior, 216450)
  assert.equal(r.errores.length, 1)
  assert.equal(r.errores[0].linea, 4)
  assert.equal(r.extracto.fechaInicio, '2026-11-03')
  assert.equal(r.extracto.fechaFin, '2026-11-20')
})

test('CSV: dos columnas cargo/abono, tabulador, mapeo por posición sin cabecera', () => {
  const t = ['03/11/2026\tLUZ\t45,50\t', '10/11/2026\tCOBRO\t\t1.210,00'].join('\n')
  const r = parseCsvBanco(t, { cabecera: false, fecha: 0, concepto: 1, cargo: 2, abono: 3 })
  assert.equal(r.separador, '\t')
  assert.deepEqual(r.extracto.movimientos.map((m) => m.importe), [-4550, 121000])
})

test('CSV: mapeo inválido lanza con todos los motivos (columna inexistente, sin importe)', () => {
  assert.throws(() => parseCsvBanco(CSV, { fecha: 'Nada', concepto: 'Concepto' }), /no hay ninguna columna «Nada».*importe/s)
})

test('CSV: sugerencia de mapeo por nombres de cabecera', () => {
  const c = cabecerasCsv(CSV)
  assert.equal(c.separador, ';')
  assert.equal(c.sugerido.fecha, 'Fecha operación')
  assert.equal(c.sugerido.importe, 'Importe')
  assert.equal(c.sugerido.concepto, 'Concepto')
})

test('dedupe: misma huella al reimportar, ordinal solo para repetidos del mismo fichero, otra cuenta = otra huella', () => {
  const [e] = parseNorma43(N43_EJEMPLO)
  const h1 = huellasDeMovimientos('A', e.movimientos)
  const h2 = huellasDeMovimientos('A', e.movimientos)
  assert.deepEqual(h1, h2)
  assert.equal(new Set(h1).size, 3)
  const igual: MovimientoBanco = { ...e.movimientos[0] }
  const hh = huellasDeMovimientos('A', [igual, igual])
  assert.notEqual(hh[0], hh[1]) // dos cafés iguales el mismo día NO se pierden
  assert.equal(hh[0], h1[0])
  assert.notEqual(huellasDeMovimientos('B', e.movimientos)[0], h1[0])
})

const cand = (id: string, sentido: 'cobro' | 'pago', importe: number, fecha: string): Candidato => ({ id, sentido, importe, fecha })
const mov = (id: string, importe: number, fecha: string, concepto = '') => ({ id, importe, fecha, concepto })

test('conciliación: importe exacto, mismo sentido y ventana → propuesta', () => {
  const [p] = proponerConciliacion([mov('m1', 121000, '2026-11-10')], [cand('c1', 'cobro', 121000, '2026-11-02')])
  assert.deepEqual(p, { movimientoId: 'm1', estado: 'propuesta', metodo: 'importe_exacto', candidatoId: 'c1' })
})

test('conciliación: un cargo NO se casa con un cobro pendiente del mismo importe', () => {
  const [p] = proponerConciliacion([mov('m1', -121000, '2026-11-10')], [cand('c1', 'cobro', 121000, '2026-11-02')])
  assert.equal(p.estado, 'sin_candidato')
})

test('conciliación: importe distinto en un céntimo o fuera de ventana → sin candidato', () => {
  assert.equal(proponerConciliacion([mov('m', 121001, '2026-11-10')], [cand('c', 'cobro', 121000, '2026-11-02')])[0].estado, 'sin_candidato')
  assert.equal(proponerConciliacion([mov('m', 121000, '2027-06-10')], [cand('c', 'cobro', 121000, '2026-11-02')])[0].estado, 'sin_candidato')
  assert.equal(proponerConciliacion([mov('m', 121000, '2026-10-20')], [cand('c', 'cobro', 121000, '2026-11-02')])[0].estado, 'sin_candidato')
})

test('conciliación: AMBIGUA con dos partidas del mismo importe → no se propone ninguna', () => {
  const [p] = proponerConciliacion([mov('m1', -50000, '2026-11-10')], [cand('a', 'pago', 50000, '2026-11-01'), cand('b', 'pago', 50000, '2026-11-03')])
  assert.equal(p.estado, 'ambigua')
  assert.deepEqual((p as { candidatosIds: string[] }).candidatosIds, ['a', 'b'])
})

test('conciliación: dos movimientos iguales y UNA partida → ambos ambiguos (nunca dos movimientos a la misma factura)', () => {
  const ps = proponerConciliacion([mov('m1', -50000, '2026-11-10'), mov('m2', -50000, '2026-11-11')], [cand('a', 'pago', 50000, '2026-11-01')])
  assert.deepEqual(ps.map((p) => p.estado), ['ambigua', 'ambigua'])
})

test('conciliación: regla por concepto cuando no hay partida; dos reglas que casan → ambigua; sentido respetado', () => {
  const reglas = [{ id: 'r1', patron: 'comisión mantenimiento', cuenta: '626', sentido: 'cargo' as const }, { id: 'r2', patron: 'mantenimiento', cuenta: '622', sentido: 'ambos' as const }]
  const [a] = proponerConciliacion([mov('m', -325, '2026-11-20', 'COMISION MANTENIMIENTO CUENTA')], [], [reglas[0]])
  assert.deepEqual(a, { movimientoId: 'm', estado: 'propuesta', metodo: 'regla', reglaId: 'r1', cuenta: '626' })
  assert.equal(proponerConciliacion([mov('m', -325, '2026-11-20', 'COMISION MANTENIMIENTO CUENTA')], [], reglas)[0].estado, 'ambigua')
  assert.equal(proponerConciliacion([mov('m', 325, '2026-11-20', 'COMISION MANTENIMIENTO CUENTA')], [], [reglas[0]])[0].estado, 'sin_candidato') // abono ≠ cargo
})

test('conciliación: la partida exacta gana a la regla', () => {
  const [p] = proponerConciliacion([mov('m', -4550, '2026-11-03', 'ENDESA')], [cand('c', 'pago', 4550, '2026-11-01')], [{ id: 'r', patron: 'endesa', cuenta: '628', sentido: 'cargo' }])
  assert.equal(p.estado === 'propuesta' && p.metodo, 'importe_exacto')
})

test('PSD2: sin implementación conectada', async () => {
  assert.equal(await psd2NoConectado.movimientos('x', '2026-01-01'), null)
})
