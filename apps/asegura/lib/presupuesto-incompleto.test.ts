// 01/11/2026 (AS-26-0042): nunca una columna entera «No figura»; el borrador sin garantías se marca incompleto y avisa a Alberto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararOfertas, type OfertaNormalizada, type ValorGarantia } from '@central/module-seguros'
import { narrativaDeterminista } from './estudio-ia.ts'
import { pdfEstudioOfertas } from './presupuesto-pdf-ofertas.ts'
import { EstudioIncompletoError, leerEstudio, ofertasSinGarantias } from './presupuesto-pdf-cuadro.ts'
import { ofertaConGarantiasDudosas, ofertasSinGarantiasRpa, textoAvisoPresupuestoRpa } from './presupuesto-rpa-reglas.ts'

const v = (p: Partial<ValorGarantia> = {}): ValorGarantia => ({ estado: null, capital: null, limite: null, franquicia: null, ...p })
const oferta = (id: string, garantias: Record<string, ValorGarantia>): OfertaNormalizada =>
  ({ id, rol: 'oferta', compania: id, producto: 'Auto', primaNeta: null, primaTotal: 100, garantias })

test('cuadro: la oferta sin ninguna garantía es la columna entera «No figura» y el PDF no se genera', async () => {
  const ofertas = [oferta('mapfre', {}), oferta('allianz', { continente: v({ estado: 'incluida' }) })]
  const cmp = compararOfertas({ ramo: 'comunidades', ofertas, superficieM2: null })
  assert.deepEqual(ofertasSinGarantias(cmp).map((o) => o.id), ['mapfre'])
  const n = narrativaDeterminista(cmp, null)
  const d = {
    referencia: 'AS-26-0099', cliente: 'X', ramo: 'comunidades', creadoAt: new Date('2026-10-05T10:00:00Z'), venceEl: new Date('2026-11-04T10:00:00Z'), necesidades: null,
    estudio: { recomendadaId: null, actualId: null, comparacion: cmp, narrativa: { resumen: n.resumen, recomendacion: n.recomendacion } },
    mediador: { marca: 'G', nombre: 'M', claveDgsfp: 'CS-F/0000', domicilio: 'Calle 1', email: null },
  }
  await assert.rejects(pdfEstudioOfertas(d as never), EstudioIncompletoError)
  const ok = compararOfertas({ ramo: 'comunidades', ofertas: [oferta('b', { continente: v({ estado: 'incluida' }) })], superficieM2: null })
  assert.deepEqual(ofertasSinGarantias(ok), [])
})

test('reglas: sin coberturas o sin estado → incompleta; con estado → no', () => {
  const r = ofertasSinGarantiasRpa([
    { compania: 'mapfre', producto: 'Auto · TERCEROS', coberturas: [] },
    { compania: 'mapfre', producto: 'Auto · X', coberturas: [{ literal: 'Robo', clave: 'Robo', estado: null }] },
    { compania: 'allianz', producto: 'Auto · Y', coberturas: [{ literal: 'Robo', clave: 'Robo', estado: 'incluida' }] },
  ])
  assert.deepEqual(r.map((o) => o.producto), ['Auto · TERCEROS', 'Auto · X'])
})

test('Telegram: el borrador incompleto lo dice arriba; el completo no', () => {
  const base = { cliente: null, referencia: 'AS-1', ramo: 'auto', companias: ['mapfre'], primas: [100], enlace: 'https://x', narrativa: 'determinista' as const, sinIa: null }
  assert.match(textoAvisoPresupuestoRpa({ ...base, incompletas: [{ compania: 'mapfre', producto: 'Auto · TERCEROS' }] }), /INCOMPLETO.*mapfre · Auto · TERCEROS/)
  assert.doesNotMatch(textoAvisoPresupuestoRpa(base), /INCOMPLETO/)
})

const AVISOS_DUDOSOS = [
  'Garantías posiblemente incompletas: el PDF no trae todas las filas',
  '3 filas de garantías no asignadas a producto',
  'Hay garantías idénticas entre productos de distinto precio',
]

test('garantías dudosas (worker 0.8.46): los tres avisos sí, un aviso cualquiera no', () => {
  for (const a of AVISOS_DUDOSOS) assert.equal(ofertaConGarantiasDudosas(['Precio con supuestos: x', a]), true, a)
  assert.equal(ofertaConGarantiasDudosas(['Precio con supuestos: CP fijado']), false)
  assert.equal(ofertaConGarantiasDudosas(undefined), false)
})

test('reglas: oferta con coberturas pero avisos dudosos → incompleta con motivo; sin avisos → no', () => {
  const cob = [{ literal: 'Robo', clave: 'Robo', estado: 'incluida' }]
  const r = ofertasSinGarantiasRpa([
    { compania: 'mapfre', producto: 'Auto · A', coberturas: cob, avisos: [AVISOS_DUDOSOS[0]!] },
    { compania: 'mapfre', producto: 'Auto · B', coberturas: cob, avisos: [] },
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0]!.producto, 'Auto · A')
  assert.match(r[0]!.motivo ?? '', /garantías dudosas/)
  assert.match(textoAvisoPresupuestoRpa({ cliente: null, referencia: 'AS-1', ramo: 'auto', companias: ['mapfre'], primas: [1], enlace: 'https://x', narrativa: 'determinista', sinIa: null, incompletas: r }), /INCOMPLETO.*garantías dudosas/)
})

test('PDF: un estudio con rpa.incompleto (garantías dudosas) no se pinta como comparativa válida', async () => {
  const cmp = compararOfertas({ ramo: 'comunidades', ofertas: [oferta('b', { continente: v({ estado: 'incluida' }) })], superficieM2: null })
  const n = narrativaDeterminista(cmp, null)
  const json = { recomendadaId: null, actualId: null, comparacion: cmp, narrativa: { resumen: n.resumen, recomendacion: n.recomendacion }, rpa: { incompleto: [{ compania: 'b', producto: 'Auto', motivo: 'x' }] } }
  const estudio = leerEstudio(json)!
  assert.deepEqual(estudio.incompletas, ['b · Auto'])
  const d = { referencia: 'AS-26-0099', cliente: 'X', ramo: 'comunidades', creadoAt: new Date('2026-10-05T10:00:00Z'), venceEl: new Date('2026-11-04T10:00:00Z'), necesidades: null, estudio, mediador: { marca: 'G', nombre: 'M', claveDgsfp: 'CS-F/0000', domicilio: 'Calle 1', email: null } }
  await assert.rejects(pdfEstudioOfertas(d as never), EstudioIncompletoError)
  assert.equal(leerEstudio({ ...json, rpa: {} })!.incompletas, undefined)
})
