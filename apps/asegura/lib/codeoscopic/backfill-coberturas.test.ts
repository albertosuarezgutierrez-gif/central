// Backfill de coberturas de los precios viejos, con BD y vendor doblados. `node --test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  backfillCoberturasTarificacion, ofertaDeFila, ofertaParaOpciones, opcionesDeOferta, pasadaBackfillCoberturas, planOfertas,
  type CabeceraBackfill, type DepsBackfill, type FilaSinOferta, type ResumenBackfill,
} from './backfill-coberturas.ts'
import type { Precio } from './respuesta.ts'

const precio = (o: Partial<Precio>): Precio =>
  ({ compania: 'Allianz', producto: 'Auto Plus', modalidad: null, primaEur: 300, referenciaVendor: null, ofertaId: null, ...o }) as Precio
const fila = (o: Partial<FilaSinOferta>): FilaSinOferta =>
  ({ id: 'f1', compania: 'Allianz', producto: 'Auto Plus', modalidad: null, primaEur: 300, referenciaVendor: null, ...o })

test('ofertaDeFila: por referencia del vendor, y si no por compañía + producto + prima', () => {
  const precios = [
    precio({ referenciaVendor: 'R-1', ofertaId: 'of-1', primaEur: 999 }),
    precio({ compania: 'Mapfre', producto: 'Coche', primaEur: 250.1, ofertaId: 'of-2' }),
  ]
  assert.equal(ofertaDeFila(fila({ referenciaVendor: 'R-1' }), precios), 'of-1')
  assert.equal(ofertaDeFila(fila({ compania: ' MAPFRE ', producto: 'coche', primaEur: 250.1 }), precios), 'of-2')
  // Un céntimo de diferencia ya es otro precio: no se casa.
  assert.equal(ofertaDeFila(fila({ compania: 'Mapfre', producto: 'Coche', primaEur: 250.11 }), precios), null)
})

test('ofertaDeFila: empate → desempata por modalidad; empate también ahí → null (nunca adivina)', () => {
  const precios = [
    precio({ modalidad: 'Anual', ofertaId: 'of-a' }),
    precio({ modalidad: 'Semestral', ofertaId: 'of-s' }),
  ]
  assert.equal(ofertaDeFila(fila({ modalidad: 'semestral' }), precios), 'of-s')
  assert.equal(ofertaDeFila(fila({ modalidad: null }), precios), null)
  const gemelos = [precio({ modalidad: 'Anual', ofertaId: 'of-a' }), precio({ modalidad: 'Anual', ofertaId: 'of-b' })]
  assert.equal(ofertaDeFila(fila({ modalidad: 'Anual' }), gemelos), null)
})

test('planOfertas: casada con oferta → asignar; casada sin oferta o sin casar → sinOferta', () => {
  const precios = [precio({ referenciaVendor: 'R-1', ofertaId: 'of-1' }), precio({ referenciaVendor: 'R-2', ofertaId: null, primaEur: 1 })]
  const plan = planOfertas([
    fila({ id: 'a', referenciaVendor: 'R-1' }),
    fila({ id: 'b', referenciaVendor: 'R-2', primaEur: 1 }),
    fila({ id: 'c', compania: 'Nadie', referenciaVendor: null }),
  ], precios)
  assert.deepEqual(plan, { asignar: [{ id: 'a', ofertaId: 'of-1' }], sinOferta: ['b', 'c'] })
})

type Marca = { ids: string[]; estado: string; lista: unknown }
function doble(o: { cab?: CabeceraBackfill | null; filas?: FilaSinOferta[]; precios?: Precio[] | Error; sinVendor?: boolean }) {
  const asignadas: { id: string; ofertaId: string }[] = []
  const marcas: Marca[] = []
  let completadas = 0
  let refrescos = 0
  const deps: DepsBackfill = {
    cabecera: async () => (o.cab === undefined ? { simulado: false, projectId: 'P1', ramo: 'auto' } : o.cab),
    sinOferta: async () => o.filas ?? [],
    refrescar: o.sinVendor ? null : async () => {
      refrescos++
      if (o.precios instanceof Error) throw o.precios
      return o.precios ?? []
    },
    asignarOferta: async (id, ofertaId) => { asignadas.push({ id, ofertaId }); return 1 },
    marcar: async (ids, sobre) => { marcas.push({ ids, estado: sobre.estado, lista: sobre.lista }); return ids.length },
    completar: async () => { completadas++; return { leidas: 2, fallos: 0, sinOferta: 0, sinIntentar: 0 } },
  }
  return { deps, asignadas, marcas, get completadas() { return completadas }, get refrescos() { return refrescos } }
}
const IDS = { correduriaId: 'c', tarificacionId: 't' }

test('backfill: escribe la oferta recuperada, marca sin_oferta lo que no casa y luego completa', async () => {
  const d = doble({
    filas: [fila({ id: 'a', referenciaVendor: 'R-1' }), fila({ id: 'b', compania: 'Nadie' })],
    precios: [precio({ referenciaVendor: 'R-1', ofertaId: 'of-1' })],
  })
  const r = await backfillCoberturasTarificacion(IDS, d.deps)
  assert.deepEqual(d.asignadas, [{ id: 'a', ofertaId: 'of-1' }])
  assert.deepEqual(d.marcas, [{ ids: ['b'], estado: 'sin_oferta', lista: null }])
  assert.equal(d.completadas, 1)
  assert.equal(d.refrescos, 1, 'el proyecto se relee UNA vez por tarificación')
  assert.equal(r.ofertasRecuperadas, 1)
  assert.equal(r.sinOferta, 1)
  assert.equal(r.completar?.leidas, 2)
})

test('backfill: si releer el proyecto falla, las filas sin oferta pasan a `fallo` con lista null (nunca [])', async () => {
  const d = doble({ filas: [fila({ id: 'a' })], precios: new Error('503') })
  const r = await backfillCoberturasTarificacion(IDS, d.deps)
  assert.deepEqual(d.marcas, [{ ids: ['a'], estado: 'fallo', lista: null }])
  assert.equal(r.falloProyecto, 1)
  assert.equal(d.asignadas.length, 0)
})

test('backfill: sin filas sin oferta no relee el proyecto (solo completa)', async () => {
  const d = doble({ filas: [] })
  await backfillCoberturasTarificacion(IDS, d.deps)
  assert.equal(d.refrescos, 0)
  assert.equal(d.completadas, 1)
})

test('backfill: simulada, sin proyecto o sin vendor → no toca NADA (las filas siguen a NULL)', async () => {
  for (const [o, omitido] of [
    [{ cab: { simulado: true, projectId: 'P', ramo: 'auto' } }, 'simulada'],
    [{ cab: { simulado: false, projectId: null, ramo: 'auto' } }, 'sin_proyecto'],
    [{ cab: null }, 'no_existe'],
    [{ sinVendor: true }, 'sin_vendor'],
  ] as const) {
    const d = doble({ ...o, filas: [fila({ id: 'a' })] })
    const r = await backfillCoberturasTarificacion(IDS, d.deps)
    assert.equal(r.omitido, omitido)
    assert.equal(d.marcas.length + d.asignadas.length + d.completadas, 0, `${omitido}: no escribe`)
  }
})

test('backfill: nunca lanza (un fallo de BD es `omitido: error`)', async () => {
  const d = doble({ filas: [fila({ id: 'a' })], precios: [] })
  d.deps.marcar = async () => { throw new Error('bd caída') }
  const r = await backfillCoberturasTarificacion(IDS, d.deps)
  assert.equal(r.omitido, 'error')
})

test('pasada: de una en una, suma los resúmenes y corta si no hay vendor', async () => {
  const vistas: string[] = []
  const base: ResumenBackfill = { ofertasRecuperadas: 1, sinOferta: 0, falloProyecto: 0, completar: { leidas: 3, fallos: 1, sinOferta: 0, sinIntentar: 0 } }
  const total = await pasadaBackfillCoberturas('c', { limite: 5 }, {
    candidatas: async (_c, limite) => { assert.equal(limite, 5); return ['t1', 't2', 't3'] },
    backfill: async ({ tarificacionId }) => {
      vistas.push(tarificacionId)
      return tarificacionId === 't2' ? { ...base, completar: null, ofertasRecuperadas: 0, omitido: 'sin_vendor' } : base
    },
  })
  assert.deepEqual(vistas, ['t1', 't2'])
  assert.equal(total.tarificaciones, 2)
  assert.equal(total.ofertasRecuperadas, 1)
  assert.equal(total.coberturasLeidas, 3)
  assert.equal(total.coberturasFallo, 1)
  assert.equal(total.sinTiempo, 1)
  assert.deepEqual(total.omitidas, { sin_vendor: 1 })
})

test('pasada: sin presupuesto de tiempo no empieza ninguna', async () => {
  let llamadas = 0
  const total = await pasadaBackfillCoberturas('c', { presupuestoMs: 1_000 }, {
    candidatas: async () => ['t1', 't2'],
    backfill: async () => { llamadas++; return { ofertasRecuperadas: 0, sinOferta: 0, falloProyecto: 0, completar: null } },
  })
  assert.equal(llamadas, 0)
  assert.equal(total.sinTiempo, 2)
})

const ASIST = [{ etiqueta: 'Asistencia en viaje', valor: 'Estándar' }]
const OFERTA = { mainQuote: { product: { formattedOptions: [{ label: 'Asistencia en viaje', formattedValue: 'Estándar' }] } } }

test('ofertaParaOpciones: la guardada manda; si no, la del precio casado; relectura fallida → fallo', () => {
  assert.equal(ofertaParaOpciones(fila({ ofertaId: 'of-9' }), null), 'of-9')
  assert.equal(ofertaParaOpciones(fila({ referenciaVendor: 'R-1' }), [precio({ referenciaVendor: 'R-1', ofertaId: 'of-1' })]), 'of-1')
  assert.equal(ofertaParaOpciones(fila({ compania: 'Nadie' }), [precio({ ofertaId: 'of-1' })]), null)
  assert.equal(ofertaParaOpciones(fila({}), null), 'fallo')
})

test('opcionesDeOferta: lee mainQuote.product.formattedOptions; sin ellas, null (no [])', () => {
  assert.deepEqual(opcionesDeOferta(OFERTA), ASIST)
  assert.equal(opcionesDeOferta({ mainQuote: { product: {} } }), null)
  assert.equal(opcionesDeOferta(null), null)
})

test('backfill: opciones desde la oferta, una lectura por oferta, sin releer el proyecto si ya hay oferta', async () => {
  const d = doble({ filas: [] })
  const escritas: { id: string; estado: string; lista: unknown }[] = []
  const lecturas: string[] = []
  d.deps.sinOpciones = async () => [fila({ id: 'a', ofertaId: 'of-1' }), fila({ id: 'b', ofertaId: 'of-1' }), fila({ id: 'c', ofertaId: 'of-2' })]
  d.deps.leerOferta = async (_p, o) => { lecturas.push(o); if (o === 'of-2') throw new Error('503'); return OFERTA }
  d.deps.escribirOpciones = async (id, sobre) => { escritas.push({ id, estado: sobre.estado, lista: sobre.lista }); return 1 }
  const r = await backfillCoberturasTarificacion(IDS, d.deps)
  assert.equal(d.refrescos, 0, 'con oferta guardada no se relee el proyecto')
  assert.deepEqual(lecturas, ['of-1', 'of-2'])
  assert.deepEqual(escritas, [
    { id: 'a', estado: 'leidas', lista: ASIST }, { id: 'b', estado: 'leidas', lista: ASIST }, { id: 'c', estado: 'fallo', lista: null },
  ])
  assert.equal(r.opciones, 3)
})

test('backfill: sin oferta guardada relee el proyecto para encontrarla; sin casar → sin_precio', async () => {
  const d = doble({ filas: [], precios: [precio({ referenciaVendor: 'R-1', ofertaId: 'of-1' })] })
  const escritas: { id: string; estado: string }[] = []
  d.deps.sinOpciones = async () => [fila({ id: 'a', referenciaVendor: 'R-1' }), fila({ id: 'z', compania: 'Nadie' })]
  d.deps.leerOferta = async () => OFERTA
  d.deps.escribirOpciones = async (id, sobre) => { escritas.push({ id, estado: sobre.estado }); return 1 }
  await backfillCoberturasTarificacion(IDS, d.deps)
  assert.equal(d.refrescos, 1)
  assert.deepEqual(escritas, [{ id: 'a', estado: 'leidas' }, { id: 'z', estado: 'sin_precio' }])
})
