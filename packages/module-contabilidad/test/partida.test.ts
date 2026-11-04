// Tests del núcleo de doble partida (src/partida). Node test runner (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  aCentimos, formatearCentimos, porcentajeDe, esCentimos, ErrorContable,
  crearPlan, crearSubcuenta, SEMILLA_PGC_PYMES,
  crearAsiento, validarAsiento, rectificar, ejercicioNatural, totalesAsiento,
  asientoDesdeHecho, combinarReglas, REGLAS_PGC,
  libroDiario, libroMayor, sumasYSaldos, balanceSituacion, cuentaPyG,
} from '../src/index.ts'
import type { Asiento, HechoContable } from '../src/index.ts'

const plan = crearPlan()
const ej = ejercicioNatural(2026)
const asiento = (fecha: string, apuntes: [string, number, number][], extra: Partial<Asiento> = {}): Asiento => ({
  fecha, ejercicio: Number(fecha.slice(0, 4)), concepto: 'test',
  apuntes: apuntes.map(([cuenta, debe, haber]) => ({ cuenta, debe, haber })), ...extra,
})
const contabilizar = (h: HechoContable, numero?: number): Asiento =>
  crearAsiento({ ...asientoDesdeHecho(h), ...(numero !== undefined ? { numero } : {}) }, plan, ej)

// ── dinero ─────────────────────────────────────────────────────────────────────
test('formato español de céntimos', () => {
  assert.equal(formatearCentimos(216249), '2.162,49€')
  assert.equal(formatearCentimos(0), '0,00€')
  assert.equal(formatearCentimos(5), '0,05€')
  assert.equal(formatearCentimos(100000), '1.000,00€')
  assert.equal(formatearCentimos(-123456789), '-1.234.567,89€')
})
test('aCentimos redondea sin errores de float y esCentimos rechaza decimales', () => {
  assert.equal(aCentimos(1.005), 101)
  assert.equal(aCentimos(0.29), 29)
  assert.equal(aCentimos(-2.5), -250)
  assert.equal(esCentimos(1.5), false)
  assert.equal(esCentimos(NaN), false)
  assert.equal(porcentajeDe(10000, 21), 2100)
  assert.equal(porcentajeDe(333, 21), 70)
})

// ── plan ───────────────────────────────────────────────────────────────────────
test('semilla PGC: cuentas clave, grupo y naturaleza', () => {
  for (const c of ['100','129','173','206','218','281','400','4009','410','430','436','465','472','477','4750','4751','476','520','551','555','570','572','600','607','621','629','631','640','642','662','669','680','681','700','705','759','769'])
    assert.ok(plan.cuentas[c], `falta ${c}`)
  assert.equal(plan.cuentas['430'].naturaleza, 'deudora')
  assert.equal(plan.cuentas['477'].naturaleza, 'acreedora')
  assert.equal(plan.cuentas['281'].grupo, 2)
  assert.equal(Object.keys(plan.cuentas).length, SEMILLA_PGC_PYMES.length)
})
test('plantilla sectorial añade cuentas; duplicado es error', () => {
  const p = crearPlan(SEMILLA_PGC_PYMES, [['7051', 'Mano de obra taller', 'A']])
  assert.equal(p.cuentas['7051'].naturaleza, 'acreedora')
  assert.throws(() => crearPlan(SEMILLA_PGC_PYMES, [['430', 'dup', 'D']]), /duplicada/)
})
test('crearSubcuenta: hereda, desactiva al padre, no muta, valida', () => {
  const p2 = crearSubcuenta(plan, '430000001', 'Cliente Uno')
  assert.equal(p2.cuentas['430000001'].naturaleza, 'deudora')
  assert.equal(p2.cuentas['430000001'].grupo, 4)
  assert.equal(p2.cuentas['430'].admiteApuntes, false)
  assert.equal(plan.cuentas['430'].admiteApuntes, true)
  assert.throws(() => crearSubcuenta(plan, '430000001', ''), ErrorContable)
  assert.throws(() => crearSubcuenta(p2, '430000001', 'x'), /ya existe/)
  assert.throws(() => crearSubcuenta(plan, '999000001', 'x'), /no cuelga/)
  assert.throws(() => crearSubcuenta(plan, 'abc', 'x'), /inválido/)
})

// ── asiento ────────────────────────────────────────────────────────────────────
test('asiento cuadrado válido y congelado', () => {
  const a = crearAsiento(asiento('2026-03-01', [['572', 1000, 0], ['100', 0, 1000]]), plan, ej)
  assert.deepEqual(totalesAsiento(a), { debe: 1000, haber: 1000 })
  assert.throws(() => { (a.apuntes as any).push({}) }, TypeError)
  assert.throws(() => { (a.apuntes[0] as any).debe = 5 }, TypeError)
})
test('rechaza descuadre', () => {
  assert.throws(() => crearAsiento(asiento('2026-03-01', [['572', 1000, 0], ['100', 0, 999]]), plan, ej), /descuadrado/)
})
test('rechaza: <2 apuntes, debe y haber a la vez, ambos 0, negativos, decimales', () => {
  const e = (a: Asiento) => validarAsiento(a, plan, ej).join('|')
  assert.match(e(asiento('2026-03-01', [['572', 0, 0]])), /al menos 2/)
  assert.match(e(asiento('2026-03-01', [['572', 100, 100], ['100', 0, 0]])), /XOR/)
  assert.match(e(asiento('2026-03-01', [['572', 0, 0], ['100', 0, 0]])), /XOR/)
  assert.match(e(asiento('2026-03-01', [['572', -5, 0], ['100', 0, -5]])), /negativos/)
  assert.match(e(asiento('2026-03-01', [['572', 10.5, 0], ['100', 0, 10.5]])), /enteros/)
})
test('rechaza cuenta inexistente y cuenta no hoja', () => {
  assert.match(validarAsiento(asiento('2026-03-01', [['999', 5, 0], ['100', 0, 5]]), plan, ej).join(), /no existe/)
  const p2 = crearSubcuenta(plan, '430000001', 'C1')
  assert.match(validarAsiento(asiento('2026-03-01', [['430', 5, 0], ['100', 0, 5]]), p2, ej).join(), /nivel hoja/)
  assert.deepEqual(validarAsiento(asiento('2026-03-01', [['430000001', 5, 0], ['100', 0, 5]]), p2, ej), [])
})
test('rechaza fecha fuera de ejercicio, inválida o ejercicio cerrado', () => {
  const ap: [string, number, number][] = [['572', 5, 0], ['100', 0, 5]]
  assert.match(validarAsiento(asiento('2025-12-31', ap, { ejercicio: 2026 }), plan, ej).join(), /fuera del ejercicio/)
  assert.match(validarAsiento(asiento('2026-02-30', ap), plan, ej).join(), /fecha inválida/)
  assert.match(validarAsiento(asiento('2026-03-01', ap), plan, ejercicioNatural(2026, false)).join(), /cerrado/)
  assert.match(validarAsiento(asiento('2026-03-01', ap, { ejercicio: 2025 }), plan, ej).join(), /ejercicio 2025/)
})

// ── hechos → asientos ──────────────────────────────────────────────────────────
test('venta con 2 tipos de IVA + retención', () => {
  const a = contabilizar({
    tipo: 'venta', fecha: '2026-04-10', ref: 'F-1',
    desglose: [{ base: 10000, tipoIva: 21 }, { base: 5000, tipoIva: 10 }], retencion: 1500,
  })
  // 150,00 base total; cuotas 21,00 + 5,00 = 26,00; retención 15,00 → cliente 161,00
  const t = (c: string) => a.apuntes.filter(p => p.cuenta === c)
  assert.equal(t('430')[0].debe, 16100)
  assert.equal(t('473')[0].debe, 1500)
  assert.equal(t('705')[0].haber, 15000)
  assert.equal(t('477')[0].haber, 2600)
  assert.deepEqual(totalesAsiento(a), { debe: 17600, haber: 17600 })
  assert.deepEqual(a.origen, { tipo: 'venta', ref: 'F-1' })
})
test('venta a 0% IVA no genera apunte de cuota; cliente = subcuenta', () => {
  const p2 = crearSubcuenta(plan, '430000001', 'C1')
  const a = crearAsiento(asientoDesdeHecho({ tipo: 'venta', fecha: '2026-04-10', ref: 'X', desglose: [{ base: 500, tipoIva: 0 }], cuentaTercero: '430000001' }), p2, ej)
  assert.equal(a.apuntes.length, 2)
  assert.equal(a.apuntes[0].cuenta, '430000001')
})
test('compra con retención y cuenta de gasto por línea', () => {
  const a = contabilizar({
    tipo: 'compra', fecha: '2026-05-02', ref: 'P-9',
    desglose: [{ base: 20000, tipoIva: 21, cuentaContrapartida: '623' }], retencion: 3000,
  })
  assert.equal(a.apuntes.find(p => p.cuenta === '623')!.debe, 20000)
  assert.equal(a.apuntes.find(p => p.cuenta === '472')!.debe, 4200)
  assert.equal(a.apuntes.find(p => p.cuenta === '400')!.haber, 21200)
  assert.equal(a.apuntes.find(p => p.cuenta === '4751')!.haber, 3000)
})
test('cobro y pago', () => {
  const c = contabilizar({ tipo: 'cobro', fecha: '2026-04-20', ref: 'C1', importe: 7000 })
  assert.deepEqual(c.apuntes.map(p => [p.cuenta, p.debe, p.haber]), [['572', 7000, 0], ['430', 0, 7000]])
  const p = contabilizar({ tipo: 'pago', fecha: '2026-04-21', ref: 'P1', importe: 900, cuentaTesoreria: '570' })
  assert.deepEqual(p.apuntes.map(x => [x.cuenta, x.debe, x.haber]), [['400', 900, 0], ['570', 0, 900]])
})
test('nómina: bruto, SS empresa, IRPF, SS trabajador, líquido', () => {
  const a = contabilizar({ tipo: 'nomina', fecha: '2026-01-31', ref: 'N-01', bruto: 200000, ssEmpresa: 64000, irpf: 20000, ssTrabajador: 12700, liquido: 167300 })
  const g = (c: string) => a.apuntes.find(p => p.cuenta === c)!
  assert.equal(g('640').debe, 200000)
  assert.equal(g('642').debe, 64000)
  assert.equal(g('4751').haber, 20000)
  assert.equal(g('476').haber, 76700)
  assert.equal(g('465').haber, 167300)
  assert.deepEqual(totalesAsiento(a), { debe: 264000, haber: 264000 })
})
test('hechos inválidos: nómina que no cuadra, negativos, decimales, desglose vacío, retención > base', () => {
  assert.throws(() => asientoDesdeHecho({ tipo: 'nomina', fecha: '2026-01-31', ref: 'N', bruto: 1000, ssEmpresa: 0, irpf: 100, ssTrabajador: 50, liquido: 900 }), /no cuadra|≠/)
  assert.throws(() => asientoDesdeHecho({ tipo: 'cobro', fecha: '2026-01-31', ref: 'x', importe: -1 }), /negativo/)
  assert.throws(() => asientoDesdeHecho({ tipo: 'cobro', fecha: '2026-01-31', ref: 'x', importe: 1.5 }), /entero/)
  assert.throws(() => asientoDesdeHecho({ tipo: 'venta', fecha: '2026-01-31', ref: 'x', desglose: [] }), /desglose/)
  assert.throws(() => asientoDesdeHecho({ tipo: 'venta', fecha: '2026-01-31', ref: 'x', desglose: [{ base: 100, tipoIva: 21 }], retencion: 200 }), /retención/)
})
test('reglas configurables: plantilla sectorial cambia cuentas', () => {
  const r = combinarReglas(REGLAS_PGC, { venta: { ingreso: '7051' } })
  const p2 = crearPlan(SEMILLA_PGC_PYMES, [['7051', 'Mano de obra', 'A']])
  const a = crearAsiento(asientoDesdeHecho({ tipo: 'venta', fecha: '2026-04-10', ref: 'F', desglose: [{ base: 1000, tipoIva: 21 }] }, r), p2, ej)
  assert.ok(a.apuntes.some(p => p.cuenta === '7051'))
  assert.equal(REGLAS_PGC.venta.ingreso, '705')
})

// ── contraasiento ──────────────────────────────────────────────────────────────
test('contraasiento invierte, no toca el original y neutraliza saldos', () => {
  const orig = contabilizar({ tipo: 'venta', fecha: '2026-04-10', ref: 'F-1', desglose: [{ base: 10000, tipoIva: 21 }] }, 1)
  const antes = JSON.stringify(orig)
  const rect = crearAsiento(rectificar(orig, { fecha: '2026-04-12', numero: 2 }), plan, ej)
  assert.equal(JSON.stringify(orig), antes)
  assert.equal(rect.rectificaA, 1)
  assert.deepEqual(rect.apuntes.map(p => [p.cuenta, p.debe, p.haber]), orig.apuntes.map(p => [p.cuenta, p.haber, p.debe]))
  const s = sumasYSaldos([orig, rect])
  assert.ok(s.filas.every(f => f.saldoDeudor === 0 && f.saldoAcreedor === 0))
  assert.ok(s.cuadra)
})

// ── libros ─────────────────────────────────────────────────────────────────────
function ejercicioDemo(): Asiento[] {
  return [
    contabilizar({ tipo: 'venta', fecha: '2026-02-10', ref: 'F-1', desglose: [{ base: 100000, tipoIva: 21 }] }, 2),
    crearAsiento({ ...asiento('2026-01-02', [['572', 500000, 0], ['100', 0, 500000]], { concepto: 'Capital' }), numero: 1 }, plan, ej),
    contabilizar({ tipo: 'cobro', fecha: '2026-02-20', ref: 'C-1', importe: 60000 }, 3),
    contabilizar({ tipo: 'compra', fecha: '2026-03-05', ref: 'P-1', desglose: [{ base: 30000, tipoIva: 21 }] }, 4),
    contabilizar({ tipo: 'nomina', fecha: '2026-03-31', ref: 'N-3', bruto: 150000, ssEmpresa: 45000, irpf: 15000, ssTrabajador: 9500, liquido: 125500 }, 5),
    contabilizar({ tipo: 'pago', fecha: '2026-04-01', ref: 'PG-1', importe: 20000 }, 6),
    crearAsiento({ ...asiento('2026-04-30', [['681', 8000, 0], ['281', 0, 8000]], { concepto: 'Amortización' }), numero: 7 }, plan, ej),
  ]
}

test('diario ordena por fecha y número; periodo filtra', () => {
  const d = libroDiario(ejercicioDemo())
  assert.deepEqual(d.map(a => a.numero), [1, 2, 3, 4, 5, 6, 7])
  const mismo = [asiento('2026-01-01', [['572', 1, 0], ['100', 0, 1]], { numero: 9 }), asiento('2026-01-01', [['572', 1, 0], ['100', 0, 1]], { numero: 3 })]
  assert.deepEqual(libroDiario(mismo).map(a => a.numero), [3, 9])
  assert.equal(libroDiario(ejercicioDemo(), { desde: '2026-03-01', hasta: '2026-03-31' }).length, 2)
})
test('mayor con saldo acumulado y subcuentas', () => {
  const m = libroMayor(ejercicioDemo(), '572')
  assert.deepEqual(m.lineas.map(l => l.saldo), [500000, 560000, 540000])
  assert.equal(m.saldo, 540000)
  assert.equal(m.totalDebe - m.totalHaber, m.saldo)
  const p2 = crearSubcuenta(plan, '430000001', 'C1')
  const a = crearAsiento(asientoDesdeHecho({ tipo: 'venta', fecha: '2026-05-01', ref: 'S', desglose: [{ base: 100, tipoIva: 0 }], cuentaTercero: '430000001' }), p2, ej)
  assert.equal(libroMayor([a], '430').lineas.length, 1)
  assert.equal(libroMayor([a], '430', { subcuentas: false }).lineas.length, 0)
  assert.equal(libroMayor(ejercicioDemo(), '572', { desde: '2026-03-01', saldoInicial: 560000 }).saldo, 540000)
})
test('sumas y saldos cuadran en total', () => {
  const s = sumasYSaldos(ejercicioDemo())
  assert.equal(s.totales.debe, s.totales.haber)
  assert.equal(s.totales.saldoDeudor, s.totales.saldoAcreedor)
  assert.ok(s.cuadra)
  assert.equal(s.filas.find(f => f.cuenta === '572')!.saldoDeudor, 540000)
  assert.equal(s.filas.find(f => f.cuenta === '477')!.saldoAcreedor, 21000)
  assert.equal(sumasYSaldos(ejercicioDemo(), { hasta: '2026-01-31' }).filas.length, 2)
})
test('PyG abreviada', () => {
  const p = cuentaPyG(ejercicioDemo())
  // ventas 1000,00 − compras 300,00 − sueldos 1500,00 − SS 450,00 − amortización 80,00
  assert.equal(p.lineas.find(l => l.clave === '1')!.importe, 100000)
  assert.equal(p.lineas.find(l => l.clave === '4')!.importe, -30000)
  assert.equal(p.lineas.find(l => l.clave === '6')!.importe, -195000)
  assert.equal(p.lineas.find(l => l.clave === '8')!.importe, -8000)
  assert.equal(p.resultadoEjercicio, 100000 - 30000 - 195000 - 8000)
})
test('balance de situación cuadra; resultado = PyG', () => {
  const asientos = ejercicioDemo()
  const b = balanceSituacion(asientos)
  assert.ok(b.cuadra, `${b.totalActivo} vs ${b.totalPatrimonioNetoYPasivo}`)
  assert.equal(b.resultadoEjercicio, cuentaPyG(asientos).resultadoEjercicio)
  assert.equal(b.activo.find(r => r.clave === 'B.IV')!.importe, 540000)
  assert.equal(b.activo.find(r => r.clave === 'A.II')!.importe, -8000)
})
test('balance cuadra con saldos contrarios (cliente acreedor, IRPF a favor) y tras rectificar', () => {
  const extra = [
    crearAsiento(asiento('2026-06-01', [['572', 1000, 0], ['430', 0, 1000]]), plan, ej), // cobro sin factura: 430 acreedor
    crearAsiento(asiento('2026-06-02', [['551', 700, 0], ['100', 0, 700]]), plan, ej),
  ]
  const todo = [...ejercicioDemo(), ...extra]
  assert.ok(balanceSituacion(todo).cuadra)
  const rect = crearAsiento(rectificar(todo[0], { fecha: '2026-07-01' }), plan, ej)
  assert.ok(balanceSituacion([...todo, rect]).cuadra)
  assert.ok(sumasYSaldos([...todo, rect]).cuadra)
})
