import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimar, mereceLaPena, MESES_MAXIMOS, type Caso } from './horquilla.ts'

const HOY = '2026-09-02'

// Casas inventadas. Ningún cliente real aquí.
const caso = (p: Partial<Caso> & { primaEur: number }): Caso => ({
  fecha: '2026-08-01',
  origen: 'cartera',
  compania: null,
  metrosCuadrados: 80,
  anioConstruccion: 1995,
  capitalContinente: 60000,
  ...p,
})

const PISO = { metrosCuadrados: 80, anioConstruccion: 1995, capitalContinente: 60000 }

test('sin casos no hay horquilla, y se dice que es por no tener ninguno', () => {
  const e = estimar([], PISO, HOY)
  assert.equal(e.horquilla, null)
  assert.equal(e.casos, 0)
  assert.match(e.sinBase!, /ningún caso/)
})

test('🚨 «no tengo casos» y «los que tengo han caducado» son motivos DISTINTOS', () => {
  const viejos = [
    caso({ primaEur: 300, fecha: '2023-01-10' }),
    caso({ primaEur: 320, fecha: '2023-02-10' }),
    caso({ primaEur: 340, fecha: '2023-03-10' }),
  ]
  const e = estimar(viejos, PISO, HOY)
  assert.equal(e.horquilla, null)
  // El motivo tiene que delatar que SÍ hay datos pero ya no valen: si dijera
  // «no hay ninguno», nadie iría a mirar por qué la cartera parece vacía.
  assert.match(e.sinBase!, new RegExp(`más de ${MESES_MAXIMOS} meses`))
  assert.match(e.sinBase!, /3 casos/)
})

test('con tres casos parecidos sale la horquilla, con su mínimo, mediana y máximo', () => {
  const e = estimar(
    [caso({ primaEur: 200 }), caso({ primaEur: 300 }), caso({ primaEur: 400 })],
    PISO,
    HOY,
  )
  assert.deepEqual(e.horquilla, { minEur: 200, medianaEur: 300, maxEur: 400 })
  assert.equal(e.base, 'parecidos')
  assert.equal(e.casos, 3)
  assert.equal(e.desde, '2026-08-01')
  assert.equal(e.hasta, '2026-08-01')
})

test('con menos de tres casos NO se inventa una horquilla', () => {
  const e = estimar([caso({ primaEur: 200 }), caso({ primaEur: 400 })], PISO, HOY)
  assert.equal(e.horquilla, null)
  assert.match(e.sinBase!, /2 casos recientes/)
})

test('sin casos parecidos degrada a toda la cartera, pero lo confiesa', () => {
  // Chalets de 400 m² frente a un piso de 80: no se parecen en nada.
  const chalets = [
    caso({ primaEur: 900, metrosCuadrados: 400 }),
    caso({ primaEur: 1000, metrosCuadrados: 420 }),
    caso({ primaEur: 1100, metrosCuadrados: 380 }),
  ]
  const e = estimar(chalets, PISO, HOY)
  assert.notEqual(e.horquilla, null)
  assert.equal(e.base, 'toda-la-cartera')
  assert.match(e.etiqueta, /toda la cartera/)
})

test('🚨 un caso al que le falta el dato NO se descarta: no saber no es «no se parece»', () => {
  const sinMetros = [
    caso({ primaEur: 200, metrosCuadrados: null }),
    caso({ primaEur: 300, metrosCuadrados: null }),
    caso({ primaEur: 400, metrosCuadrados: null }),
  ]
  const e = estimar(sinMetros, PISO, HOY)
  assert.equal(e.base, 'parecidos')
  assert.equal(e.casos, 3)
})

test('con ocho o más casos el caso raro no manda: se recortan los extremos', () => {
  const muchos = [100, 200, 200, 300, 300, 400, 500, 9000].map((primaEur) => caso({ primaEur }))
  const e = estimar(muchos, PISO, HOY)
  // El outlier de 9.000€ y el de 100€ quedan fuera del rango que se enseña…
  assert.deepEqual(e.horquilla, { minEur: 200, medianaEur: 300, maxEur: 500 })
  // …pero siguen contando como casos: se recorta el rango, no se oculta la muestra.
  assert.equal(e.casos, 8)
})

test('🚨 la etiqueta siempre dice que es orientativa, en cuántos casos y en euros españoles', () => {
  const e = estimar(
    [caso({ primaEur: 200 }), caso({ primaEur: 300 }), caso({ primaEur: 2000 })],
    PISO,
    HOY,
  )
  assert.match(e.etiqueta, /orientativa/)
  assert.match(e.etiqueta, /no es un precio/)
  assert.match(e.etiqueta, /3 casos/)
  // Formato español: miles con punto, decimales con coma, € detrás.
  assert.match(e.etiqueta, /2\.000,00€/)
  assert.equal(e.orientativa, true)
})

test('la estimación sin horquilla también lleva etiqueta: nunca se pinta un hueco mudo', () => {
  const e = estimar([], PISO, HOY)
  assert.ok(e.etiqueta.length > 0)
  assert.equal(e.etiqueta, e.sinBase)
})

// ─── ¿Merece la pena gastar los 0,50€? ───────────────────────────────────────

const conHorquilla = (min: number, med: number, max: number) =>
  estimar(
    [caso({ primaEur: min }), caso({ primaEur: med }), caso({ primaEur: max })],
    PISO,
    HOY,
  )

test('sin saber lo que paga hoy, el veredicto es «no se sabe», nunca una recomendación', () => {
  const r = mereceLaPena(null, conHorquilla(200, 300, 400))
  assert.equal(r.veredicto, 'no-se')
  assert.match(r.porque, /no sabemos lo que paga hoy/i)
})

test('sin horquilla el veredicto es «no se sabe», y arrastra el porqué de la estimación', () => {
  const e = estimar([], PISO, HOY)
  const r = mereceLaPena(300, e)
  assert.equal(r.veredicto, 'no-se')
  assert.equal(r.porque, e.sinBase)
})

test('paga más que el caso más caro que hemos visto → merece la pena gastar', () => {
  const r = mereceLaPena(500, conHorquilla(150, 175, 200))
  assert.equal(r.veredicto, 'merece')
  assert.match(r.porque, /500,00€/)
})

test('paga menos que el caso más barato → no hay negocio, no se gasta', () => {
  const r = mereceLaPena(100, conHorquilla(200, 300, 400))
  assert.equal(r.veredicto, 'no-merece')
})

test('el ejemplo del diseño: paga 250€ con una horquilla de 240€ a 320€ → no se gasta', () => {
  const r = mereceLaPena(250, conHorquilla(240, 280, 320))
  assert.equal(r.veredicto, 'no-merece')
  assert.match(r.porque, /mediana/)
})

test('el otro ejemplo: paga 250€ con una horquilla de 150€ a 200€ → sí se gasta', () => {
  const r = mereceLaPena(250, conHorquilla(150, 175, 200))
  assert.equal(r.veredicto, 'merece')
})

test('🚨 pegado a la mediana no nos mojamos: una moneda al aire no es una recomendación', () => {
  const r = mereceLaPena(295, conHorquilla(200, 300, 400))
  assert.equal(r.veredicto, 'no-se')
  assert.match(r.porque, /podría salir a favor o en contra/)
})
