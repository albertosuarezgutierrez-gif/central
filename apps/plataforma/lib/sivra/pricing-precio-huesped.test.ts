import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  precioHuesped, baseDondeLaCuotaMandaya, TOPE_CARO,
  VENTANA_DIAS_MERCADO, MIN_COMPS_FECHA,
  type FechaHuesped,
} from './pricing-precio-huesped.ts'

// Parámetros REALES de House medidos el 19/08/2026, con su estancia típica de 2 noches:
// la cuota fija de 597€ son 298,5€ POR NOCHE que el motor no ve.
const HOUSE = { markup: 0.902, cuotaFija: 597, nochesRef: 2 }
const f = (
  fecha: string, baseAplicada: number, medMercadoGuest: number | null,
  hayEvento: boolean | null = false,
): FechaHuesped => ({ fecha, baseAplicada, medMercadoGuest, hayEvento })

test('🚨 el punto ciego: el motor en su SUELO y el huésped viendo casi el doble del mercado', () => {
  // El motor baja House a su min_price (300€) creyendo que regala la noche. El huésped ve 569€,
  // contra un mercado de 320€: un 78% por encima. Ningún raíl del motor lo ve, porque todos
  // razonan en base y en base estamos en el mínimo.
  const r = precioHuesped([f('2027-02-10', 300, 320)], HOUSE)
  assert.equal(r.fechas[0].guest, 569)
  assert.equal(r.fechas[0].estado, 'caro')
  assert.ok(r.fechas[0].ratio! > 1.7, `ratio ${r.fechas[0].ratio}`)
  // Y más de la mitad de lo que paga el huésped es cuota fija.
  assert.ok(r.fechas[0].pesoCuota > 0.5, `peso ${r.fechas[0].pesoCuota}`)
})

test('en fechas CARAS la cuota fija apenas pesa y el precio sigue a la base', () => {
  // Navidad: base 1.400€, el huésped ve 1.562€ contra un mercado de 1.500€. Cuadra.
  const r = precioHuesped([f('2026-12-27', 1400, 1500)], HOUSE)
  assert.equal(r.fechas[0].estado, 'ok')
  assert.ok(r.fechas[0].pesoCuota < 0.25, `peso ${r.fechas[0].pesoCuota}`)
})

test('sin cuota fija el punto ciego no existe: el peso es 0 a cualquier precio', () => {
  const sinCuota = { markup: 1.0, cuotaFija: 0, nochesRef: 2 }
  const r = precioHuesped([f('a', 300, 320), f('b', 1400, 1500)], sinCuota)
  assert.ok(r.fechas.every(v => v.pesoCuota === 0))
  assert.ok(r.fechas.every(v => v.estado === 'ok'))
})

test('🚨 una fecha SIN mercado no es una fecha que cuadre: va en su propio recuento', () => {
  const r = precioHuesped([f('a', 300, null), f('b', 1400, 1500)], HOUSE)
  assert.equal(r.sinMercado, 1)
  assert.equal(r.ok, 1)
  assert.equal(r.caras, 0)
  // Y nunca encabeza el aviso: no se puede decir «estás caro» de algo que no se ha comparado.
  assert.ok(r.peores.every(v => v.ratio != null))
})

test('regalar la noche también se detecta', () => {
  const r = precioHuesped([f('a', 300, 900)], HOUSE)
  assert.equal(r.fechas[0].estado, 'barato')
  assert.equal(r.baratas, 1)
})

test('las peores salen ordenadas y acotadas para el aviso', () => {
  const r = precioHuesped([
    f('a', 300, 320), f('b', 300, 300), f('c', 1400, 1500), f('d', 500, 400),
  ], HOUSE, { maxPeores: 2 })
  assert.equal(r.peores.length, 2)
  assert.ok(r.peores[0].ratio! >= r.peores[1].ratio!)
  assert.ok(r.peores[0].ratio! > TOPE_CARO)
})

test('la base sin base aplicada no se juzga', () => {
  const r = precioHuesped([f('a', 0, 400)], HOUSE)
  assert.equal(r.fechas.length, 0)
})

// ─── El punto en el que bajar la base deja de servir ───────────────────────────────────────────

test('el suelo ÚTIL de House: por debajo de ~331€ de base, la cuota manda', () => {
  // 298,5€/noche de cuota fija. Con base 331€: 0,902×331 = 298,6€ de parte variable → 50/50.
  const b = baseDondeLaCuotaMandaya(HOUSE, 0.5)
  assert.ok(b !== null && Math.abs(b - 331) <= 2, `base ${b}`)
  // Verificación cruzada con el propio cálculo del precio del huésped.
  const r = precioHuesped([f('x', b!, 1000)], HOUSE)
  assert.ok(Math.abs(r.fechas[0].pesoCuota - 0.5) < 0.02, `peso ${r.fechas[0].pesoCuota}`)
})

test('sin cuota fija no hay tal punto, y se dice con null en vez de un número inventado', () => {
  assert.equal(baseDondeLaCuotaMandaya({ markup: 1.1, cuotaFija: 0, nochesRef: 2 }), null)
})

test('repartir la cuota entre más noches mueve el punto: la estancia típica importa', () => {
  const dos = baseDondeLaCuotaMandaya({ ...HOUSE, nochesRef: 2 })!
  const cinco = baseDondeLaCuotaMandaya({ ...HOUSE, nochesRef: 5 })!
  assert.ok(cinco < dos, `${cinco} debería ser menor que ${dos}`)
})

// ─── El mercado es de la FECHA, no del mes (03/09/2026) ────────────────────────────────────────

test('🚨 el caso REAL del 03/09/2026: contra el mes el maratón sale ×2,93; contra su fecha, ×1,39', () => {
  // House, 20/02/2027, vigilia del Zurich Maratón de Sevilla (40.000 dorsales). El huésped ve
  // 1.320€/noche. La mediana de TODO febrero era 450€ (×2,93 → «el peor caso del mes»); la de esa
  // fecha, medida sobre 10 comps de booking_mcp, es 948€ (×1,39). Es el mismo precio juzgado contra
  // dos cosas distintas, y solo una de las dos es el mercado de esa noche.
  const base = 1320 // se pasa la base que produce exactamente ese precio de huésped
  const guest = precioHuesped([f('2027-02-20', base, 948, true)], { markup: 1, cuotaFija: 0, nochesRef: 2 })
  assert.equal(guest.fechas[0].guest, 1320)
  assert.equal(guest.fechas[0].ratio, 1.392)
  // Con el mercado del MES el mismo precio salía disparado.
  const conMes = precioHuesped([f('2027-02-20', base, 450, true)], { markup: 1, cuotaFija: 0, nochesRef: 2 })
  assert.equal(conMes.fechas[0].ratio, 2.933)
  assert.equal(conMes.fechas[0].estado, 'caro')
})

test('🚨 fecha sin comparables suficientes → sin_mercado; NO cae a la mediana del mes', () => {
  // Así llega del SQL una fecha con menos de MIN_COMPS_FECHA comps en su ventana: `null`, nunca el
  // número de otro periodo. Un «no se sabe» no puede acusar de caro ni absolver.
  const r = precioHuesped([f('2027-02-20', 1320, null, true), f('2027-02-24', 600, 480)], HOUSE)
  assert.equal(r.fechas[0].estado, 'sin_mercado')
  assert.equal(r.fechas[0].ratio, null)
  assert.equal(r.fechas[0].medMercadoGuest, null)
  assert.equal(r.sinMercado, 1)
  // Y no cuenta como cara ni como ok: va en su propio cubo.
  assert.equal(r.caras + r.baratas + r.ok, 1)
  assert.ok(r.peores.every(v => v.fecha !== '2027-02-20'))
})

test('la ventana y el mínimo de comps son constantes documentadas, no números sueltos', () => {
  assert.equal(VENTANA_DIAS_MERCADO, 3)
  assert.equal(MIN_COMPS_FECHA, 5)
})

// ─── Evento vs martes normal ───────────────────────────────────────────────────────────────────

test('🚨 el desglose separa la noche de evento del martes normal', () => {
  const r = precioHuesped([
    f('2027-02-20', 1320, 948, true),   // maratón: cara, pero el mercado sube con nosotros
    f('2027-02-23', 600, 380, false),   // martes normal: cara y accionable
    f('2027-02-24', 600, 380, null),    // no se ha podido comprobar si hay evento
    f('2027-03-02', 400, 420, false),   // cuadra
  ], { markup: 1, cuotaFija: 0, nochesRef: 2 })
  assert.equal(r.caras, 3)
  assert.equal(r.carasSinEvento, 1)
  assert.equal(r.carasConEvento, 1)
  assert.equal(r.carasEventoSinComprobar, 1)
  assert.equal(r.carasSinEvento + r.carasConEvento + r.carasEventoSinComprobar, r.caras)
})

test('🚨 el aviso lo encabeza el martes normal, NO la noche de maratón que tiene el ratio más alto', () => {
  const r = precioHuesped([
    f('2027-02-20', 1320, 948, true),   // ×1,39 pero con evento
    f('2027-02-23', 600, 380, false),   // ×1,58 y sin evento → esta es la accionable
  ], { markup: 1, cuotaFija: 0, nochesRef: 2 })
  assert.equal(r.peores[0].fecha, '2027-02-23')
  assert.equal(r.peores[0].hayEvento, false)
  // La de evento sigue en la lista (se declara, no se esconde), pero detrás.
  assert.equal(r.peores[1].fecha, '2027-02-20')
})

test('con evento MAYOR ratio manda dentro del mismo grupo, y el sin comprobar va en medio', () => {
  const r = precioHuesped([
    f('a', 900, 300, true),    // ×3, con evento
    f('b', 700, 300, null),    // ×2,33, sin comprobar
    f('c', 500, 300, false),   // ×1,67, sin evento
  ], { markup: 1, cuotaFija: 0, nochesRef: 2 })
  assert.deepEqual(r.peores.map(v => v.fecha), ['c', 'b', 'a'])
})

test('una fecha que CUADRA nunca encabeza el aviso aunque no tenga evento', () => {
  const r = precioHuesped([
    f('cara-con-evento', 900, 300, true),
    f('ok-sin-evento', 300, 300, false),
  ], { markup: 1, cuotaFija: 0, nochesRef: 2 })
  assert.equal(r.peores[0].fecha, 'cara-con-evento')
})

test('sin dato de evento (el campo ni se pasa) el veredicto dice null, no false', () => {
  const r = precioHuesped([{ fecha: 'x', baseAplicada: 600, medMercadoGuest: 300 }], HOUSE)
  assert.equal(r.fechas[0].hayEvento, null)
  assert.equal(r.carasEventoSinComprobar, 1)
  assert.equal(r.carasSinEvento, 0)
})

// ─── Guardián del SQL del centinela (ni tsc ni el build miran dentro de un `Prisma.sql`) ───────

test('🚨 el centinela del canal NO vuelve a comparar contra la mediana del MES', () => {
  const ruta = new URL('../../app/api/sivra/pricing/canal/route.ts', import.meta.url)
  const fuente = readFileSync(ruta, 'utf8')
  // El fallo del 03/09/2026 era literalmente este agrupado: si reaparece, el aviso vuelve a mentir.
  assert.ok(!fuente.includes("'YYYY-MM'"), 'el mercado del centinela vuelve a agruparse por mes')
  // La ventana va CENTRADA en la fecha y sale de la constante del módulo (con su ::int: Prisma
  // manda el número como int8 y «date - bigint» no existe en Postgres).
  assert.ok(fuente.includes('c.checkin_date BETWEEN b.rate_date - ${VENTANA_DIAS_MERCADO}::int'))
  assert.ok(fuente.includes('AND b.rate_date + ${VENTANA_DIAS_MERCADO}::int'))
  // Y por debajo del mínimo de comparables se devuelve NULL, no la mediana de otra cosa.
  assert.ok(fuente.includes('CASE WHEN m.n_comps >= ${MIN_COMPS_FECHA}::int THEN m.med END'))
  // La plausibilidad €/plaza se reutiliza del motor, no se reescribe a mano.
  assert.ok(fuente.includes('sqlCompPlausible("m.")'))
  assert.ok(fuente.includes('NOT m.corpus_clonado'))
})
