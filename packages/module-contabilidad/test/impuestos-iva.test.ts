// F4 — libros registro de IVA, modelo 303 y 390: casos numéricos completos, casilla → origen y cuadre con el mayor 477/472.
// Cepos vistos fallar el 05/11/2026 (rompo, miro rojo, restauro): (1) 303: no sumar la ISP en la casilla 27 → rojo en «27»; (2) 303: quitar
// el bloqueo por régimen especial → rojo en «no soportado»; (3) libro: no sumar `cuotaDeducible` solo a deducibles → rojo en «cuadre».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  libroRegistroIva, cuadrarLibrosConMayor, calcularModelo303, calcularModelo390, operacionesDeHecho, asientoDesdeHecho, sumasDeAsientos,
  casillaDe, importeDe, tipoResultado303, type OperacionIva, type Asiento, type HechoContable, DISENO_OFICIAL_PENDIENTE,
} from '../src/index.ts'

let n = 0
const op = (o: Partial<OperacionIva> & Pick<OperacionIva, 'sentido' | 'fecha' | 'base' | 'tipoIva' | 'cuota'>): OperacionIva => ({
  ref: `OP-${++n}`, numero: `N-${n}`, tercero: { nif: `B1234567${n % 10}`, nombre: `Tercero ${n}` }, clase: 'interior', ...o,
})

/** Primer trimestre de 2026 del taller: dos tipos de IVA en emitidas, bien de inversión, intracomunitaria, ISP, importación y un no deducible. */
function trimestre1(): OperacionIva[] {
  return [
    op({ ref: 'F-1', sentido: 'emitida', fecha: '2026-01-15', base: 100000, tipoIva: 21, cuota: 21000 }),
    op({ ref: 'F-2', sentido: 'emitida', fecha: '2026-02-10', base: 50000, tipoIva: 10, cuota: 5000 }),
    op({ ref: 'F-3', sentido: 'emitida', fecha: '2026-02-11', base: 20000, tipoIva: 4, cuota: 800 }),
    op({ ref: 'F-4', sentido: 'emitida', fecha: '2026-03-01', base: 30000, tipoIva: 0, cuota: 0, clase: 'exenta' }),
    op({ ref: 'C-1', sentido: 'recibida', fecha: '2026-01-20', base: 60000, tipoIva: 21, cuota: 12600 }),
    op({ ref: 'C-2', sentido: 'recibida', fecha: '2026-02-20', base: 100000, tipoIva: 21, cuota: 21000, bienInversion: true }),
    op({ ref: 'C-3', sentido: 'recibida', fecha: '2026-03-05', base: 40000, tipoIva: 21, cuota: 8400, clase: 'intracom_bienes', tercero: { nif: 'FR12345678901', nombre: 'Pièces SAS' } }),
    op({ ref: 'C-4', sentido: 'recibida', fecha: '2026-03-06', base: 25000, tipoIva: 21, cuota: 5250, clase: 'isp' }),
    op({ ref: 'C-5', sentido: 'recibida', fecha: '2026-03-07', base: 10000, tipoIva: 21, cuota: 2100, deducible: false }),
    op({ ref: 'C-6', sentido: 'recibida', fecha: '2026-03-08', base: 20000, tipoIva: 21, cuota: 4200, clase: 'importacion' }),
    op({ ref: 'FUERA', sentido: 'emitida', fecha: '2026-04-01', base: 999999, tipoIva: 21, cuota: 209999 }),
  ]
}
const P1 = { anio: 2026, trimestre: 1 as const, regimenIva: 'general' }

test('303 T1: devengado por tipo, autorrepercutido (intracom + ISP) y total 27', () => {
  const c = calcularModelo303(trimestre1(), P1)
  assert.deepEqual([importeDe(c, '01'), importeDe(c, '02'), importeDe(c, '03')], [20000, 4, 800])
  assert.deepEqual([importeDe(c, '04'), importeDe(c, '05'), importeDe(c, '06')], [50000, 10, 5000])
  assert.deepEqual([importeDe(c, '07'), importeDe(c, '08'), importeDe(c, '09')], [100000, 21, 21000])
  assert.deepEqual([importeDe(c, '10'), importeDe(c, '11')], [40000, 8400])
  assert.deepEqual([importeDe(c, '12'), importeDe(c, '13')], [25000, 5250])
  assert.equal(importeDe(c, '27'), 800 + 5000 + 21000 + 8400 + 5250, '27 = 03+06+09+11+13 = 40.450')
  assert.equal(importeDe(c, '27'), 40450)
})

test('303 T1: deducible por bloque, total a deducir 45 y resultado 46 a compensar; el no deducible y el otro trimestre no entran', () => {
  const c = calcularModelo303(trimestre1(), P1)
  assert.deepEqual([importeDe(c, '28'), importeDe(c, '29')], [60000 + 25000, 12600 + 5250], 'interiores corrientes + ISP deducida')
  assert.deepEqual([importeDe(c, '30'), importeDe(c, '31')], [100000, 21000])
  assert.deepEqual([importeDe(c, '32'), importeDe(c, '33')], [20000, 4200])
  assert.deepEqual([importeDe(c, '34'), importeDe(c, '35')], [0, 0])
  assert.deepEqual([importeDe(c, '36'), importeDe(c, '37')], [40000, 8400])
  assert.deepEqual([importeDe(c, '38'), importeDe(c, '39')], [0, 0])
  assert.equal(importeDe(c, '45'), 17850 + 21000 + 4200 + 8400)
  assert.equal(importeDe(c, '45'), 51450)
  assert.equal(importeDe(c, '46'), 40450 - 51450)
  assert.equal(c.resultado, -11000)
  assert.equal(tipoResultado303(c), 'a_compensar')
  assert.equal(c.ficheroOficial, DISENO_OFICIAL_PENDIENTE)
  assert.ok(!c.casillas.some((x) => x.origen.includes('FUERA')), 'la operación de abril no entra en el T1')
  assert.ok(!c.casillas.some((x) => x.origen.includes('C-5')), 'el IVA no deducible no entra en ninguna casilla')
  assert.ok(c.avisos.some((a) => /no deducible/.test(a)))
})

test('303: trazabilidad casilla → origen (qué operaciones suman cada casilla)', () => {
  const c = calcularModelo303(trimestre1(), P1)
  assert.deepEqual(casillaDe(c, '07')!.origen, ['F-1'])
  assert.deepEqual(casillaDe(c, '09')!.origen, ['F-1'])
  assert.deepEqual(casillaDe(c, '11')!.origen, ['C-3'])
  assert.deepEqual(casillaDe(c, '13')!.origen, ['C-4'])
  assert.deepEqual(casillaDe(c, '29')!.origen, ['C-1', 'C-4'])
  assert.deepEqual(casillaDe(c, '31')!.origen, ['C-2'])
  assert.deepEqual(casillaDe(c, '37')!.origen, ['C-3'])
  assert.deepEqual(casillaDe(c, '27')!.origen, ['C-3', 'C-4', 'F-1', 'F-2', 'F-3'])
  assert.equal(casillaDe(c, '08')!.tipo, 'porcentaje')
})

test('303 a ingresar con compensación de cuotas anteriores (68 y 71) y sin compensar si no hay a ingresar', () => {
  const ops = trimestre1().filter((o) => o.ref !== 'C-2') // sin el bien de inversión: 45 = 30.450
  const c = calcularModelo303(ops, { ...P1, compensarAnteriores: 3000 })
  assert.equal(importeDe(c, '45'), 30450)
  assert.equal(importeDe(c, '46'), 10000)
  assert.equal(importeDe(c, '64'), 10000)
  assert.equal(importeDe(c, '66'), 10000)
  assert.equal(importeDe(c, '68'), 3000)
  assert.equal(importeDe(c, '71'), 7000)
  assert.equal(c.resultado, 7000)
  assert.equal(tipoResultado303(c), 'a_ingresar')
  const exceso = calcularModelo303(ops, { ...P1, compensarAnteriores: 99999 })
  assert.equal(importeDe(exceso, '68'), 10000, 'no se compensa más de lo que sale a ingresar')
  assert.equal(exceso.resultado, 0)
  const neg = calcularModelo303(trimestre1(), { ...P1, compensarAnteriores: 500 })
  assert.equal(importeDe(neg, '68'), 0)
  assert.ok(neg.avisos.some((a) => /no se aplica/.test(a)))
})

test('303: régimen especial, tipo no estándar o régimen de empresa distinto de general → NO SOPORTADO (resultado null, nada calculado a medias)', () => {
  const base = [op({ ref: 'F-1', sentido: 'emitida', fecha: '2026-01-15', base: 100000, tipoIva: 21, cuota: 21000 })]
  const prorrata = calcularModelo303([...base, op({ ref: 'C-P', sentido: 'recibida', fecha: '2026-01-16', base: 1000, tipoIva: 21, cuota: 210, regimen: 'prorrata' })], P1)
  assert.equal(prorrata.resultado, null)
  assert.match(prorrata.noSoportado.join(' '), /prorrata/)
  const recargo = calcularModelo303([...base, op({ ref: 'C-R', sentido: 'recibida', fecha: '2026-01-16', base: 1000, tipoIva: 21, cuota: 210, regimen: 'recargo_equivalencia' })], P1)
  assert.match(recargo.noSoportado.join(' '), /recargo_equivalencia/)
  const raro = calcularModelo303([...base, op({ ref: 'C-7', sentido: 'recibida', fecha: '2026-01-16', base: 1000, tipoIva: 7.5, cuota: 75 })], P1)
  assert.match(raro.noSoportado.join(' '), /7\.5 %/)
  assert.equal(calcularModelo303(base, { ...P1, regimenIva: 'simplificado' }).resultado, null)
  assert.ok(prorrata.excluidas.some((e) => e.ref === 'C-P'))
  assert.equal(calcularModelo303(base, P1).resultado, 21000, 'el mismo caso sin el régimen especial sí se calcula')
})

test('303: régimen de IVA sin declarar (null) avisa pero calcula; sin datos no inventa ceros silenciosos', () => {
  const c = calcularModelo303([], { anio: 2026, trimestre: 2, regimenIva: null })
  assert.ok(c.avisos.some((a) => /sin declarar/.test(a)))
  assert.equal(c.resultado, 0)
  assert.equal(c.noSoportado.length, 0)
})

test('libro de emitidas: una línea por tipo, nº de orden correlativo, resumen y totales; solo el periodo pedido', () => {
  const r = { desde: '2026-01-01', hasta: '2026-03-31' }
  const l = libroRegistroIva(trimestre1(), 'emitida', r)
  assert.deepEqual(l.lineas.map((x) => [x.orden, x.ref, x.clave]), [[1, 'F-1', '21'], [2, 'F-2', '10'], [3, 'F-3', '4'], [4, 'F-4', 'exenta']])
  assert.deepEqual(l.resumen.map((x) => [x.clave, x.base, x.cuota, x.total]), [
    ['21', 100000, 21000, 121000], ['10', 50000, 5000, 55000], ['4', 20000, 800, 20800], ['exenta', 30000, 0, 30000],
  ])
  assert.deepEqual(l.totales, { base: 200000, cuota: 26800, total: 226800 })
})

test('libro de recibidas: ISP, intracomunitarias e importación aparte; la cuota no deducible no cuenta como deducible', () => {
  const l = libroRegistroIva(trimestre1(), 'recibida', { desde: '2026-01-01', hasta: '2026-03-31' })
  assert.deepEqual(l.resumen.map((x) => x.clave), ['21', 'isp', 'intracom', 'importacion'])
  assert.equal(l.totales.cuota, 12600 + 21000 + 8400 + 5250 + 2100 + 4200)
  assert.equal(l.cuotaDeducible, l.totales.cuota - 2100)
  assert.equal(l.lineas.find((x) => x.ref === 'C-5')!.noDeducible, true)
})

test('libro: línea sin NIF y operación inválida se avisan/excluyen, no se descartan en silencio', () => {
  const ops = [
    op({ ref: 'S-1', sentido: 'emitida', fecha: '2026-01-02', base: 1000, tipoIva: 21, cuota: 210, tercero: { nif: null, nombre: 'Cliente de mostrador' } }),
    op({ ref: 'MAL', sentido: 'emitida', fecha: '2026-01-03', base: 1000, tipoIva: 21, cuota: -210 }),
  ]
  const l = libroRegistroIva(ops, 'emitida', { desde: '2026-01-01', hasta: '2026-12-31' })
  assert.equal(l.lineas.length, 1)
  assert.ok(l.avisos.some((a) => /sin NIF/.test(a)))
  assert.deepEqual(l.excluidas.map((e) => e.ref), ['MAL'])
  assert.equal(libroRegistroIva([], 'emitida', { desde: '2026-01-01', hasta: '2026-12-31' }).avisos[0], 'Sin datos: no hay operaciones en el periodo')
})

test('hechos → operaciones → libros ≡ mayor 477/472 al céntimo (dos tipos de IVA, cuota por línea como en el asiento)', () => {
  const hechos: HechoContable[] = [
    { tipo: 'venta', fecha: '2026-01-10', ref: 'V-1', desglose: [{ base: 33333, tipoIva: 21 }, { base: 33333, tipoIva: 21 }, { base: 10001, tipoIva: 10 }] },
    { tipo: 'venta', fecha: '2026-02-10', ref: 'V-2', desglose: [{ base: 12345, tipoIva: 4 }] },
    { tipo: 'compra', fecha: '2026-02-15', ref: 'K-1', desglose: [{ base: 77777, tipoIva: 21 }, { base: 5555, tipoIva: 10 }] },
  ]
  const asientos: Asiento[] = hechos.map((h, i) => ({ ...asientoDesdeHecho(h), numero: i + 1 }))
  const ops = hechos.flatMap((h) => operacionesDeHecho(h as never))
  const r = { desde: '2026-01-01', hasta: '2026-03-31' }
  const em = libroRegistroIva(ops, 'emitida', r)
  const re = libroRegistroIva(ops, 'recibida', r)
  assert.equal(ops.filter((o) => o.ref === 'V-1').length, 2, 'una operación por tipo')
  const s = sumasDeAsientos(asientos, r)
  const g = (c: string) => s.find((x) => x.cuenta === c) ?? { debe: 0, haber: 0 }
  const saldo477 = g('477').haber - g('477').debe
  const saldo472 = g('472').debe - g('472').haber
  const ok = cuadrarLibrosConMayor(em, re, saldo477, saldo472)
  assert.equal(ok.ok, true, ok.mensajes.join(' | '))
  assert.equal(ok.esperado477, 2 * Math.round(33333 * 0.21) + Math.round(10001 * 0.10) + Math.round(12345 * 0.04))
  const roto = cuadrarLibrosConMayor(em, re, saldo477 + 1, saldo472)
  assert.equal(roto.ok, false)
  assert.equal(roto.diferencia477, 1)
  const roto2 = cuadrarLibrosConMayor(em, re, saldo477, saldo472 - 1)
  assert.equal(roto2.ok, false)
})

test('cuadre: ISP e intracomunitarias recibidas se autorrepercuten (477) y se deducen (472)', () => {
  const ops = trimestre1()
  const r = { desde: '2026-01-01', hasta: '2026-03-31' }
  const em = libroRegistroIva(ops, 'emitida', r)
  const re = libroRegistroIva(ops, 'recibida', r)
  const c = cuadrarLibrosConMayor(em, re, 26800 + 8400 + 5250, re.cuotaDeducible)
  assert.equal(c.ok, true, c.mensajes.join(' | '))
  assert.equal(c.esperado472, 12600 + 21000 + 8400 + 5250 + 4200)
})

test('totales del 303 ≡ libros de IVA (cuotas devengada y deducible)', () => {
  const ops = trimestre1()
  const r = { desde: '2026-01-01', hasta: '2026-03-31' }
  const c = calcularModelo303(ops, P1)
  const em = libroRegistroIva(ops, 'emitida', r)
  const re = libroRegistroIva(ops, 'recibida', r)
  const autorrep = re.lineas.filter((l) => l.clave === 'isp' || l.clave === 'intracom').reduce((t, l) => t + l.cuota, 0)
  assert.equal(importeDe(c, '27'), em.totales.cuota + autorrep)
  assert.equal(importeDe(c, '45'), re.cuotaDeducible)
})

test('390: suma de los cuatro 303; cuatro trimestres aunque algunos estén vacíos', () => {
  const ops: OperacionIva[] = [
    ...trimestre1().filter((o) => o.ref !== 'FUERA'),
    op({ ref: 'F-T2', sentido: 'emitida', fecha: '2026-05-10', base: 200000, tipoIva: 21, cuota: 42000 }),
    op({ ref: 'C-T2', sentido: 'recibida', fecha: '2026-05-12', base: 50000, tipoIva: 21, cuota: 10500 }),
    op({ ref: 'F-T4', sentido: 'emitida', fecha: '2026-12-31', base: 10000, tipoIva: 10, cuota: 1000 }),
  ]
  const a = calcularModelo390(ops, { anio: 2026, regimenIva: 'general' })
  assert.equal(a.trimestres.length, 4)
  assert.equal(importeDe(a, '09'), 21000 + 42000)
  assert.equal(importeDe(a, '06'), 5000 + 1000)
  assert.equal(importeDe(a, '27'), 40450 + 42000 + 1000)
  assert.equal(importeDe(a, '45'), 51450 + 10500)
  assert.equal(importeDe(a, '46'), importeDe(a, '27') - importeDe(a, '45'))
  assert.equal(a.resultado, a.trimestres.reduce((t, x) => t + (x.resultado ?? 0), 0), 'resultado anual = suma de los 303')
  assert.equal(a.volumenOperaciones, 100000 + 200000 + 50000 + 20000 + 10000)
  assert.deepEqual(casillaDe(a, '09')!.origen, ['F-1', 'F-T2'])
  assert.equal(importeDe(a, '08'), 21, 'el tipo no se suma entre trimestres')
  assert.ok(a.avisos.some((x) => /390/.test(x)))
})

test('390: un trimestre con régimen no soportado bloquea el anual', () => {
  const ops = [op({ sentido: 'recibida', fecha: '2026-08-01', base: 1000, tipoIva: 21, cuota: 210, regimen: 'prorrata' })]
  const a = calcularModelo390(ops, { anio: 2026, regimenIva: 'general' })
  assert.equal(a.resultado, null)
  assert.ok(a.noSoportado.length > 0)
})
