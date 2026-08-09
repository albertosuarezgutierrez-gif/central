import { test } from "node:test"
import assert from "node:assert/strict"
import { factorDemanda, factorDemandaFecha, DEMANDA_MIN, DEMANDA_MAX } from "./pricing-demanda.ts"

// El caso fundacional: Luxury a 68 días de una fecha de octubre. Su mediana de venta de octubre es
// ~17 días (medida en incomes.reserved_at), la ocupación global del horizonte era baja y el motor le
// aplicaba el descuento de demanda a una fecha cuya venta ni siquiera había empezado.
test("demanda: fecha FUERA de la ventana de venta → el descuento se neutraliza", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.94, diasVista: 68, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 1)
  assert.equal(r.gateado, true)
})

test("demanda: fecha DENTRO de la ventana → descuento clásico", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.94, diasVista: 10, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 0.94)
  assert.equal(r.gateado, false)
})

test("demanda: el BOOST (>1) se conserva a cualquier plazo", () => {
  const r = factorDemandaFecha({ factorDemanda: 1.06, diasVista: 200, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 1.06)
  assert.equal(r.gateado, false)
})

test("demanda: sin antelación medida → comportamiento clásico (no inventamos ventanas)", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.92, diasVista: 120, antelacionMediana: null, muestra: 0 })
  assert.equal(r.factor, 0.92)
  assert.equal(r.gateado, false)
})

test("demanda: muestra insuficiente → comportamiento clásico", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.92, diasVista: 120, antelacionMediana: 17, muestra: 4 })
  assert.equal(r.factor, 0.92)
  assert.equal(r.gateado, false)
})

test("demanda: justo en la mediana cuenta como ventana abierta (el gate es estrictamente >)", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.94, diasVista: 17, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 0.94)
})

test("demanda: días vista inválidos → clásico, nunca lanza", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.94, diasVista: NaN, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 0.94)
})

// ————— La ocupación del MES (la otra mitad, 09/08/2026) —————
// Números de PRODUCCIÓN (`pricing_settings`): demand_baseline = 0,50 y demand_k = 0,16 en los cuatro
// pisos. Con k = 0,16 el suelo (0,92) solo se toca por debajo del ~0%, así que hay recorrido REAL entre
// el 6% anual y el 30% de septiembre — con un k inventado más grande ambos saturarían en el suelo y el
// arreglo parecería inerte.
const REAL = { demandaBaseline: 0.5, demandaK: 0.16 }
/** El factor que la SQL calcula hoy con la ocupación ANUAL de los 4 pisos (1-8%, medida). */
const GLOBAL = factorDemanda({ ocupacion: 0.06, baseline: 0.5, k: 0.16 })
/** Antelación de Busto/Luxury para marzo, medida en `incomes.reserved_at`. */
const ANT = { antelacionMediana: 24, muestra: 39 }

test("factorDemanda: sobre el baseline sube, por debajo baja, y respeta suelo y techo", () => {
  assert.equal(factorDemanda({ ocupacion: 0.5, baseline: 0.5, k: 0.4 }), 1)
  assert.ok(factorDemanda({ ocupacion: 0.7, baseline: 0.5, k: 0.4 }) > 1)
  assert.ok(factorDemanda({ ocupacion: 0.3, baseline: 0.5, k: 0.4 }) < 1)
  assert.equal(factorDemanda({ ocupacion: 1, baseline: 0, k: 10 }), DEMANDA_MAX)
  assert.equal(factorDemanda({ ocupacion: 0, baseline: 1, k: 10 }), DEMANDA_MIN)
})

test("🚨 el mes que se está llenando empuja hacia ARRIBA aunque el año esté vacío", () => {
  // Septiembre-2026 al 30% (House) con el global al 6%: el caso que la cifra anual tapaba.
  const r = factorDemandaFecha({
    factorDemanda: GLOBAL, diasVista: 20, ocupacionMes: 0.3, ...ANT, ...REAL,
  })
  assert.equal(r.fuente, "mes")
  assert.equal(r.gateado, false)
  assert.ok(r.factor > GLOBAL, `${r.factor} deberia superar a ${GLOBAL}`)
  assert.equal(Number(r.factor.toFixed(4)), 0.968)
  assert.equal(Number(GLOBAL.toFixed(4)), 0.9296)
})

test("🚨 fuera de la ventana, el mes flojo NO castiga: se neutraliza igual que el global", () => {
  // Marzo-2027 al 22,6% visto a 205 días: por debajo del baseline, pero es que aún no se vende.
  const r = factorDemandaFecha({
    factorDemanda: GLOBAL, diasVista: 205, ocupacionMes: 0.226, ...ANT, ...REAL,
  })
  assert.equal(r.gateado, true)
  assert.equal(r.factor, 1)
})

test("🚨 fuera de la ventana, el mes YA VENDIDO sí premia: el boost sobrevive al gate", () => {
  // La AUSENCIA de reservas a diez meses no dice nada; su PRESENCIA sí. Sin ocupación por mes este
  // premio era inalcanzable: la cifra anual jamás pasa del baseline con los pisos recién abiertos.
  const r = factorDemandaFecha({
    factorDemanda: GLOBAL, diasVista: 205, ocupacionMes: 0.75, ...ANT, ...REAL,
  })
  assert.equal(r.fuente, "mes")
  assert.equal(r.gateado, false)
  assert.equal(Number(r.factor.toFixed(4)), 1.04)
})

test("el mes cercano que de verdad está vacío sigue bajando: esto no es un cheque en blanco", () => {
  const r = factorDemandaFecha({
    factorDemanda: GLOBAL, diasVista: 5, ocupacionMes: 0,
    antelacionMediana: 11, muestra: 30, ...REAL,
  })
  assert.equal(r.fuente, "mes")
  assert.equal(r.factor, DEMANDA_MIN)
})

test("🚨 sin ventana JUZGABLE no se usa el mes: el 0% de un mes sin abrir hundiría el precio", () => {
  // House junio-2027: 8 reservas de histórico (< muestraMinima) y el mes al 0%. Usar esa ocupación
  // daría el suelo 0,92 contra el 0,9296 global — bajar el precio de un mes que nadie puede reservar
  // todavía, que es justo el bug que este módulo existe para no cometer. Medido sobre el corpus real.
  const r = factorDemandaFecha({
    factorDemanda: GLOBAL, diasVista: 300, ocupacionMes: 0,
    antelacionMediana: 27, muestra: 8, ...REAL,
  })
  assert.equal(r.fuente, "global")
  assert.equal(r.factor, GLOBAL)
  assert.ok(r.factor > DEMANDA_MIN)
})

test("sin snapshot de ese mes: factor global, ni suelo ni premio inventado", () => {
  const r = factorDemandaFecha({
    factorDemanda: GLOBAL, diasVista: 10, ocupacionMes: null, ...ANT, ...REAL,
  })
  assert.equal(r.fuente, "global")
  assert.equal(r.factor, GLOBAL)
})

test("k = 0 deja la palanca inerte mande quien mande la ocupación del mes", () => {
  for (const ocupacionMes of [0, 0.5, 1]) {
    const r = factorDemandaFecha({
      factorDemanda: 1, diasVista: 5, ocupacionMes,
      antelacionMediana: 30, muestra: 20, demandaBaseline: 0.5, demandaK: 0,
    })
    assert.equal(r.factor, 1)
  }
})
