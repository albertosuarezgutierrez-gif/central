// F5 (núcleo): inmovilizado, periodificaciones, regularización/cierre/apertura, cuentas anuales abreviadas, borradores 200/202 y libros.
// Cepos vistos FALLAR el 05/11/2026 (rompiendo el código y restaurando): ver el bloque «CEPOS» al final de este fichero.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crearPlan, crearAsiento, ejercicioNatural, saldosDeAsientos, totalesAsiento, ErrorContable, formatearCentimos,
  fichaDesdeEntrada, cuadroAmortizacion, asientoAmortizacion, bajaActivo, acumuladaTrasMeses, amortizable, asientoAltaInmovilizado,
  TABLA_AMORTIZACION_DEFECTO, resumenActivo, amortizacionAcumuladaHasta,
  asientoPeriodificacion, asientoReversaPeriodificacion, repartirPeriodificacion,
  asientoRegularizacion, asientoCierre, asientoApertura, prepararCierre, diferenciasAperturaCierre, asientosParaCuentasAnuales, resultadoDeAsientos,
  transicionEjercicioValida, exigirEjercicioAbierto,
  balanceAbreviado, pygAbreviada, memoriaBorrador, memoriaATexto,
  borrador200, borrador202, borradorIsCsv, borradorIsHtml, ejercicioBase202, porPuntosBasicos,
  libroDiarioLegal, libroInventarios, libroCuentasAnuales,
  type Asiento, type FichaActivo, type EntradaInmovilizado,
} from '../src/index.ts'

const plan = crearPlan()
const ej = (anio: number, abierto = true) => ejercicioNatural(anio, abierto)
const as = (fecha: string, apuntes: [string, number, number][], extra: Partial<Asiento> = {}): Asiento =>
  crearAsiento({ fecha, ejercicio: Number(fecha.slice(0, 4)), concepto: 'x', apuntes: apuntes.map(([cuenta, debe, haber]) => ({ cuenta, debe, haber })), ...extra }, plan, ej(Number(fecha.slice(0, 4))))

const entrada = (o: Partial<EntradaInmovilizado> = {}): EntradaInmovilizado => ({ origen: 'manual', refExterna: 'PORT-1', descripcion: 'Portátil', categoria: 'equipos_informaticos', fechaAlta: '2026-01-15', valorAdquisicion: 120000, ...o })
const ficha = (o: Partial<EntradaInmovilizado> = {}, ref = 'A-1'): FichaActivo => fichaDesdeEntrada(entrada(o), ref)

// ── Inmovilizado ──────────────────────────────────────────────────────────────────────────────────────────────
test('ficha: toma el % máximo de la tabla, cuentas de la categoría y valida la entrada (todos los problemas juntos)', () => {
  const f = ficha()
  assert.equal(f.porcentajePb, 2500)
  assert.deepEqual([f.cuentaActivo, f.cuentaAmortizacionAcumulada, f.cuentaGasto], ['217', '281', '681'])
  assert.equal(f.yaContabilizado, true)
  assert.throws(() => ficha({ porcentajePb: 4000 }), /supera el máximo/)
  assert.throws(() => ficha({ categoria: 'nave' }), /categoría desconocida/)
  assert.throws(() => ficha({ valorAdquisicion: 1.5 as number, valorResidual: 5, fechaAlta: '2026-13-01' }), (e: unknown) => e instanceof ErrorContable && /valor de adquisición/.test(e.message) && /fecha de alta/.test(e.message))
  assert.throws(() => ficha({ valorResidual: 120000 }), /residual/)
})

test('cuadro de amortización: lineal mensual, el mes de alta cuenta, la suma NUNCA supera lo amortizable y acaba exacta', () => {
  const f = ficha({ valorAdquisicion: 100000, porcentajePb: 1000 }) // 10 % anual de 1.000,00 €
  const c = cuadroAmortizacion(f)
  assert.equal(c[0].mes, '2026-01')
  assert.equal(c.length, 120) // 10 años
  assert.equal(c[c.length - 1].acumulada, 100000)
  assert.equal(c[c.length - 1].neto, 0)
  assert.equal(c.reduce((t, x) => t + x.cuota, 0), 100000)
  assert.equal(c.slice(0, 12).reduce((t, x) => t + x.cuota, 0), 10000) // 10 % del primer año
  assert.ok(c.every((x) => x.cuota >= 0 && x.acumulada <= 100000))
  // Valor residual: solo se amortiza la diferencia.
  const r = ficha({ valorAdquisicion: 100000, valorResidual: 10000, porcentajePb: 1000 })
  assert.equal(amortizable(r), 90000)
  assert.equal(cuadroAmortizacion(r).at(-1)!.acumulada, 90000)
  assert.equal(r.valorAdquisicion - cuadroAmortizacion(r).at(-1)!.acumulada, 10000)
})

test('amortización: importes enormes no pierden precisión (BigInt) y el acumulado está topado', () => {
  const f = ficha({ valorAdquisicion: 9_000_000_000_000, porcentajePb: 2500 })
  assert.equal(acumuladaTrasMeses(f, 12), 2_250_000_000_000)
  assert.equal(acumuladaTrasMeses(f, 10_000), 9_000_000_000_000)
})

test('asiento de amortización: Debe 681 / Haber 281 agrupado, cuadra, fechado a fin de periodo; sin cuota → null (no un asiento a cero)', () => {
  const a = ficha({ valorAdquisicion: 120000, porcentajePb: 1200 }, 'A-1')
  const b = ficha({ categoria: 'aplicaciones_informaticas', refExterna: 'SW-1', valorAdquisicion: 60000, porcentajePb: 3300, fechaAlta: '2026-02-10' }, 'A-2')
  const m = asientoAmortizacion([a, b], { anio: 2026, mes: 2 })!
  assert.equal(m.fecha, '2026-02-28')
  assert.deepEqual(m.apuntes.map((p) => p.cuenta).sort(), ['280', '281', '680', '681'])
  const t = totalesAsiento(m)
  assert.equal(t.debe, t.haber)
  assert.ok(t.debe > 0)
  assert.doesNotThrow(() => crearAsiento(m, plan, ej(2026)))
  assert.equal(m.origen?.ref, 'amortizacion:2026-02')
  assert.equal(asientoAmortizacion([a], { anio: 2025, mes: 12 }), null)
  assert.equal(asientoAmortizacion([a], { anio: 2026 })!.origen?.ref, 'amortizacion:2026')
  // El anual = Σ de los 12 mensuales.
  const anual = totalesAsiento(asientoAmortizacion([a, b], { anio: 2026 })!).debe
  let meses = 0
  for (let mes = 1; mes <= 12; mes++) meses += totalesAsiento(asientoAmortizacion([a, b], { anio: 2026, mes })! ?? { apuntes: [] }).debe
  assert.equal(anual, meses)
})

test('alta de otra vertical (RRHH): idempotente por (origen, refExterna) y el asiento de alta solo existe si NO pasó por factura', () => {
  const rrhh = fichaDesdeEntrada({ origen: 'rrhh', refExterna: 'EQUIPO-77', descripcion: 'Móvil de empresa', categoria: 'equipos_informaticos', fechaAlta: '2026-03-01', valorAdquisicion: 80000, yaContabilizado: false }, 'A-9')
  assert.equal(rrhh.origen, 'rrhh')
  const alta = asientoAltaInmovilizado(rrhh, '572')
  assert.deepEqual(alta.apuntes.map((p) => [p.cuenta, p.debe, p.haber]), [['217', 80000, 0], ['572', 0, 80000]])
  assert.throws(() => asientoAltaInmovilizado(ficha(), '572'), /ya está contabilizada/)
})

test('baja/venta: resultado = precio − neto contable; > 0 va a 771, < 0 a 671, y el asiento cuadra', () => {
  const f = ficha({ valorAdquisicion: 100000, porcentajePb: 1000 })
  const acum = amortizacionAcumuladaHasta(f, '2026-12') // 10.000
  assert.equal(acum, 10000)
  const perdida = bajaActivo(f, { fecha: '2026-12-20', amortizacionAcumulada: acum, precioVenta: 50000 })
  assert.equal(perdida.valorNetoContable, 90000)
  assert.equal(perdida.resultado, -40000)
  assert.deepEqual(perdida.asiento.apuntes.map((p) => [p.cuenta, p.debe, p.haber]), [['281', 10000, 0], ['572', 50000, 0], ['671', 40000, 0], ['217', 0, 100000]])
  const beneficio = bajaActivo(f, { fecha: '2026-12-20', amortizacionAcumulada: acum, precioVenta: 95000, cuentaContrapartida: '440' })
  assert.equal(beneficio.resultado, 5000)
  assert.ok(beneficio.asiento.apuntes.some((p) => p.cuenta === '771' && p.haber === 5000))
  const retirada = bajaActivo(f, { fecha: '2026-12-20', amortizacionAcumulada: acum })
  assert.equal(retirada.resultado, -90000)
  for (const r of [perdida, beneficio, retirada]) { const t = totalesAsiento(r.asiento); assert.equal(t.debe, t.haber); assert.doesNotThrow(() => crearAsiento(r.asiento, plan, ej(2026))) }
  assert.throws(() => bajaActivo(f, { fecha: '2026-12-20', amortizacionAcumulada: 100001 }), /supera el valor amortizable/)
  assert.throws(() => bajaActivo(f, { fecha: '2025-12-20', amortizacionAcumulada: 0 }), /anterior al alta/)
})

test('baja: la ficha dada de baja deja de amortizar a partir del mes de la baja', () => {
  const f = { ...ficha({ valorAdquisicion: 120000, porcentajePb: 1200 }), fechaBaja: '2026-03-10' }
  assert.equal(cuadroAmortizacion(f).length, 3)
  assert.equal(resumenActivo(f, '2026-12').totalmenteAmortizado, false)
})

test('la tabla por defecto es dato: todas las filas marcadas «media» (a contrastar) y con cuentas del plan', () => {
  for (const fila of TABLA_AMORTIZACION_DEFECTO) {
    assert.equal(fila.certeza, 'media')
    for (const c of [fila.cuentaActivo, fila.cuentaAmortizacionAcumulada, fila.cuentaGasto]) assert.ok(plan.cuentas[c], `${c} existe en el plan`)
  }
})

// ── Periodificaciones ─────────────────────────────────────────────────────────────────────────────────────────
test('periodificación: seguro anual pagado el 1/7 → 480 con la parte del año siguiente; reversa el 1/1; el ingreso va a 485', () => {
  const seguro = { ref: 'SEG-1', tipo: 'gasto' as const, descripcion: 'Seguro', cuentaOrigen: '625', importe: 36500, inicio: '2026-07-01', fin: '2027-06-30' }
  const r = repartirPeriodificacion(seguro, '2026-12-31')
  assert.equal(r.diasTotales, 365)
  assert.equal(r.diasHastaCierre, 184)
  assert.equal(r.imputado + r.diferido, 36500)
  const ingreso = { ref: 'ALQ-1', tipo: 'ingreso' as const, descripcion: 'Alquiler cobrado', cuentaOrigen: '752', importe: 12000, inicio: '2026-12-01', fin: '2027-01-31' }
  const a = asientoPeriodificacion([seguro, ingreso], 2026)!
  const t = totalesAsiento(a)
  assert.equal(t.debe, t.haber)
  assert.ok(a.apuntes.some((p) => p.cuenta === '480' && p.debe === r.diferido))
  assert.ok(a.apuntes.some((p) => p.cuenta === '485' && p.haber > 0))
  assert.doesNotThrow(() => crearAsiento(a, plan, ej(2026)))
  const rev = asientoReversaPeriodificacion(a)
  assert.equal(rev.fecha, '2027-01-01')
  assert.deepEqual(saldosDeAsientos([a, rev]).filter((s) => s.debe !== s.haber), [])
  assert.equal(asientoPeriodificacion([{ ...seguro, inicio: '2026-01-01', fin: '2026-12-31' }], 2026), null) // nada que diferir
  assert.throws(() => repartirPeriodificacion({ ...seguro, cuentaOrigen: '752' }, '2026-12-31'), /grupo 6/)
})

// ── Regularización, cierre y apertura ─────────────────────────────────────────────────────────────────────────
const diario2026 = (): Asiento[] => [
  as('2026-01-02', [['572', 1000000, 0], ['100', 0, 1000000]], { origen: { tipo: 'manual', ref: 'cap' } }),
  as('2026-03-10', [['430', 363000, 0], ['705', 0, 300000], ['477', 0, 63000]]),
  as('2026-04-10', [['600', 100000, 0], ['472', 21000, 0], ['400', 0, 121000]]),
  as('2026-12-31', [['681', 30000, 0], ['281', 0, 30000]]),
]

test('regularización: cuentas 6/7 a cero y el resultado a la 129 (beneficio al haber)', () => {
  const d = diario2026()
  const reg = asientoRegularizacion(d, 2026)!
  assert.equal(reg.fecha, '2026-12-31')
  assert.ok(reg.apuntes.some((p) => p.cuenta === '129' && p.haber === 170000)) // 300.000 − 100.000 − 30.000
  const tras = saldosDeAsientos([...d, crearAsiento(reg, plan, ej(2026))])
  assert.deepEqual(tras.filter((s) => (s.cuenta[0] === '6' || s.cuenta[0] === '7') && s.debe !== s.haber), [])
  assert.equal(resultadoDeAsientos(d), 170000)
  assert.equal(asientoRegularizacion([...d, crearAsiento(reg, plan, ej(2026))], 2026), null) // ya regularizado
  // Pérdida: 129 al debe.
  const perd = [as('2026-01-05', [['600', 5000, 0], ['572', 0, 5000]])]
  assert.ok(asientoRegularizacion(perd, 2026)!.apuntes.some((p) => p.cuenta === '129' && p.debe === 5000))
})

test('cierre: deja TODAS las cuentas a cero; exige regularizar antes; la apertura es el cierre invertido (apertura ≡ cierre)', () => {
  const d = diario2026()
  assert.throws(() => asientoCierre(d, 2026), /regulariza antes de cerrar/)
  const reg = crearAsiento(asientoRegularizacion(d, 2026)!, plan, ej(2026))
  const cie = crearAsiento(asientoCierre([...d, reg], 2026)!, plan, ej(2026))
  assert.deepEqual(saldosDeAsientos([...d, reg, cie]).filter((s) => s.debe !== s.haber), [])
  const ape = crearAsiento(asientoApertura(cie), plan, ej(2027))
  assert.equal(ape.fecha, '2027-01-01')
  assert.equal(ape.origen?.tipo, 'apertura')
  assert.deepEqual(diferenciasAperturaCierre(cie, ape), [])
  // Saldos de apertura = saldos de cierre (antes de cerrar), cuenta a cuenta.
  const antes = saldosDeAsientos([...d, reg]).filter((s) => s.debe !== s.haber).map((s) => [s.cuenta, s.debe - s.haber])
  const despues = saldosDeAsientos([ape]).map((s) => [s.cuenta, s.debe - s.haber])
  assert.deepEqual(despues, antes)
  // Una apertura manipulada se detecta.
  const rota = { apuntes: ape.apuntes.map((p, i) => (i === 0 ? { ...p, debe: p.debe + 1 } : p)) }
  assert.ok(diferenciasAperturaCierre(cie, rota).length > 0)
})

test('prepararCierre: ejercicio abierto → plan completo y validado; ya cerrado / sin ejercicio siguiente / diario descuadrado → rechazado', () => {
  const entrada = { asientos: diario2026(), anio: 2026, plan, ejercicio: ej(2026), ejercicioSiguiente: ej(2027) }
  const ok = prepararCierre(entrada)
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.equal(ok.plan.resultado, 170000)
    assert.ok(ok.plan.regularizacion && ok.plan.cierre && ok.plan.apertura)
  }
  const cerrado = prepararCierre({ ...entrada, ejercicio: ej(2026, false) })
  assert.ok(!cerrado.ok && cerrado.errores.some((e) => /ya está cerrado/.test(e)))
  const sinSig = prepararCierre({ ...entrada, ejercicioSiguiente: null })
  assert.ok(!sinSig.ok && sinSig.errores.some((e) => /no existe el ejercicio 2027/.test(e)))
  const yaTiene = prepararCierre({ ...entrada, asientos: [...entrada.asientos, as('2026-12-31', [['129', 0, 1], ['572', 1, 0]], { origen: { tipo: 'cierre', ref: 'cierre:2026' } })] })
  assert.ok(!yaTiene.ok && yaTiene.errores.some((e) => /ya tiene asientos de regularización o cierre/.test(e)))
  const roto = { ...entrada.asientos[0], apuntes: [{ cuenta: '572', debe: 5, haber: 0 }, { cuenta: '100', debe: 0, haber: 4 }] } as Asiento
  const desc = prepararCierre({ ...entrada, asientos: [roto] })
  assert.ok(!desc.ok && desc.errores.some((e) => /descuadrado/.test(e)))
})

test('ejercicio cerrado inmutable: no admite asientos y su estado no retrocede', () => {
  const a = { fecha: '2026-06-01', ejercicio: 2026, concepto: 'x', apuntes: [{ cuenta: '572', debe: 1, haber: 0 }, { cuenta: '100', debe: 0, haber: 1 }] }
  assert.throws(() => crearAsiento(a, plan, ej(2026, false)), /está cerrado/)
  assert.throws(() => exigirEjercicioAbierto(ej(2026, false)), /cerrado/)
  assert.equal(transicionEjercicioValida('cerrado', 'abierto'), false)
  assert.equal(transicionEjercicioValida('cerrado', 'en_cierre'), false)
  assert.equal(transicionEjercicioValida('abierto', 'cerrado'), true)
  assert.equal(transicionEjercicioValida('en_cierre', 'abierto'), true)
})

// ── Cuentas anuales ───────────────────────────────────────────────────────────────────────────────────────────
test('balance abreviado: Activo = Pasivo + PN, con el resultado en PN.VII, 281 neteando el inmovilizado y la 129 anterior en PN.V', () => {
  const d = [
    ...diario2026(),
    as('2026-02-01', [['217', 120000, 0], ['572', 0, 120000]]),
    as('2026-02-02', [['129', 0, 40000], ['572', 40000, 0]]), // resultado anterior pendiente de aplicar (apertura simulada)
  ]
  const b = balanceAbreviado(saldosDeAsientos(d), '2026-12-31')
  assert.equal(b.cuadra, true)
  assert.equal(b.totalActivo, b.totalPatrimonioNetoYPasivo)
  assert.equal(b.resultadoEjercicio, 170000)
  const get = (clave: string) => [...b.activo, ...b.patrimonioNetoYPasivo].find((l) => l.clave === clave)
  assert.equal(get('PN.VII')?.importe, 170000)
  assert.equal(get('PN.V')?.importe, 40000)
  assert.equal(get('A.II')?.importe, 120000 - 30000) // 217 − 281
  assert.equal(b.totalActivoAnterior, null) // sin saldos anteriores: null, no 0
  assert.ok(b.avisos.some((a) => /Sin saldos del ejercicio anterior/.test(a)))
})

test('balance: saldo contrario al natural (proveedor deudor, cliente acreedor, banco en descubierto) se reclasifica y sigue cuadrando', () => {
  const d = [as('2026-01-02', [['400', 5000, 0], ['551', 6000, 0], ['572', 0, 9000], ['430', 0, 2000]])]
  const b = balanceAbreviado(saldosDeAsientos(d), '2026-01-31')
  assert.equal(b.cuadra, true)
  assert.ok(b.activo.some((l) => l.clave === 'B.II' && l.importe === 5000)) // anticipo a proveedor
  assert.ok(b.patrimonioNetoYPasivo.some((l) => l.clave === 'PC.III' && l.importe === 9000)) // descubierto
  assert.ok(b.patrimonioNetoYPasivo.some((l) => l.clave === 'PC.V' && l.importe === 2000)) // cliente acreedor
})

test('balance tras cerrar: el cierre se excluye (asientosParaCuentasAnuales) y las cifras no se pierden', () => {
  const d = diario2026()
  const reg = crearAsiento(asientoRegularizacion(d, 2026)!, plan, ej(2026))
  const cie = crearAsiento(asientoCierre([...d, reg], 2026)!, plan, ej(2026))
  const todos = [...d, reg, cie]
  const base = balanceAbreviado(saldosDeAsientos(asientosParaCuentasAnuales(d)), '2026-12-31')
  const trasCierre = balanceAbreviado(saldosDeAsientos(asientosParaCuentasAnuales(todos)), '2026-12-31')
  assert.equal(trasCierre.totalActivo, base.totalActivo)
  assert.equal(trasCierre.cuadra, true)
  assert.equal(trasCierre.resultadoEjercicio, 170000)
  assert.equal(balanceAbreviado(saldosDeAsientos(todos), '2026-12-31').totalActivo, 0, 'sin excluir el cierre todo quedaría a cero (lo que NO debe pasar en las cuentas anuales)')
})

test('PyG abreviada: ingresos +, gastos −, subtotales y resultado = Σ grupos 6/7; amortización y 671 en sus líneas', () => {
  const d = [
    ...diario2026(),
    as('2026-07-01', [['640', 20000, 0], ['572', 0, 20000]]),
    as('2026-08-01', [['662', 1000, 0], ['572', 0, 1000]]),
    as('2026-09-01', [['671', 2000, 0], ['572', 0, 2000]]),
    as('2026-10-01', [['630', 3000, 0], ['4752', 0, 3000]]),
  ]
  const p = pygAbreviada(saldosDeAsientos(d), { desde: '2026-01-01', hasta: '2026-12-31' })
  const l = (k: string) => p.lineas.find((x) => x.clave === k)?.importe
  assert.equal(l('1'), 300000)
  assert.equal(l('4'), -100000)
  assert.equal(l('6'), -20000)
  assert.equal(l('8'), -30000)
  assert.equal(l('11'), -2000)
  assert.equal(l('14'), -1000)
  assert.equal(l('17'), -3000)
  assert.equal(p.resultadoExplotacion, 300000 - 100000 - 20000 - 30000 - 2000)
  assert.equal(p.resultadoEjercicio, resultadoDeAsientos(d))
  assert.equal(p.resultadoEjercicioAnterior, null)
})

test('memoria borrador: usa los datos que hay y MARCA lo que falta (nunca inventa ni pone 0)', () => {
  const d = diario2026()
  const balance = balanceAbreviado(saldosDeAsientos(d), '2026-12-31')
  const pyg = pygAbreviada(saldosDeAsientos(d), { desde: '2026-01-01', hasta: '2026-12-31' })
  const m = memoriaBorrador({ empresa: { razonSocial: 'Taller SL', nif: 'B12345674' }, anio: 2026, actividad: null, balance, pyg, inmovilizado: null, empleadosMedios: null, ejercicioCerrado: false })
  const txt = memoriaATexto(m)
  assert.match(txt, /Taller SL/)
  assert.ok(txt.includes(formatearCentimos(170000)))
  assert.ok(m.pendientes.includes('Actividad de la empresa'))
  assert.ok(m.pendientes.includes('Número medio de empleados'))
  assert.ok(m.pendientes.includes('Movimientos del inmovilizado (no se han calculado)'))
  assert.match(txt, /ABIERTO/)
  const completa = memoriaBorrador({ empresa: { razonSocial: 'T', nif: 'B1' }, anio: 2026, actividad: 'Reparación de vehículos', balance, pyg, inmovilizado: [], empleadosMedios: 3, ejercicioCerrado: true })
  assert.ok(!completa.pendientes.includes('Actividad de la empresa') && !completa.pendientes.includes('Número medio de empleados'))
})

// ── Modelos 200 y 202 ─────────────────────────────────────────────────────────────────────────────────────────
const e200 = (o: object = {}) => ({ anio: 2026, resultadoAntesImpuestos: 1000000, ajustesPositivos: 50000, ajustesNegativos: 20000, compensacionBasesNegativas: 0, tipoGravamenPb: 2500, deducciones: 10000, retenciones: 5000, pagosFraccionados: 100000, ...o })

test('200: cálculo completo — BI, cuota íntegra al tipo, líquida y resultado', () => {
  const c = borrador200(e200())
  const v = (k: string) => c.casillas.find((x) => x.codigo === k)!.importe
  assert.equal(v('BIP'), 1030000)
  assert.equal(v('BI'), 1030000)
  assert.equal(v('CI'), 257500)
  assert.equal(v('CL'), 247500)
  assert.equal(c.resultado, 247500 - 5000 - 100000)
  assert.deepEqual(c.faltan, [])
  assert.ok(c.casillas.every((x) => x.certeza === 'media' && /pendiente de contrastar/.test(x.descripcion)))
  assert.equal(c.ficheroOficial, 'diseño oficial pendiente de contrastar')
})

test('200: si FALTA un dato el resultado es null (no 0) y se dice cuál; nunca se rellena por defecto', () => {
  for (const [campo, texto] of [['ajustesPositivos', /Ajustes positivos/], ['compensacionBasesNegativas', /Compensación/], ['tipoGravamenPb', /Tipo de gravamen/], ['deducciones', /Deducciones/], ['retenciones', /Retenciones/], ['pagosFraccionados', /Pagos fraccionados/]] as const) {
    const c = borrador200(e200({ [campo]: null }))
    assert.equal(c.resultado, null, campo)
    assert.ok(c.faltan.some((f) => texto.test(f)), campo)
  }
  const sinAjustes = borrador200(e200({ ajustesPositivos: null, ajustesNegativos: null }))
  assert.equal(sinAjustes.casillas.find((x) => x.codigo === 'BI')!.importe, null)
  assert.equal(sinAjustes.casillas.find((x) => x.codigo === 'CI')!.importe, null)
  // Un 0 EXPLÍCITO sí es un dato.
  assert.notEqual(borrador200(e200({ deducciones: 0 })).resultado, null)
})

test('200: base negativa → cuota 0 y aviso; compensación mayor que la base → no calculable', () => {
  const neg = borrador200(e200({ resultadoAntesImpuestos: -500000, ajustesPositivos: 0, ajustesNegativos: 0, deducciones: 0, retenciones: 0, pagosFraccionados: 0 }))
  assert.equal(neg.casillas.find((x) => x.codigo === 'CI')!.importe, 0)
  assert.ok(neg.avisos.some((a) => /Base imponible negativa/.test(a)))
  const exceso = borrador200(e200({ compensacionBasesNegativas: 99999999 }))
  assert.equal(exceso.resultado, null)
  assert.ok(exceso.faltan.some((f) => /supera la base/.test(f)))
})

test('202: art. 40.2 y art. 40.3 con su porcentaje; ejercicio base correcto; falta de dato → null', () => {
  assert.equal(ejercicioBase202(2026, '1P'), 2024)
  assert.equal(ejercicioBase202(2026, '2P'), 2025)
  const c = borrador202({ anio: 2026, periodo: '1P', modalidad: 'art40_2', cuotaIntegraBase: 1000000, deduccionesBase: 100000, retencionesBase: 50000, baseImponibleMeses: null, retencionesPeriodo: null, pagosAnteriores: null })
  assert.equal(c.resultado, 153000) // 18 % × (1.000.000 − 100.000 − 50.000)
  assert.deepEqual(c.faltan, [])
  const segundo = borrador202({ anio: 2026, periodo: '2P', modalidad: 'art40_2', cuotaIntegraBase: 1000000, deduccionesBase: 0, retencionesBase: 0, baseImponibleMeses: null, retencionesPeriodo: null, pagosAnteriores: 153000 })
  assert.equal(segundo.resultado, 180000 - 153000)
  const sinPagos = borrador202({ anio: 2026, periodo: '3P', modalidad: 'art40_2', cuotaIntegraBase: 1000000, deduccionesBase: 0, retencionesBase: 0, baseImponibleMeses: null, retencionesPeriodo: null, pagosAnteriores: null })
  assert.equal(sinPagos.resultado, null)
  assert.ok(sinPagos.faltan.some((f) => /Pagos fraccionados ya ingresados/.test(f)))
  const art3 = borrador202({ anio: 2026, periodo: '2P', modalidad: 'art40_3', cuotaIntegraBase: null, deduccionesBase: null, retencionesBase: null, baseImponibleMeses: 2000000, retencionesPeriodo: 10000, pagosAnteriores: 100000 })
  assert.equal(art3.resultado, 360000 - 100000 - 10000)
  const sinModalidad = borrador202({ anio: 2026, periodo: '1P', modalidad: null, cuotaIntegraBase: null, deduccionesBase: null, retencionesBase: null, baseImponibleMeses: null, retencionesPeriodo: null, pagosAnteriores: null })
  assert.equal(sinModalidad.resultado, null)
  assert.ok(sinModalidad.faltan.some((f) => /Modalidad/.test(f)))
  assert.equal(borrador202({ anio: 2026, periodo: '1P', modalidad: 'art40_2', cuotaIntegraBase: null, deduccionesBase: 0, retencionesBase: 0, baseImponibleMeses: null, retencionesPeriodo: null, pagosAnteriores: null }).resultado, null)
})

test('borrador IS: HTML y CSV llevan la marca de pendiente de contrastar y una casilla sin dato sale VACÍA, nunca 0', () => {
  const c = borrador200(e200({ deducciones: null }))
  const csv = borradorIsCsv(c)
  assert.match(csv, /pendiente de contrastar/)
  assert.match(csv, /# FALTA: Deducciones/)
  const fila = csv.split('\r\n').find((l) => l.split(';')[3] === 'DED')!
  assert.equal(fila.split(';')[5], '')
  const html = borradorIsHtml(c, { empresa: 'X <b>', generado: '2026-11-05' })
  assert.match(html, /Borrador sin validez ante la AEAT/)
  assert.match(html, /pendiente: falta un dato/)
  assert.ok(!html.includes('X <b>'))
  assert.equal(porPuntosBasicos(1005, 2500), 251) // 251,25 → 251
  assert.equal(porPuntosBasicos(-1005, 2500), -251)
})

// ── Libros para legalizar ─────────────────────────────────────────────────────────────────────────────────────
test('libros: diario con totales debe = haber, inventarios en tres partes, cuentas anuales con la columna anterior vacía (no 0) y XBRL marcado pendiente', () => {
  const d = diario2026().map((a, i) => ({ ...a, numero: i + 1 }))
  const nombres = { '572': 'Bancos', '100': 'Capital' }
  const diario = libroDiarioLegal(d, nombres, { anio: 2026, empresa: 'Taller SL' })
  assert.equal(diario.totales!.debe, diario.totales!.haber)
  assert.equal(diario.filas[0].nombre, 'Bancos')
  const [ini, comp, cie] = libroInventarios(d, nombres, { anio: 2026, empresa: 'Taller SL' })
  assert.equal(ini.totales, null) // sin apertura: vacío, no cero
  assert.ok(ini.avisos.some((a) => /No hay asiento de apertura/.test(a)))
  assert.equal(comp.filas.filter((f) => f.trimestre === '1T').length > 0, true)
  assert.equal(cie.totales!.debe, cie.totales!.haber)
  const b = balanceAbreviado(saldosDeAsientos(d), '2026-12-31')
  const p = pygAbreviada(saldosDeAsientos(d), { desde: '2026-01-01', hasta: '2026-12-31' })
  const cu = libroCuentasAnuales(b, p, { anio: 2026, empresa: 'Taller SL' })
  assert.equal(cu.length, 3)
  assert.ok(cu.every((t) => t.filas.every((f) => f.anterior === null)))
  assert.ok(cu[0].avisos.some((a) => /XBRL.*NO implementado/.test(a)))
})
