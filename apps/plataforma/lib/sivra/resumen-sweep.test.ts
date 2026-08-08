import test from 'node:test'
import assert from 'node:assert/strict'
import {
  barridoFiable,
  midioTemporada,
  clonRatio,
  corpusClonado,
  muestrasPobres,
  MIN_COMPS_VENTANA,
  cegadasEnBase,
  detalleBarrido,
  sinSenalDeTemporada,
  type ResumenBarrido,
  type VentanaMedida,
} from './resumen-sweep.ts'

const ventana = (v: Partial<VentanaMedida> = {}): VentanaMedida => ({
  checkin: '2026-09-04', aforo: 4, ronda: 0, estado: 'comps', comps: 8,
  nombres: ['A', 'B'], mediana: 120, ...v,
})

const base = (v: Partial<ResumenBarrido> = {}): ResumenBarrido => ({
  comps: 0, ventanas: [], eventos: 0, truncadas: 0, baseCompleta: true, errores: [], ...v,
})

test('pasada buena: mide y se puede afirmar', () => {
  const r = base({
    comps: 24,
    ventanas: [
      ventana({ checkin: '2026-09-04' }),
      ventana({ checkin: '2026-10-02', mediana: 180 }),
      ventana({ checkin: '2026-11-06', nombres: ['C'], mediana: 95 }),
    ],
  })
  assert.equal(barridoFiable(r), true)
  assert.equal(detalleBarrido(r), '24 comps en 3 ventanas (0 de evento)')
})

// El caso que motivó el módulo: 44 búsquedas vacías se reportaban como «0 comps» a secas.
test('búsqueda sin resultados NO es «no hay mercado»', () => {
  const r = base({
    ventanas: [ventana({ estado: 'sin_resultados', comps: 0, nombres: [], mediana: null })],
  })
  const d = detalleBarrido(r)
  assert.match(d, /⚠️ 1 búsquedas sin resultados/)
  assert.match(d, /no se ha podido mirar/)
  assert.equal(barridoFiable(r), false)
})

test('«leído y sin precios» sí es una ausencia real: sale sin ⚠️', () => {
  const r = base({
    comps: 5,
    ventanas: [ventana({ comps: 5 }), ventana({ checkin: '2026-10-02', estado: 'sin_precios', comps: 0 })],
  })
  const d = detalleBarrido(r)
  assert.match(d, /1 sin precios \(leídas, no traían cifra\)/)
  assert.doesNotMatch(d, /⚠️/)
  assert.equal(barridoFiable(r), true)
})

test('fallo técnico de la IA cuenta como no leído', () => {
  const r = base({ ventanas: [ventana({ estado: 'sin_leer', comps: 0 })] })
  assert.match(detalleBarrido(r), /⚠️ 1 ventanas que la IA no supo leer/)
  assert.equal(barridoFiable(r), false)
})

test('solo las ventanas de la ronda base cuentan como línea de temporada ciega', () => {
  const ventanas = [
    ventana({ comps: 6 }),
    ventana({ checkin: '2026-10-02', ronda: 2, estado: 'sin_resultados', comps: 0 }),
  ]
  assert.equal(cegadasEnBase(ventanas), 0)
  assert.equal(cegadasEnBase([...ventanas, ventana({ ronda: 0, estado: 'sin_leer', comps: 0 })]), 1)
})

test('un hueco en la ronda base invalida la pasada y lo dice', () => {
  const r = base({
    comps: 6,
    ventanas: [ventana({ comps: 6 }), ventana({ checkin: '2026-10-02', estado: 'sin_resultados', comps: 0 })],
  })
  assert.match(detalleBarrido(r), /1 de la ronda base ciegas/)
  assert.equal(barridoFiable(r), false)
})

test('base incompleta por presupuesto: se dice y no es fiable', () => {
  const r = base({ comps: 9, ventanas: [ventana({ comps: 9 })], truncadas: 7, baseCompleta: false })
  assert.match(detalleBarrido(r), /7 ventanas sin tiempo INCLUIDA la base mensual/)
  assert.equal(barridoFiable(r), false)
})

test('perder solo profundidad de bucket es aceptable', () => {
  const r = base({ comps: 9, ventanas: [ventana({ comps: 9 })], truncadas: 7 })
  assert.match(detalleBarrido(r), /solo profundidad de bucket/)
  assert.equal(barridoFiable(r), true)
})

test('mismos comps y mismo precio en todas las fechas = corpus sin temporada', () => {
  const iguales = ['2026-09-04', '2026-10-02', '2026-11-06'].map(checkin =>
    ventana({ checkin, nombres: ['A', 'B'], mediana: 120 }),
  )
  assert.equal(sinSenalDeTemporada(iguales), true)
  const r = base({ comps: 24, ventanas: iguales })
  assert.match(detalleBarrido(r), /el corpus NO refleja temporada/)
  // El dato no sirve para la curva, pero la pasada SÍ pudo mirar: son dos veredictos distintos.
  assert.equal(midioTemporada(iguales), false)
  assert.equal(barridoFiable(r), true)
})

test('que dos fechas compartan hoteles no basta para gritar', () => {
  const mezcla = [
    ventana({ checkin: '2026-09-04', nombres: ['A', 'B'], mediana: 120 }),
    ventana({ checkin: '2026-10-02', nombres: ['A', 'B'], mediana: 120 }),
    ventana({ checkin: '2026-11-06', nombres: ['A', 'B'], mediana: 155 }),
  ]
  assert.equal(sinSenalDeTemporada(mezcla), false)
})

test('con menos de 3 fechas no se juzga la temporada', () => {
  const pocas = [
    ventana({ checkin: '2026-09-04', nombres: ['A'], mediana: 100 }),
    ventana({ checkin: '2026-10-02', nombres: ['A'], mediana: 100 }),
  ]
  assert.equal(sinSenalDeTemporada(pocas), false)
})

test('sin ninguna ventana con comps no hay señal que juzgar (pero tampoco pasada fiable)', () => {
  const r = base({ ventanas: [ventana({ estado: 'sin_resultados', comps: 0 })] })
  assert.equal(sinSenalDeTemporada(r.ventanas), false)
  assert.equal(barridoFiable(r), false)
})

test('un error suelto invalida la pasada y aparece en el parte', () => {
  const r = base({ comps: 9, ventanas: [ventana({ comps: 9 })], errores: ['2026-09-04 (4p): Serper 429'] })
  assert.match(detalleBarrido(r), /1 fallos: 2026-09-04 \(4p\): Serper 429/)
  assert.equal(barridoFiable(r), false)
})

// ── Calidad del corpus, no solo su presencia (05/08/2026) ───────────────────
// La pasada del 05/08 trajo 62 comps repartidos en 22 ventanas y `sinSenalDeTemporada`
// no saltó, pero 204€ era la mediana de SEIS ventanas distintas, 104€ de cinco y 261€ de
// tres — entre fechas y aforos que no tienen por qué parecerse, con muestras de 1 a 5
// comps. Eso no es un mercado plano: es la consulta abierta devolviendo los mismos
// anuncios genéricos de Sevilla para todo.

test('medianas clonadas entre fechas distintas invalidan el corpus', () => {
  const vs = [
    ventana({ checkin: '2026-09-04', aforo: 2, nombres: ['A'], mediana: 204, comps: 4 }),
    ventana({ checkin: '2026-10-02', aforo: 4, nombres: ['B'], mediana: 204, comps: 4 }),
    ventana({ checkin: '2026-11-06', aforo: 12, nombres: ['C'], mediana: 204, comps: 4 }),
  ]
  assert.equal(clonRatio(vs), 1)
  assert.equal(corpusClonado(vs), true)
  const r = base({ comps: 12, ventanas: vs })
  assert.match(detalleBarrido(r), /100% de las medianas se repiten en otra fecha/)
  assert.equal(midioTemporada(vs), false)
  assert.equal(barridoFiable(r), true)
})

test('un mercado que SÍ varía por fecha pasa la guardia', () => {
  const vs = [
    ventana({ checkin: '2026-09-04', mediana: 204, comps: 4 }),
    ventana({ checkin: '2026-10-02', mediana: 305, comps: 5 }),
    ventana({ checkin: '2026-11-06', mediana: 133, comps: 4 }),
  ]
  assert.equal(corpusClonado(vs), false)
  assert.equal(barridoFiable(base({ comps: 13, ventanas: vs })), true)
})

test('que dos ventanas de la MISMA fecha compartan mediana no cuenta como clon', () => {
  // Dos aforos de la misma fecha pueden coincidir por azar: eso no dice nada del corpus.
  const vs = [
    ventana({ checkin: '2026-09-04', aforo: 2, mediana: 204, comps: 4 }),
    ventana({ checkin: '2026-09-04', aforo: 4, mediana: 204, comps: 4 }),
    ventana({ checkin: '2026-10-02', aforo: 2, mediana: 133, comps: 4 }),
    ventana({ checkin: '2026-11-06', aforo: 2, mediana: 305, comps: 4 }),
  ]
  assert.equal(clonRatio(vs), 0)
  assert.equal(corpusClonado(vs), false)
})

test('con menos de 3 fechas no se juzga el clonado', () => {
  const vs = [
    ventana({ checkin: '2026-09-04', mediana: 204, comps: 4 }),
    ventana({ checkin: '2026-10-02', mediana: 204, comps: 4 }),
  ]
  assert.equal(corpusClonado(vs), false)
})

test('las muestras de 1-2 comps se cantan: su mediana no describe un mercado', () => {
  const r = base({
    comps: 6,
    ventanas: [
      ventana({ checkin: '2026-09-04', mediana: 104, comps: 1 }),
      ventana({ checkin: '2026-10-02', mediana: 305, comps: 2 }),
      ventana({ checkin: '2026-11-06', mediana: 133, comps: 3 }),
    ],
  })
  assert.equal(muestrasPobres(r.ventanas), 2)
  assert.match(detalleBarrido(r), /2 ventanas con menos de 3 comps \(mediana poco fiable\)/)
})

// ── Dos veredictos distintos: el agente y el dato (07/08/2026) ──────────────
// El corpus clonado tumbaba también el latido, y el rojo se volvió permanente: 06 y 07/08 con la
// búsqueda funcionando y `ultimo_ok_at` en NULL desde el primer día. La causa está en la FUENTE
// (los snippets de Google no distinguen la fecha), así que nunca se iba a poner verde. Un vigía
// eternamente rojo no vigila: entrena a ignorarlo y tapa la avería del día que sí la haya.

test('corpus clonado NO apaga el latido: la pasada pudo mirar', () => {
  const vs = ['2026-09-04', '2026-10-02', '2026-11-06'].map(checkin =>
    ventana({ checkin, mediana: 204, comps: 4 }),
  )
  assert.equal(midioTemporada(vs), false, 'el dato no vale para la curva')
  assert.equal(barridoFiable(base({ comps: 12, ventanas: vs })), true, 'pero el agente hizo su trabajo')
})

test('lo que SÍ apaga el latido sigue siendo lo que el agente controla', () => {
  const vs = ['2026-09-04', '2026-10-02', '2026-11-06'].map(checkin =>
    ventana({ checkin, mediana: 204, comps: 4 }),
  )
  // Mismo corpus clonado, pero con una avería encima: eso es un rojo legítimo.
  assert.equal(barridoFiable(base({ comps: 12, ventanas: vs, errores: ['Serper 429'] })), false)
  assert.equal(barridoFiable(base({ comps: 12, ventanas: vs, baseCompleta: false })), false)
  assert.equal(
    barridoFiable(base({ comps: 12, ventanas: [...vs, ventana({ ronda: 0, estado: 'sin_resultados', comps: 0 })] })),
    false,
    'una ventana ciega en la ronda base es «no se ha podido mirar»',
  )
})

test('el parte sigue cantando el clon aunque el latido esté verde', () => {
  // Nombres distintos por ventana: así cae en la rama del CLON (misma mediana en fechas
  // distintas), no en la extrema de `sinSenalDeTemporada`, que tiene su propio titular.
  const vs = ['2026-09-04', '2026-10-02', '2026-11-06'].map((checkin, i) =>
    ventana({ checkin, nombres: [`A${i}`], mediana: 204, comps: 4 }),
  )
  const r = base({ comps: 12, ventanas: vs })
  assert.equal(barridoFiable(r), true)
  assert.match(detalleBarrido(r), /el corpus describe el mercado de HOY, no el de cada fecha/)
})

test('un corpus que distingue la fecha vale para la curva', () => {
  const vs = [
    ventana({ checkin: '2026-09-04', mediana: 204, comps: 4 }),
    ventana({ checkin: '2026-10-02', mediana: 305, comps: 5 }),
    ventana({ checkin: '2026-11-06', mediana: 133, comps: 4 }),
  ]
  assert.equal(midioTemporada(vs), true)
})
