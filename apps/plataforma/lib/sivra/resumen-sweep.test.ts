import test from 'node:test'
import assert from 'node:assert/strict'
import {
  barridoFiable,
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
  assert.equal(barridoFiable(r), false)
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
