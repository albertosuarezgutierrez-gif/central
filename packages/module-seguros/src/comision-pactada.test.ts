import test from 'node:test'
import assert from 'node:assert/strict'
import { lineasComision, pctRecibo, resolverCuadro, type CuadroFila, type ReciboComision } from './comision-pactada.ts'

const fila = (o: Partial<CuadroFila>): CuadroFila => ({
  companiaCodigo: 'C0109', producto: '1219', productoNombre: 'Auto', modalidad: null, acuerdo: 'directo',
  pctNueva: 12, pctCartera: 12, vigenteDesde: '2026-01-01', fuente: 'test', ...o,
})
const recibo = (o: Partial<ReciboComision>): ReciboComision => ({
  companiaCodigo: 'C0109', producto: '1219', productoNombre: 'Auto', fecha: '2026-06-01', clase: 'CA',
  comision: '12.00', prima: '100.00', ...o,
})

test('pctRecibo: sin prima legible o a cero no hay %', () => {
  assert.equal(pctRecibo({ comision: '12.00', prima: '100.00' }), 12)
  assert.equal(pctRecibo({ comision: '12.00', prima: '0.00' }), null)
  assert.equal(pctRecibo({ comision: '', prima: '100.00' }), null)
  assert.equal(pctRecibo({ comision: '12,00', prima: '100.00' }), null)
})

test('resolverCuadro: vigente = último ya en vigor; próximo = el siguiente comunicado', () => {
  const [e] = resolverCuadro([
    fila({ vigenteDesde: '2025-01-01', pctCartera: 10 }),
    fila({ vigenteDesde: '2026-01-01', pctCartera: 12 }),
    fila({ vigenteDesde: '2026-10-28', pctCartera: 15 }),
  ], '2026-09-28')
  assert.equal(e.vigente?.pctCartera, 12)
  assert.equal(e.proximo?.pctCartera, 15)
})

test('un cuadro solo comunicado (futuro) no es vigente: sin-cuadro, nunca cuadra', () => {
  const [l] = lineasComision([fila({ vigenteDesde: '2026-10-28' })], [recibo({})], '2026-09-28')
  assert.equal(l.veredicto, 'sin-cuadro')
  assert.equal(l.cuadro[0].proximo?.vigenteDesde, '2026-10-28')
})

test('producto con recibos y sin cuadro: sale igual, con su % real', () => {
  const [l] = lineasComision([], [recibo({ comision: '10.00' }), recibo({ comision: '14.00' })], '2026-09-28')
  assert.equal(l.veredicto, 'sin-cuadro')
  assert.deepEqual(l.real, { recibos: 2, pctMin: 10, pctMax: 14, pctMedio: 12 })
})

test('cuadra dentro de la tolerancia y descuadra fuera; NP contra nueva, CA contra cartera', () => {
  const cuadro = [fila({ pctNueva: 15, pctCartera: 12 })]
  const ok = lineasComision(cuadro, [recibo({ clase: 'NP', comision: '15.00' }), recibo({ comision: '12.30' })], '2026-09-28')[0]
  assert.equal(ok.veredicto, 'cuadra')
  const mal = lineasComision(cuadro, [recibo({ clase: 'NP', comision: '12.00' }), recibo({ comision: '12.00' })], '2026-09-28')[0]
  assert.equal(mal.veredicto, 'descuadra')
  assert.equal(mal.fuera, 1)
})

test('los recibos anteriores al cuadro vigente no se comparan con él', () => {
  const [l] = lineasComision([fila({ vigenteDesde: '2026-07-01' })], [recibo({ fecha: '2026-06-01', comision: '8.00' })], '2026-09-28')
  assert.equal(l.veredicto, 'sin-recibos')
})

test('suplementos solos no dan veredicto', () => {
  const [l] = lineasComision([fila({})], [recibo({ clase: 'SU', comision: '1.00' })], '2026-09-28')
  assert.equal(l.veredicto, 'sin-recibos')
})

test('modalidades a % distintos: por-modalidad, sin veredicto', () => {
  const [l] = lineasComision([
    fila({ modalidad: 'RC Vida privada', pctNueva: 22.5, pctCartera: 22.5 }),
    fila({ modalidad: 'Varios', pctNueva: 17.5, pctCartera: 17.5 }),
  ], [recibo({ comision: '17.50' })], '2026-09-28')
  assert.equal(l.veredicto, 'por-modalidad')
  assert.equal(l.fuera, 0)
})

test('asociación vigente: se compara contra ella y sale el extra sobre el directo', () => {
  const [l] = lineasComision([
    fila({ pctNueva: 12, pctCartera: 12 }),
    fila({ acuerdo: 'Asociación X', pctNueva: 14, pctCartera: 13.5 }),
  ], [recibo({ comision: '12.00' })], '2026-09-28')
  assert.deepEqual(l.acuerdosAplicados, ['Asociación X'])
  assert.deepEqual(l.extras, [{ modalidad: null, acuerdo: 'Asociación X', puntosNueva: 2, puntosCartera: 1.5 }])
  assert.equal(l.veredicto, 'descuadra')
})

test('una asociación que solo cubre una modalidad no desplaza al directo de las demás', () => {
  const [l] = lineasComision([
    fila({ modalidad: 'A', pctNueva: 12, pctCartera: 12 }),
    fila({ modalidad: 'B', pctNueva: 12, pctCartera: 12 }),
    fila({ modalidad: 'A', acuerdo: 'Asociación X', pctNueva: 14, pctCartera: 14 }),
  ], [recibo({ comision: '12.00' })], '2026-09-28')
  assert.deepEqual(l.acuerdosAplicados, ['Asociación X', 'directo'])
  // Con B al 12 % del directo y A al 14 % de la asociación, el recibo no dice de cuál es: nunca «descuadra».
  assert.equal(l.veredicto, 'por-modalidad')
})

test('dos asociaciones vigentes en la misma modalidad: sin veredicto', () => {
  const [l] = lineasComision([
    fila({ acuerdo: 'Asociación X', pctCartera: 14 }),
    fila({ acuerdo: 'Asociación Y', pctCartera: 13 }),
  ], [recibo({ comision: '14.00' })], '2026-09-28')
  assert.equal(l.veredicto, 'varios-acuerdos')
})
