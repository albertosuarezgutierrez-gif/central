// Propuesta de una oportunidad (08/10/2026): ensamblado PURO. Datos inventados.
// Para verlo en rojo: en `ensamblarPropuesta` cambia `recomendables` por `comparables` (la oferta con errores de
// calidad entraría en el ranking) o quita el `.filter(... === 'ok')` de `trabajosVigentes` (se usarían trabajos fallidos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CondicionGarantia, FichaComparable } from '@central/module-tarificacion'
import { ensamblarPropuesta, jsonPropuesta, ofertasDeTrabajos, perfilDeFormulario, trabajosVigentes, type EntradaPropuesta, type TrabajoParaPropuesta } from './propuesta-oportunidad-reglas.ts'

const HOY = '2026-10-08'
const G = (p: Partial<CondicionGarantia>): CondicionGarantia => ({ literal: null, estado: null, limite: null, sublimites: null, franquicia: null, notas: null, cita: null, pagina: null, origen: 'ia', ...p })

const trabajo = (compania: string, tarif: string, prima: number, extra: { estado?: string; creadoEn?: string; oferta?: Record<string, unknown> } = {}): TrabajoParaPropuesta => ({
  trabajoId: `t-${tarif}`, compania, estado: extra.estado ?? 'ok', creadoEn: extra.creadoEn ?? '2026-10-08T09:00:00Z', tarificacionId: tarif,
  respuesta: { canal: 'rpa', compania, proyectoDocumentoId: null, ofertas: [{ compania, producto: 'Comunidades', primaAnualEur: prima, primaNetaEur: null, desglose: null, validaHasta: '2026-11-30', ...extra.oferta }] },
})
const ficha = (compania: string, estado: 'validada' | 'pendiente' = 'validada'): FichaComparable => ({
  id: `f-${compania}`, compania, ramo: 'comunidades', producto: 'Comunidades', version: null, estado,
  condiciones: { garantias: { incendio: G({ estado: 'incluida' }), rc_general: G({ estado: 'incluida', limite: { tipo: 'importe', eur: 300000 } }) }, extras: [] },
})
const base = (trabajos: TrabajoParaPropuesta[], extra: Partial<EntradaPropuesta> = {}): EntradaPropuesta => ({
  ramo: 'comunidades', cliente: 'Comunidad Los Olivos', referencia: 'OP-1234', formulario: { fechaEfecto: '2026-11-01', ascensor: 'si', anioConstruccion: '1980', capitalContinente: '500000' },
  trabajos, presupuestos: [], fichas: [ficha('Allianz'), ficha('Occident')], hoy: HOY, fecha: new Date('2026-10-08T10:00:00Z'), ...extra,
})

test('sin trabajos ok con precio: sin_ofertas (no un ranking vacío)', () => {
  const r = ensamblarPropuesta(base([trabajo('allianz', 'a', 100, { estado: 'error_definitivo' })]))
  assert.equal(r.estado, 'sin_ofertas')
})

test('de cada compañía vale el último trabajo ok; los fallidos no cuentan', () => {
  const t = [
    trabajo('allianz', 'a1', 900, { creadoEn: '2026-10-01T09:00:00Z' }),
    trabajo('allianz', 'a2', 800, { creadoEn: '2026-10-05T09:00:00Z' }),
    trabajo('allianz', 'a3', 700, { creadoEn: '2026-10-07T09:00:00Z', estado: 'requiere_humano' }),
  ]
  assert.deepEqual(trabajosVigentes(t).map((x) => x.tarificacionId), ['a2'])
  assert.deepEqual(ofertasDeTrabajos(t).map((o) => o.primaAnualEur), [800])
})

test('dos compañías válidas: ranking, recomendada, PDF con cliente solo por nombre y referencia', () => {
  const r = ensamblarPropuesta(base([trabajo('allianz', 'a', 1200), trabajo('occident', 'o', 1000)]))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ranking.length, 2)
  assert.ok(r.recomendada)
  assert.equal(r.recomendada.compania, 'Occident') // mismas coberturas: gana el precio anual más bajo
  assert.equal(r.modelo.cliente, 'Comunidad Los Olivos')
  assert.equal(r.modelo.referencia, 'OP-1234')
  assert.equal(r.modelo.recomendacion?.compania, 'Occident')
  assert.ok(r.ofertas.every((o) => o.recomendable))
  const json = JSON.stringify(jsonPropuesta(r))
  assert.ok(!json.includes('"modelo"'))
  assert.ok(json.includes('"ranking"'))
})

test('oferta con errores de calidad: sale CON aviso y NO se recomienda (aunque sea la más barata)', () => {
  const r = ensamblarPropuesta(base([trabajo('allianz', 'a', 1200), trabajo('occident', 'o', 500, { oferta: { validaHasta: '2026-09-30' } })]))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  const occ = r.ofertas.find((o) => o.compania === 'Occident')!
  assert.equal(occ.recomendable, false)
  assert.ok(occ.calidad.errores.some((e) => e.codigo === 'oferta_caducada'))
  assert.deepEqual(r.ranking.map((x) => x.compania), ['Allianz'])
  assert.equal(r.recomendada?.compania, 'Allianz')
  assert.ok(r.avisos.some((a) => a.includes('Occident') && a.includes('no se recomienda')))
  assert.ok(r.modelo.avisos.some((a) => a.includes('Occident') && a.includes('no la recomendamos')))
  // la oferta con errores sigue en la tabla del documento (con su aviso), no desaparece
  assert.ok(r.modelo.columnas.some((c) => c.compania === 'Occident'))
})

test('el precio es el primer recibo prorrateado: error y no se recomienda', () => {
  const desglose = { anual: { primaNetaEur: 300, impuestosEur: 47, primaTotalEur: 347.55 }, sucesivos: { primaNetaEur: 350, impuestosEur: 0, primaTotalEur: 400 } }
  const r = ensamblarPropuesta(base([trabajo('allianz', 'a', 347.55, { oferta: { desglose } })]))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.ok(r.ofertas[0].calidad.errores.some((e) => e.codigo === 'precio_es_primer_recibo' || e.codigo === 'desglose_incoherente'))
  assert.equal(r.recomendada, null)
})

test('fecha de efecto ya pasada: ninguna se recomienda y se dice', () => {
  const r = ensamblarPropuesta(base([trabajo('allianz', 'a', 1200)], { formulario: { fechaEfecto: '2026-09-01' } }))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.recomendada, null)
  assert.equal(r.ranking.length, 0)
  assert.ok(r.avisos.some((a) => a.includes('no hay recomendación')))
})

test('sin ficha: la oferta sale con aviso de «no constan» y la prima nunca es 0', () => {
  const r = ensamblarPropuesta(base([trabajo('allianz', 'a', 1200)], { fichas: [] }))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.ok(r.ofertas[0].calidad.avisos.some((a) => a.codigo === 'sin_ficha'))
  assert.equal(r.modelo.columnas[0].primaAnualEur, 1200)
})

test('perfil: ascensor/antigüedad/capitales desde el formulario; lo que no consta no suma', () => {
  const p = perfilDeFormulario('comunidades', { fechaEfecto: '2026-11-01', ascensor: 'si', piscina: 'no', anioConstruccion: '1980', capitalContinente: '500.000' }, HOY)
  assert.equal(p.perfil.ascensor, true)
  assert.equal(p.perfil.piscina, undefined)
  assert.equal(p.perfil.antiguedadAnios, 46)
  assert.deepEqual(p.capitalesPedidos, { continente: 500000 })
  assert.equal(p.fechaEfecto, '2026-11-01')
  const vacio = perfilDeFormulario('comunidades', null, HOY)
  assert.deepEqual(vacio, { perfil: {}, capitalesPedidos: {}, fechaEfecto: null })
})
