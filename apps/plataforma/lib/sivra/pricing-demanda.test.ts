import test from 'node:test'
import assert from 'node:assert/strict'
import {
  factorDemanda, ocupacionEsInformativa, factorDemandaDeLaFecha,
  DEMANDA_MIN, DEMANDA_MAX, MIN_MUESTRA_ANTELACION,
} from './pricing-demanda.ts'

// El caso real que motivó todo esto (08/08/2026): los 4 pisos de SIVRA al 1-8% de ocupación ANUAL
// —cifra correcta, contrastada contra las reservas de Smoobu— mandaban el factor de demanda al suelo
// en TODAS las fechas. Septiembre al 30% recibía el mismo castigo que marzo de 2027 al 0%.

test('factorDemanda: por encima del baseline sube, por debajo baja, y respeta suelo y techo', () => {
  assert.equal(factorDemanda({ ocupacion: 0.5, baseline: 0.5, k: 0.4 }), 1)
  assert.ok(factorDemanda({ ocupacion: 0.7, baseline: 0.5, k: 0.4 }) > 1)
  assert.ok(factorDemanda({ ocupacion: 0.3, baseline: 0.5, k: 0.4 }) < 1)
  // clamps: con k grande se sale por los dos lados y tiene que quedarse en el borde
  assert.equal(factorDemanda({ ocupacion: 1, baseline: 0, k: 10 }), DEMANDA_MAX)
  assert.equal(factorDemanda({ ocupacion: 0, baseline: 1, k: 10 }), DEMANDA_MIN)
})

test('sin antelación medida no se decide nada: null = «usa la global»', () => {
  assert.equal(ocupacionEsInformativa({ diasVista: 10, antelacion: null }), null)
})

test('con muestra por debajo del mínimo tampoco: una mediana de 2 reservas no describe un mes', () => {
  assert.equal(
    ocupacionEsInformativa({ diasVista: 10, antelacion: { mediana: 30, muestra: MIN_MUESTRA_ANTELACION - 1 } }),
    null,
  )
})

test('dentro y fuera de la ventana de venta (FACTOR_VENTANA = 2 × la mediana)', () => {
  const antelacion = { mediana: 30, muestra: 20 }
  assert.equal(ocupacionEsInformativa({ diasVista: 10, antelacion }), true)   // ya se vende
  assert.equal(ocupacionEsInformativa({ diasVista: 60, antelacion }), true)   // justo en el borde
  assert.equal(ocupacionEsInformativa({ diasVista: 61, antelacion }), false)  // aún no toca
  assert.equal(ocupacionEsInformativa({ diasVista: 300, antelacion }), false)
})

// A partir de aquí, los números son los de PRODUCCIÓN el 08/08/2026 (`pricing_settings`):
// demand_baseline = 0,50 y demand_k = 0,16 en los cuatro pisos. Con k = 0,16 el suelo (0,92) solo se
// toca por debajo del ~0% de ocupación, así que hay recorrido real entre el 6% anual y el 30% de
// septiembre — con un k inventado más grande ambos saturarían y el arreglo parecería inerte.
const REAL = { baseline: 0.5, k: 0.16 }

test('🚨 el mes lejano NO se castiga: un 0% que nadie ha podido reservar da factor NEUTRO', () => {
  // Marzo de 2027 visto desde agosto de 2026: 0% de ocupación, pero es que aún no se vende.
  const r = factorDemandaDeLaFecha({
    diasVista: 220, ocupacionMes: 0, ocupacionGlobal: 0.06,
    antelacion: { mediana: 24, muestra: 39 }, ...REAL,
  })
  assert.equal(r.factor, 1)
  assert.equal(r.fuente, 'neutro-fuera-de-ventana')
  // Y es MÁS caro que lo que salía antes, que es justo el punto: no se regala el mes sin abrir.
  assert.ok(r.factor > factorDemanda({ ocupacion: 0.06, ...REAL }))
})

test('🚨 pero el mes lejano que YA va vendido sí cuenta: fuera de ventana el factor solo SUBE', () => {
  // La ausencia de reservas a 10 meses no dice nada; su presencia sí. Nadie reserva tan pronto salvo
  // que la fecha valga (Semana Santa, Feria…).
  const vendido = factorDemandaDeLaFecha({
    diasVista: 205, ocupacionMes: 0.75, ocupacionGlobal: 0.06,
    antelacion: { mediana: 24, muestra: 39 }, ...REAL,
  })
  assert.equal(vendido.fuente, 'mes-anticipado')
  assert.ok(vendido.factor > 1, `${vendido.factor} deberia superar 1`)
  assert.equal(Number(vendido.factor.toFixed(4)), 1.04)

  // Y por debajo del baseline sigue siendo neutro, NO el suelo: el listón para premiar es alto
  // (con baseline 0,50 hay que pasar del 50% vendido). El 22,6% real de marzo-2027 no llega.
  const flojo = factorDemandaDeLaFecha({
    diasVista: 205, ocupacionMes: 0.226, ocupacionGlobal: 0.06,
    antelacion: { mediana: 24, muestra: 39 }, ...REAL,
  })
  assert.equal(flojo.fuente, 'neutro-fuera-de-ventana')
  assert.equal(flojo.factor, 1)
})

test('fuera de ventana y sin snapshot del mes: neutro (no hay nada que premiar ni que castigar)', () => {
  const r = factorDemandaDeLaFecha({
    diasVista: 205, ocupacionMes: null, ocupacionGlobal: 0.06,
    antelacion: { mediana: 24, muestra: 39 }, ...REAL,
  })
  assert.equal(r.fuente, 'neutro-fuera-de-ventana')
  assert.equal(r.factor, 1)
})

test('el mes cercano que se está llenando SÍ empuja hacia arriba, aunque el año esté vacío', () => {
  // Septiembre-2026 al 30% (House) con el global al 6%: el caso que la cifra anual tapaba.
  const conMes = factorDemandaDeLaFecha({
    diasVista: 25, ocupacionMes: 0.30, ocupacionGlobal: 0.06,
    antelacion: { mediana: 24, muestra: 39 }, ...REAL,
  })
  const soloGlobal = factorDemanda({ ocupacion: 0.06, ...REAL })
  assert.equal(conMes.fuente, 'mes')
  assert.ok(conMes.factor > soloGlobal, `${conMes.factor} deberia superar a ${soloGlobal}`)
  // Con los parámetros reales: 0,968 contra 0,9296 → ~+4% en septiembre.
  assert.equal(Number(conMes.factor.toFixed(4)), 0.968)
  assert.equal(Number(soloGlobal.toFixed(4)), 0.9296)
})

test('el mes cercano que de verdad está vacío sigue bajando: esto no es un cheque en blanco', () => {
  const r = factorDemandaDeLaFecha({
    diasVista: 5, ocupacionMes: 0, ocupacionGlobal: 0.06,
    antelacion: { mediana: 11, muestra: 30 }, ...REAL,
  })
  assert.equal(r.fuente, 'mes')
  assert.equal(r.factor, DEMANDA_MIN)
})

test('sin antelación fiable se comporta EXACTAMENTE como antes (la global manda)', () => {
  const r = factorDemandaDeLaFecha({
    diasVista: 200, ocupacionMes: 0, ocupacionGlobal: 0.06,
    antelacion: null, ...REAL,
  })
  assert.equal(r.fuente, 'global')
  assert.equal(r.factor, factorDemanda({ ocupacion: 0.06, ...REAL }))
})

test('dentro de ventana pero sin snapshot de ese mes: global, no neutro ni suelo', () => {
  const r = factorDemandaDeLaFecha({
    diasVista: 10, ocupacionMes: null, ocupacionGlobal: 0.06,
    antelacion: { mediana: 24, muestra: 39 }, ...REAL,
  })
  assert.equal(r.fuente, 'global')
  assert.equal(r.factor, factorDemanda({ ocupacion: 0.06, ...REAL }))
})

test('k = 0 deja la palanca inerte mande quien mande la ocupación', () => {
  for (const ocupacionMes of [0, 0.5, 1]) {
    const r = factorDemandaDeLaFecha({
      diasVista: 5, ocupacionMes, ocupacionGlobal: 0.06,
      antelacion: { mediana: 30, muestra: 20 }, baseline: 0.5, k: 0,
    })
    assert.equal(r.factor, 1)
  }
})
