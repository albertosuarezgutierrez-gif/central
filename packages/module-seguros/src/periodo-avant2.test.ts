// 🪤 Tarificaciones de Avant2 anteriores al 29/09/2026 (`meses` NULL, 21/10/2026): no se tratan como anuales a ciegas.
// Solo cuenta como anual la que la PROPIA compañía dice de un año exacto (efecto y término), y se marca.
// Para verlo en rojo: en `periodoDeAvant2`, devuelve `meses: 12` también cuando `meses` es null y no hay fechas
// → falla «sin fechas»; o en `periodoEnAvisos` acepta cualquier término ≥ 360 días → falla «361 días».
import test from 'node:test'
import assert from 'node:assert/strict'
import { ofertaDeAvant2, periodoDeAvant2, periodoEnAvisos, seleccionarAvant2, type PrecioAvant2 } from './ofertas-fuentes.ts'
import { compararOfertas } from './comparar-ofertas.ts'

const precio = (p: Partial<PrecioAvant2> & { id: string }): PrecioAvant2 => ({
  compania: 'Compañía A', producto: 'Hogar Uno', modalidad: null, categoria: 'Básico', primaEur: 300, franquiciaEur: null,
  firmeza: 'estimado', frecuenciaPago: null, meses: null, garantias: null, ...p,
})
const obs = (ef: string, te: string) => `Observaciones de la compañía: Prima calculada con fecha de efecto : ${ef} y fecha de término : ${te}`

test('un año exacto en las observaciones de la compañía → 12 meses, deducido y dicho', () => {
  assert.deepEqual(periodoEnAvisos([obs('05/12/2026', '05/12/2027')]), { efecto: '05/12/2026', termino: '05/12/2027', doceMeses: true })
  assert.equal(periodoEnAvisos([obs('05/12/2026', '04/12/2027')])?.doceMeses, true) // la víspera también es un año
  const o = ofertaDeAvant2(precio({ id: 'a', avisos: [obs('05/12/2026', '05/12/2027')] }), 'hogar')
  assert.equal(o.primaTotal, 300)
  assert.ok(o.avisos?.some((a) => /Periodo anual tomado de las fechas que da la compañía/.test(a)), String(o.avisos))
  assert.equal(o.primaPeriodo, undefined)
})

test('🪤 361 días NO es un año: sin prima comparable, con su precio y su periodo a la vista', () => {
  const p = periodoDeAvant2({ meses: null, avisos: [obs('05/12/2026', '01/12/2027')] })
  assert.deepEqual(p, { meses: null, deducido: false, fechas: { efecto: '05/12/2026', termino: '01/12/2027' } })
  const o = ofertaDeAvant2(precio({ id: 'b', primaEur: 291.24, avisos: [obs('05/12/2026', '01/12/2027')] }), 'hogar')
  assert.equal(o.primaTotal, null)
  assert.deepEqual(o.primaPeriodo, { importe: 291.24, meses: null })
  assert.ok(o.avisos?.some((a) => /no es un año exacto/.test(a)))
  const r = compararOfertas({ ramo: 'hogar', ofertas: [o] })
  assert.equal(r.ranking?.puestos[0]?.posicion, null)
})

test('🪤 sin fechas (o con dos periodos distintos) sigue «no declarado»: nunca anual supuesto', () => {
  assert.deepEqual(periodoDeAvant2({ meses: null, avisos: ['Pendiente de aceptación: la póliza quedará bloqueada'] }), { meses: null, deducido: false, fechas: null })
  assert.deepEqual(periodoDeAvant2({ meses: null, avisos: null }), { meses: null, deducido: false, fechas: null })
  assert.equal(periodoEnAvisos([obs('05/12/2026', '05/12/2027'), obs('01/01/2027', '01/01/2028')]), null)
  assert.equal(periodoEnAvisos([obs('31/02/2026', '31/02/2027')]), null) // fecha imposible
  const o = ofertaDeAvant2(precio({ id: 'c', avisos: [] }), 'hogar')
  assert.equal(o.primaTotal, null)
  assert.ok(o.avisos?.some((a) => /no declarado/.test(a)))
})

test('el `meses` guardado manda sobre las observaciones', () => {
  assert.deepEqual(periodoDeAvant2({ meses: 6, avisos: [obs('05/12/2026', '05/12/2027')] }), { meses: 6, deducido: false, fechas: null })
  assert.equal(ofertaDeAvant2(precio({ id: 'd', meses: 6, avisos: [obs('05/12/2026', '05/12/2027')] }), 'hogar').primaTotal, null)
})

test('selección: el deducido anual cuenta como anual frente al no declarado', () => {
  const ps = [
    precio({ id: 'nulo', primaEur: 200 }),
    precio({ id: 'deducido', primaEur: 250, avisos: [obs('10/04/2027', '10/04/2028')] }),
  ]
  assert.deepEqual(seleccionarAvant2(ps).map((p) => p.id), ['deducido'])
})
