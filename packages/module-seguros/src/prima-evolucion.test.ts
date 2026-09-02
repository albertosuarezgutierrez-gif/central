import test from 'node:test'
import assert from 'node:assert/strict'
import { evolucionPrima, inicioCiclo, type ReciboEvolucion } from './prima-evolucion.ts'

const r = (x: Partial<ReciboEvolucion> & { id: string }): ReciboEvolucion => ({
  claseRecibo: 'CA', fechaEfectoInicial: null, fechaEmision: null, situacion: 'cobrado', primaTotal: null, primaNeta: null, ...x,
})

test('evolución: la anualidad va de aniversario a aniversario, no por año natural (semestral 1/10)', () => {
  // Caso real de la cartera: 103,95+103,95 → 118,48+118,48
  const e = evolucionPrima({
    fechaInicio: '2024-10-01',
    fraccionamiento: 'semestral',
    recibos: [
      r({ id: '1', fechaEfectoInicial: '2024-10-01', primaTotal: '103.95' }),
      r({ id: '2', fechaEfectoInicial: '2025-04-01', primaTotal: '103.95' }),
      r({ id: '3', fechaEfectoInicial: '2025-10-01', primaTotal: '118.48' }),
      r({ id: '4', fechaEfectoInicial: '2026-04-01', primaTotal: '118.48' }),
    ],
    siniestros: [],
  })
  assert.equal(e.anualidades.length, 2)
  assert.deepEqual(e.anualidades.map((a) => [a.desde, a.recibos, a.completa, a.primaTotal]), [
    ['2024-10-01', 2, true, 207.9],
    ['2025-10-01', 2, true, 236.96],
  ])
  assert.equal(e.veredicto, 'sube_sin_siniestro')
  assert.equal(e.variacionPct, 14)
  assert.match(e.explicacion, /candidata a retarificar/)
})

test('evolución: el siniestro del ciclo anterior explica la subida; el del ciclo actual no', () => {
  const recibos = [
    r({ id: '1', fechaEfectoInicial: '2025-01-17', primaTotal: '725.03' }),
    r({ id: '2', fechaEfectoInicial: '2026-01-17', primaTotal: '741.40' }),
  ]
  // Caso real: siniestro del 08/02/2026 → cae en el ciclo 2026, después de la renovación
  const sinCulpa = evolucionPrima({ fechaInicio: '2024-01-17', fraccionamiento: 'anual', recibos, siniestros: [{ fechaHora: '2026-02-08', estado: 'cerrado' }] })
  assert.equal(sinCulpa.veredicto, 'sube_sin_siniestro')
  assert.equal(sinCulpa.variacionPct, 2.3)
  assert.match(sinCulpa.explicacion, /actualización general/)
  assert.equal(sinCulpa.anualidades[1].siniestros, 1)

  const conCulpa = evolucionPrima({ fechaInicio: '2024-01-17', fraccionamiento: 'anual', recibos, siniestros: [{ fechaHora: '2025-06-01', estado: 'cerrado' }] })
  assert.equal(conCulpa.veredicto, 'sube_por_siniestros')
  assert.equal(conCulpa.anualidades[0].siniestros, 1)
})

test('evolución: un siniestro sin fecha impide afirmar «sin siniestro»', () => {
  const e = evolucionPrima({
    fechaInicio: '2024-01-17', fraccionamiento: 'anual',
    recibos: [r({ id: '1', fechaEfectoInicial: '2025-01-17', primaTotal: '600' }), r({ id: '2', fechaEfectoInicial: '2026-01-17', primaTotal: '700' })],
    siniestros: [{ fechaHora: null, estado: 'cerrado' }],
  })
  assert.equal(e.veredicto, 'no_atribuible')
  assert.equal(e.siniestrosSinFecha, 1)
})

test('evolución: sin anualidad anterior o con ciclo incompleto es «sin datos», nunca «igual»', () => {
  const una = evolucionPrima({ fechaInicio: '2025-01-17', fraccionamiento: 'anual', recibos: [r({ id: '1', fechaEfectoInicial: '2025-01-17', primaTotal: '600' })], siniestros: [] })
  assert.equal(una.veredicto, 'sin_datos')
  assert.match(una.explicacion, /una anualidad/)

  const incompleta = evolucionPrima({
    fechaInicio: '2024-10-01', fraccionamiento: 'semestral',
    recibos: [
      r({ id: '1', fechaEfectoInicial: '2024-10-01', primaTotal: '100' }), r({ id: '2', fechaEfectoInicial: '2025-04-01', primaTotal: '100' }),
      r({ id: '3', fechaEfectoInicial: '2025-10-01', primaTotal: '110' }),
    ],
    siniestros: [],
  })
  assert.equal(incompleta.veredicto, 'sin_datos')
  assert.match(incompleta.explicacion, /1 de 2/)
  assert.equal(incompleta.anualidades[1].completa, false)

  const ninguno = evolucionPrima({ fechaInicio: '2025-01-17', fraccionamiento: 'anual', recibos: [], siniestros: [] })
  assert.equal(ninguno.veredicto, 'sin_datos')
  assert.equal(ninguno.anualidades.length, 0)

  const sinFracc = evolucionPrima({ fechaInicio: '2024-01-17', fraccionamiento: null, recibos: [r({ id: '1', fechaEfectoInicial: '2025-01-17', primaTotal: '600' }), r({ id: '2', fechaEfectoInicial: '2026-01-17', primaTotal: '700' })], siniestros: [] })
  assert.equal(sinFracc.veredicto, 'sin_datos')
  assert.match(sinFracc.explicacion, /fraccionamiento/)
})

test('evolución: anulados y suplementos no entran en la prima del ciclo; igual y baja se distinguen', () => {
  const e = evolucionPrima({
    fechaInicio: '2024-01-17', fraccionamiento: 'anual',
    recibos: [
      r({ id: '1', fechaEfectoInicial: '2025-01-17', primaTotal: '600' }),
      r({ id: 'x', fechaEfectoInicial: '2025-03-01', primaTotal: '999', situacion: 'anulado' }),
      r({ id: 's', fechaEfectoInicial: '2025-06-01', primaTotal: '40', claseRecibo: 'SU' }),
      r({ id: '2', fechaEfectoInicial: '2026-01-17', primaTotal: '601' }),
    ],
    siniestros: [],
  })
  assert.equal(e.veredicto, 'igual')
  assert.equal(e.anualidades[0].primaTotal, 600)
  assert.equal(e.anualidades[0].suplementos, 1)

  const baja = evolucionPrima({ fechaInicio: '2024-01-17', fraccionamiento: 'anual', recibos: [r({ id: '1', fechaEfectoInicial: '2025-01-17', primaTotal: '600' }), r({ id: '2', fechaEfectoInicial: '2026-01-17', primaTotal: '540' })], siniestros: [] })
  assert.equal(baja.veredicto, 'baja')
  assert.equal(baja.variacionPct, -10)
})

test('evolución: un recibo con efecto unos días antes del aniversario va al ciclo que empieza', () => {
  const inicio = new Date('2024-01-17T00:00:00Z')
  assert.equal(inicioCiclo(inicio, new Date('2026-01-10T00:00:00Z')).toISOString().slice(0, 10), '2026-01-17')
  assert.equal(inicioCiclo(inicio, new Date('2025-12-01T00:00:00Z')).toISOString().slice(0, 10), '2025-01-17')
  assert.equal(inicioCiclo(inicio, new Date('2024-01-17T00:00:00Z')).toISOString().slice(0, 10), '2024-01-17')
})
