import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoSinPrimaActual, textoPagasProponemos, vistaCompetencia } from './competencia-oportunidad.ts'

const sa = (o: Record<string, unknown> = {}) => ({
  codigoDgs: null, fechaEfecto: null, aniosSinSiniestros: null, siniestrosUltimos5: null, ...o,
})

test('«pagas X → te proponemos Y» con importes en formato español', () => {
  assert.equal(textoPagasProponemos(1200.5, 1000), 'Pagas 1.200,50€/año → te proponemos 1.000,00€/año (ahorras 200,50€/año, un 16,7 %)')
})

test('sin una de las cifras, no hay texto de ahorro (null), ni 0', () => {
  assert.equal(textoPagasProponemos(null, 1000), null)
  assert.equal(textoPagasProponemos(300, null), null)
  assert.equal(textoPagasProponemos(300, undefined), null)
})

test('propuesta más cara: se dice, sin llamarlo ahorro', () => {
  const t = textoPagasProponemos(300, 330) ?? ''
  assert.match(t, /30,00€\/año más: no es un ahorro/)
  assert.doesNotMatch(t, /ahorras/)
})

test('vista: plurianual de pago único con periodo conocido anualiza y marca prioritaria', () => {
  const v = vistaCompetencia({
    seguroAnterior: sa({ canal: 'RCI BANQUE', pagoUnico: true, fechaEfecto: '2024-03-05', fechaVencimiento: '2027-03-04' }),
    prima: 900, fechaFinVigencia: '2027-03-04', hoy: '2026-10-03',
  })
  assert.equal(v.primaActual.anual, 300)
  assert.match(v.etiquetaPrioritaria ?? '', /Objetivo prioritario: la contrató una financiera · plurianual de pago único/)
  assert.equal(v.aviso.estado, 'programado')
})

test('vista: pago único sin periodo → sin prima actual y se explica; sin vencimiento → desconocido', () => {
  const v = vistaCompetencia({ seguroAnterior: sa({ pagoUnico: true }), prima: 900, fechaFinVigencia: null, hoy: '2026-10-03' })
  assert.equal(v.primaActual.anual, null)
  assert.match(motivoSinPrimaActual(v.primaActual) ?? '', /no se puede anualizar/)
  assert.equal(v.aviso.estado, 'desconocido')
  assert.equal(v.etiquetaPrioritaria, 'Objetivo prioritario: plurianual de pago único')
})

test('vista sin seguro anterior: nada que etiquetar y la prima se toma como anual', () => {
  const v = vistaCompetencia({ seguroAnterior: null, prima: 400, fechaFinVigencia: '2026-11-10', hoy: '2026-10-03' })
  assert.equal(v.etiquetaPrioritaria, null)
  assert.equal(v.primaActual.anual, 400)
  assert.equal(motivoSinPrimaActual(v.primaActual), null)
})

test('para la lista: sin oportunidad o sin prima no se pinta nada; plurianual sin periodo, se explica', async () => {
  const { primaActualParaLista } = await import('./competencia-oportunidad.ts')
  assert.equal(primaActualParaLista(null), null)
  assert.equal(primaActualParaLista({ aseguradora: 'Mapfre', prima: null, seguroAnterior: null }), null)
  assert.deepEqual(primaActualParaLista({ aseguradora: 'Mapfre', prima: 400, seguroAnterior: null }), { anual: 400, motivo: null, compania: 'Mapfre' })
  const p = primaActualParaLista({ aseguradora: 'Mapfre', prima: 900, seguroAnterior: sa({ pagoUnico: true }) })
  assert.equal(p?.anual, null)
  assert.match(p?.motivo ?? '', /no consta el periodo/)
})

test('mismo precio: se dice «mismo precio», no «ahorras 0,00€»', () => {
  const t = textoPagasProponemos(300, 300) ?? ''
  assert.match(t, /mismo precio/)
  assert.doesNotMatch(t, /ahorras/)
})
