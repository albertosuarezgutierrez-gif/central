// 01/11/2026 (AS-26-0042): nunca una columna entera «No figura»; el borrador sin garantías se marca incompleto y avisa a Alberto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararOfertas, type OfertaNormalizada, type ValorGarantia } from '@central/module-seguros'
import { narrativaDeterminista } from './estudio-ia.ts'
import { pdfEstudioOfertas } from './presupuesto-pdf-ofertas.ts'
import { EstudioIncompletoError, ofertasSinGarantias } from './presupuesto-pdf-cuadro.ts'
import { ofertasSinGarantiasRpa, textoAvisoPresupuestoRpa } from './presupuesto-rpa-reglas.ts'

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
