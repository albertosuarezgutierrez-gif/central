// F5 en la app: inmovilizado y amortizaciones, periodificaciones, cierre/apertura del ejercicio y cuentas anuales, con repositorios en memoria que imitan 0005.
// Cepos vistos FALLAR el 05/11/2026 (rompiendo el código y restaurando):
//   (1) quitar de `cerrarEjercicio` el chequeo de `bloqueos` → rojo en «cierre bloqueado»;
//   (2) quitar el `if (previo) return … duplicado` de `amortizarPeriodo` → rojo en «amortización idempotente» (el fake imita el índice único);
//   (3) quitar el `f5.cerrarEjercicio` → rojo en «ejercicio cerrado no admite asientos».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saldosDeAsientos, resultadoDeAsientos, type Asiento, type HechoContable } from '@central/module-contabilidad'
import {
  altaActivo, amortizarPeriodo, bajaDeActivo, cerrarEjercicio, cuentasAnuales, diagnosticoCierre, guardarTabla, periodificarCierre, altaPeriodificacion, movimientosInmovilizado,
} from '../lib/cierre.ts'
import { recibirHecho, registrarAsientoManual, rectificarAsiento } from '../lib/servicio.ts'
import { crearAlmacen } from './_repo-memoria.ts'
import { f5Memoria } from './_f5-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const U = '00000000-0000-4000-8000-0000000000f1'
const hoyCierre = new Date('2027-01-15T10:00:00Z')
const meta = (hoy = hoyCierre, ref?: string) => ({ usuarioId: U, hoy, ...(ref ? { ref } : {}) })

const venta: HechoContable = { tipo: 'venta', fecha: '2026-03-10', ref: 'V-1', desglose: [{ base: 1000000, tipoIva: 21 }] }
const compra: HechoContable = { tipo: 'compra', fecha: '2026-04-10', ref: 'K-1', desglose: [{ base: 300000, tipoIva: 21 }] }
const aportacion = { fecha: '2026-01-02', concepto: 'Capital', apuntes: [{ cuenta: '572', debe: 5000000, haber: 0 }, { cuenta: '100', debe: 0, haber: 5000000 }] }

async function escenario(opts: { anio?: number } = {}) {
  const anio = opts.anio ?? 2026
  const al = crearAlmacen(); const d = al.empresaLista(A, anio, 'abierto')
  const repo = al.repo(A)
  const f5 = f5Memoria(d)
  await registrarAsientoManual(repo, aportacion, { actor: 'usuario' })
  for (const h of [venta, compra]) await recibirHecho(repo, 'taller', h)
  return { al, d, repo, f5 }
}
const saldosCuenta = (d: { asientos: readonly { ejercicio: number; apuntes: readonly { cuenta: string; debe: number; haber: number }[] }[] }, anio: number, cuenta: string) =>
  d.asientos.filter((a) => a.ejercicio === anio).reduce((t, a) => t + a.apuntes.filter((p) => p.cuenta === cuenta).reduce((s, p) => s + p.debe - p.haber, 0), 0)
const entrada = (o: object = {}) => ({ origen: 'manual', refExterna: 'PORT-1', descripcion: 'Portátil', categoria: 'equipos_informaticos', fechaAlta: '2026-01-15', valorAdquisicion: 120000, ...o })

test('alta de activo: idempotente por (origen, refExterna) — una vertical (RRHH) que repite el alta no duplica; con otros datos se rechaza', async () => {
  const { repo, f5 } = await escenario()
  const r1 = await altaActivo(repo, f5, entrada({ origen: 'rrhh', refExterna: 'EQ-9' }), {}, meta(hoyCierre, 'A-1'))
  assert.ok(r1.ok && !r1.duplicado)
  const r2 = await altaActivo(repo, f5, entrada({ origen: 'rrhh', refExterna: 'EQ-9' }), {}, meta(hoyCierre, 'A-2'))
  assert.ok(r2.ok && r2.duplicado && r2.ref === 'A-1')
  assert.equal(f5.estado.activos.length, 1)
  const r3 = await altaActivo(repo, f5, entrada({ origen: 'rrhh', refExterna: 'EQ-9', valorAdquisicion: 999 }), {}, meta())
  assert.ok(!r3.ok && /otros datos/.test(r3.errores[0]))
  const r4 = await altaActivo(repo, f5, entrada({ refExterna: 'X', categoria: 'nave' }), {}, meta())
  assert.ok(!r4.ok && /categoría desconocida/.test(r4.errores.join()))
})

test('alta sin factura asentada (yaContabilizado: false): asienta 217 / contrapartida; con factura NO asienta nada', async () => {
  const { repo, f5, d } = await escenario()
  const antes = d.asientos.length
  const con = await altaActivo(repo, f5, entrada({ refExterna: 'K1' }), {}, meta(hoyCierre, 'A-1'))
  assert.ok(con.ok && con.asientoAltaId === null)
  assert.equal(d.asientos.length, antes)
  const sin = await altaActivo(repo, f5, entrada({ refExterna: 'K2', yaContabilizado: false, valorAdquisicion: 80000 }), { cuentaContrapartida: '523' }, meta(hoyCierre, 'A-2'))
  assert.ok(sin.ok && sin.asientoAltaId)
  assert.equal(saldosCuenta(d, 2026, '217'), 80000)
  assert.equal(saldosCuenta(d, 2026, '523'), -80000)
})

test('amortización idempotente: el mismo mes dos veces = un asiento; el anual y los mensuales no conviven; el periodo futuro se rechaza', async () => {
  const { repo, f5, d } = await escenario()
  await altaActivo(repo, f5, entrada({ valorAdquisicion: 120000, porcentajePb: 1200 }), {}, meta(hoyCierre, 'A-1'))
  const a = await amortizarPeriodo(repo, f5, { anio: 2026, mes: 2 }, meta())
  assert.ok(a.ok && !a.duplicado && a.importe === 1200)
  const n = d.asientos.length
  const b = await amortizarPeriodo(repo, f5, { anio: 2026, mes: 2 }, meta())
  assert.ok(b.ok && b.duplicado)
  assert.equal(d.asientos.length, n)
  const anual = await amortizarPeriodo(repo, f5, { anio: 2026 }, meta())
  assert.ok(!anual.ok && /MENSUAL/.test(anual.errores[0]))
  const hoy = await amortizarPeriodo(repo, f5, { anio: 2027, mes: 6 }, meta(new Date('2027-01-15T00:00:00Z')))
  assert.ok(!hoy.ok && /todavía no ha empezado/.test(hoy.errores[0]))
  assert.ok(saldosCuenta(d, 2026, '681') > 0 && saldosCuenta(d, 2026, '681') === -saldosCuenta(d, 2026, '281'))
})

test('baja de activo: exige la amortización asentada hasta el mes de la baja; deja el resultado en 671/771; no se repite', async () => {
  const { repo, f5, d } = await escenario()
  await altaActivo(repo, f5, entrada({ valorAdquisicion: 120000, porcentajePb: 1200, yaContabilizado: false }), {}, meta(hoyCierre, 'A-1'))
  const sinAmort = await bajaDeActivo(repo, f5, { ref: 'A-1', fecha: '2026-06-30', precioVenta: 50000 }, meta())
  assert.ok(!sinAmort.ok && /asienta primero la amortización/.test(sinAmort.errores[0]))
  for (let m = 1; m <= 6; m++) assert.ok((await amortizarPeriodo(repo, f5, { anio: 2026, mes: m }, meta())).ok)
  const baja = await bajaDeActivo(repo, f5, { ref: 'A-1', fecha: '2026-06-30', precioVenta: 50000 }, meta())
  assert.ok(baja.ok)
  if (baja.ok) { assert.equal(baja.valorNetoContable, 120000 - 6 * 1200); assert.equal(baja.resultado, 50000 - 112800) }
  assert.equal(saldosCuenta(d, 2026, '671'), 62800)
  assert.equal(saldosCuenta(d, 2026, '217'), 0)
  assert.equal(saldosCuenta(d, 2026, '281'), 0)
  assert.equal(f5.estado.activos[0].estado, 'baja')
  assert.ok(!(await bajaDeActivo(repo, f5, { ref: 'A-1', fecha: '2026-07-31' }, meta())).ok)
  // Tras la baja el bien ya no amortiza.
  const jul = await amortizarPeriodo(repo, f5, { anio: 2026, mes: 7 }, meta())
  assert.ok(jul.ok && jul.sinCuota)
})

test('tabla de amortización editable por versiones: valida, se guarda y las altas posteriores respetan el nuevo máximo', async () => {
  const { repo, f5 } = await escenario()
  const filas = [{ categoria: 'furgoneta', descripcion: 'Furgoneta', cuentaActivo: '218', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 2000, periodoMaximoAnios: 10, certeza: 'media' as const }]
  assert.ok(!(await guardarTabla(f5, [{ ...filas[0], porcentajeMaximoPb: 0 }], meta())).ok)
  assert.ok(!(await guardarTabla(f5, [], meta())).ok)
  const g = await guardarTabla(f5, filas, meta())
  assert.ok(g.ok && g.version === 1)
  const ok = await altaActivo(repo, f5, entrada({ categoria: 'furgoneta', refExterna: 'F-1', porcentajePb: 2000 }), {}, meta(hoyCierre, 'A-1'))
  assert.ok(ok.ok)
  const ko = await altaActivo(repo, f5, entrada({ categoria: 'furgoneta', refExterna: 'F-2', porcentajePb: 2500 }), {}, meta(hoyCierre, 'A-2'))
  assert.ok(!ko.ok && /supera el máximo/.test(ko.errores.join()))
})

async function cerrarTodo() {
  const e = await escenario()
  await altaActivo(e.repo, e.f5, entrada({ valorAdquisicion: 120000, porcentajePb: 1200 }), {}, meta(hoyCierre, 'A-1'))
  assert.ok((await amortizarPeriodo(e.repo, e.f5, { anio: 2026 }, meta())).ok)
  return e
}

test('cierre bloqueado: sin amortizar, ejercicio sin terminar o hechos en la bandeja → no se cierra y se dice por qué', async () => {
  const e = await escenario()
  await altaActivo(e.repo, e.f5, entrada(), {}, meta(hoyCierre, 'A-1'))
  const sinAmort = await cerrarEjercicio(e.repo, e.f5, 2026, meta())
  assert.ok(!sinAmort.ok && /Amortización asentada/.test(sinAmort.errores.join()))
  assert.equal(e.d.ejercicios[0].estado, 'abierto')
  assert.equal(e.d.asientos.filter((a) => a.origen === 'cierre').length, 0)
  const pronto = await cerrarEjercicio(e.repo, e.f5, 2026, meta(new Date('2026-11-05T10:00:00Z')))
  assert.ok(!pronto.ok && /Ejercicio terminado/.test(pronto.errores.join()))
  // Un hecho que no se pudo asentar (cuenta de regla inexistente) queda en la bandeja y bloquea el cierre.
  await e.repo.guardarRegla('venta', { ingreso: '999' }, null)
  await recibirHecho(e.repo, 'taller', { ...venta, ref: 'V-2' })
  const dx = await diagnosticoCierre(e.repo, e.f5, 2026, hoyCierre)
  assert.equal(dx.comprobaciones.find((c) => c.clave === 'bandeja')!.ok, false)
  assert.equal(dx.puedeCerrar, false)
})

test('cierre: 6/7 a cero, resultado a 129, cierre a cero, apertura ≡ cierre y el ejercicio queda cerrado e inmutable', async () => {
  const { repo, f5, d } = await cerrarTodo()
  const resultadoEsperado = resultadoDeAsientos(d.asientos.filter((a) => a.ejercicio === 2026) as unknown as Asiento[])
  assert.ok(resultadoEsperado > 0)
  const r = await cerrarEjercicio(repo, f5, 2026, meta())
  assert.ok(r.ok, r.ok ? '' : r.errores.join())
  if (!r.ok) return
  assert.equal(r.resultado, resultadoEsperado)
  const de2026 = d.asientos.filter((a) => a.ejercicio === 2026)
  const reg = de2026.find((a) => a.origenRef === 'regularizacion:2026')!
  assert.ok(reg.apuntes.some((p) => p.cuenta === '129' && p.haber === resultadoEsperado), 'el resultado va a la 129')
  // Tras cerrar: nada de 6/7 y todo el ejercicio a cero (asiento de cierre).
  const saldos = saldosDeAsientos(de2026 as never)
  assert.deepEqual(saldos.filter((s) => (s.cuenta[0] === '6' || s.cuenta[0] === '7') && s.debe !== s.haber), [])
  assert.deepEqual(saldos.filter((s) => s.debe !== s.haber), [])
  // Apertura ≡ cierre: los saldos de la apertura son los saldos previos al asiento de cierre.
  const previos = saldosDeAsientos(de2026.filter((a) => a.origenRef !== 'cierre:2026') as never).filter((s) => s.debe !== s.haber).map((s) => [s.cuenta, s.debe - s.haber])
  const apertura = d.asientos.filter((a) => a.ejercicio === 2027)
  assert.equal(apertura.length, 1)
  assert.equal(apertura[0].fecha, '2027-01-01')
  assert.equal(apertura[0].origen, 'apertura')
  assert.deepEqual(saldosDeAsientos(apertura as never).map((s) => [s.cuenta, s.debe - s.haber]), previos)
  assert.equal(d.ejercicios.find((e) => e.anio === 2026)!.estado, 'cerrado')
  assert.equal(d.ejercicios.find((e) => e.anio === 2027)!.estado, 'abierto')
  assert.equal(f5.estado.cierres.length, 1)
})

test('ejercicio cerrado no admite asientos: ni manuales, ni hechos (van a la bandeja), ni amortización, ni un segundo cierre', async () => {
  const { repo, f5, d } = await cerrarTodo()
  assert.ok((await cerrarEjercicio(repo, f5, 2026, meta())).ok)
  const n = d.asientos.length
  const manual = await registrarAsientoManual(repo, { fecha: '2026-12-30', concepto: 'tarde', apuntes: [{ cuenta: '572', debe: 100, haber: 0 }, { cuenta: '100', debe: 0, haber: 100 }] }, { actor: 'usuario' })
  assert.ok(!manual.ok && /cerrado/.test(manual.errores.join()))
  const hecho = await recibirHecho(repo, 'taller', { ...venta, ref: 'V-TARDE', fecha: '2026-12-29' })
  assert.equal(hecho.resultado, 'pendiente_de_regla')
  const am = await amortizarPeriodo(repo, f5, { anio: 2026, mes: 12 }, meta())
  assert.ok(!am.ok && /cerrado/.test(am.errores.join()))
  const otra = await cerrarEjercicio(repo, f5, 2026, meta())
  assert.ok(!otra.ok && /ya está cerrado/.test(otra.errores.join()))
  assert.equal(d.asientos.length, n)
  // El trigger de la BD (imitado) no deja ni cerrar a mano un ejercicio sin su registro de cierre.
  const sinCierre = await escenario()
  await assert.rejects(() => sinCierre.f5.cerrarEjercicio(2026), /registro de cierre/)
})

test('cerrar un ejercicio con 6/7 sin regularizar lo impide la BD (imitada) aunque el registro de cierre exista', async () => {
  const { f5 } = await escenario()
  await f5.insertarCierre({ anio: 2026, resultado: 0, asientoRegularizacionId: null, asientoCierreId: null, asientoAperturaId: null, usuarioId: U })
  await assert.rejects(() => f5.cerrarEjercicio(2026), /cuentas 6\/7 no están a cero/)
})

test('periodificaciones: asiento 480/485 al cierre + reversa el 1/1; idempotente; el cierre las exige', async () => {
  const e = await escenario()
  assert.ok((await altaPeriodificacion(e.f5, { ref: 'SEG-1', tipo: 'gasto', descripcion: 'Seguro anual', cuentaOrigen: '625', importe: 36500, inicio: '2026-07-01', fin: '2027-06-30' }, meta())).ok)
  assert.ok(!(await altaPeriodificacion(e.f5, { ref: 'SEG-1', tipo: 'gasto', descripcion: 'otra', cuentaOrigen: '625', importe: 1, inicio: '2026-07-01', fin: '2027-06-30' }, meta())).ok)
  assert.ok(!(await altaPeriodificacion(e.f5, { ref: 'X', tipo: 'gasto', descripcion: 'mal', cuentaOrigen: '705', importe: 1, inicio: '2026-07-01', fin: '2027-06-30' }, meta())).ok)
  const dx = await diagnosticoCierre(e.repo, e.f5, 2026, hoyCierre)
  assert.equal(dx.comprobaciones.find((c) => c.clave === 'periodificaciones')!.ok, false)
  const p = await periodificarCierre(e.repo, e.f5, 2026, meta())
  assert.ok(p.ok && !p.duplicado && p.asientoId && p.reversaId)
  assert.ok(saldosCuenta(e.d, 2026, '480') > 0)
  assert.equal(saldosCuenta(e.d, 2027, '480'), -saldosCuenta(e.d, 2026, '480'))
  const otra = await periodificarCierre(e.repo, e.f5, 2026, meta())
  assert.ok(otra.ok && otra.duplicado)
  assert.equal(e.d.asientos.filter((a) => a.origenTipo === 'periodificacion').length, 2)
})

test('cuentas anuales: el balance cuadra antes y después del cierre, la PyG es el resultado, y 2027 abre con los saldos de cierre', async () => {
  const { repo, f5, d } = await cerrarTodo()
  const antes = await cuentasAnuales(repo, f5, 2026)
  assert.ok(antes)
  assert.equal(antes!.balance.cuadra, true)
  assert.equal(antes!.pyg.resultadoEjercicio, antes!.balance.resultadoEjercicio)
  assert.ok((await cerrarEjercicio(repo, f5, 2026, meta())).ok)
  const despues = await cuentasAnuales(repo, f5, 2026)
  assert.equal(despues!.balance.cuadra, true)
  assert.equal(despues!.estado, 'cerrado')
  assert.equal(despues!.balance.totalActivo, antes!.balance.totalActivo)
  assert.equal(despues!.pyg.resultadoEjercicio, antes!.pyg.resultadoEjercicio)
  const sig = await cuentasAnuales(repo, f5, 2027)
  assert.equal(sig!.balance.cuadra, true)
  assert.equal(sig!.balance.totalActivo, antes!.balance.totalActivo, 'la apertura trae los mismos saldos')
  assert.equal(sig!.balance.resultadoEjercicio, 0)
  assert.ok(sig!.balance.patrimonioNetoYPasivo.some((l) => l.clave === 'PN.V' && l.importe === antes!.balance.resultadoEjercicio), 'el resultado de 2026 queda en 129 pendiente de aplicar')
  assert.equal(sig!.conAnterior, true)
  assert.equal(despues!.conAnterior, false) // 2025 no existe: columna anterior vacía (null), no cero
  assert.equal(despues!.balance.totalActivoAnterior, null)
  assert.ok(despues!.memoria.pendientes.includes('Actividad de la empresa'))
  assert.ok(d.ejercicios.length === 2)
})

test('movimientos del inmovilizado por categoría (memoria): saldo inicial, altas, bajas y amortización acumulada', async () => {
  const { repo, f5 } = await escenario()
  await altaActivo(repo, f5, entrada({ refExterna: 'V', fechaAlta: '2025-06-01', valorAdquisicion: 100000, porcentajePb: 1000 }), {}, meta(hoyCierre, 'A-1'))
  await altaActivo(repo, f5, entrada({ refExterna: 'N', fechaAlta: '2026-02-01', valorAdquisicion: 60000 }), {}, meta(hoyCierre, 'A-2'))
  const m = movimientosInmovilizado(await f5.activos(), 2026)
  assert.equal(m.length, 1)
  assert.deepEqual([m[0].saldoInicial, m[0].altas, m[0].bajas, m[0].saldoFinal], [100000, 60000, 0, 160000])
  assert.ok(m[0].amortizacionAcumulada > 0)
})

test('aislamiento: las fichas de una empresa no existen para otra', async () => {
  const al = crearAlmacen(); const dA = al.empresaLista(A, 2026); const dB = al.empresaLista(B, 2026)
  const fA = f5Memoria(dA); const fB = f5Memoria(dB)
  await altaActivo(al.repo(A), fA, entrada(), {}, meta(hoyCierre, 'A-1'))
  assert.equal((await fA.activos()).length, 1)
  assert.equal((await fB.activos()).length, 0)
})

test('baja con amortización POSTERIOR ya asentada: se revierte el exceso (D281/H681) y 281 queda a cero; en otro ejercicio abierto, un ajuste por ejercicio', async () => {
  const { repo, f5, d } = await escenario()
  d.ejercicios.push({ anio: 2027, inicio: '2027-01-01', fin: '2027-12-31', estado: 'abierto', ultimo: 0 })
  const hoy = new Date('2027-03-15T10:00:00Z')
  await altaActivo(repo, f5, entrada({ valorAdquisicion: 120000, porcentajePb: 1200, yaContabilizado: false, fechaAlta: '2026-10-01' }), {}, meta(hoy, 'A-1'))
  for (const [anio, mes] of [[2026, 10], [2026, 11], [2026, 12], [2027, 1], [2027, 2]]) assert.ok((await amortizarPeriodo(repo, f5, { anio, mes }, meta(hoy))).ok)
  const baja = await bajaDeActivo(repo, f5, { ref: 'A-1', fecha: '2026-10-31' }, meta(hoy))
  assert.ok(baja.ok, baja.ok ? '' : baja.errores.join())
  if (baja.ok) assert.equal(baja.ajusteAmortizacion, 4 * 1200)
  assert.equal(saldosCuenta(d, 2026, '281') + saldosCuenta(d, 2027, '281'), 0)
  assert.equal(saldosCuenta(d, 2026, '681'), 1200, 'solo queda la cuota de octubre')
  assert.equal(saldosCuenta(d, 2027, '681'), 0)
  assert.equal(d.asientos.filter((a) => a.origenRef?.startsWith('baja-activo-ajuste:')).length, 2)
})

test('baja con amortización posterior asentada en un ejercicio CERRADO: se rechaza con mensaje claro y no se toca nada', async () => {
  const { repo, f5, d } = await escenario()
  await altaActivo(repo, f5, entrada({ valorAdquisicion: 120000, porcentajePb: 1200, yaContabilizado: false, fechaAlta: '2026-10-01' }), {}, meta(hoyCierre, 'A-1'))
  for (const mes of [10, 11, 12]) assert.ok((await amortizarPeriodo(repo, f5, { anio: 2026, mes }, meta())).ok)
  const antes = d.asientos.length
  d.ejercicios.find((e) => e.anio === 2026)!.estado = 'cerrado'
  const ko = await bajaDeActivo(repo, f5, { ref: 'A-1', fecha: '2026-10-31' }, meta())
  assert.ok(!ko.ok && /cerrado/.test(ko.errores.join()))
  assert.equal(d.asientos.length, antes)
  assert.equal(f5.estado.activos[0].estado, 'activo')
})

test('alta con fecha en ejercicio cerrado: se rechaza', async () => {
  const { repo, f5, d } = await escenario()
  d.ejercicios.find((e) => e.anio === 2026)!.estado = 'cerrado'
  const r = await altaActivo(repo, f5, entrada({ refExterna: 'C1' }), {}, meta(hoyCierre, 'A-1'))
  assert.ok(!r.ok && /cerrado/.test(r.errores.join()))
  assert.equal(f5.estado.activos.length, 0)
})

test('alta con fecha antigua en ejercicio abierto: asienta la amortización atrasada de los periodos ya asentados (y la baja posterior cuadra)', async () => {
  const { repo, f5, d } = await escenario()
  const hoy = new Date('2026-08-15T10:00:00Z')
  await altaActivo(repo, f5, entrada({ refExterna: 'OTRO', fechaAlta: '2026-01-10', valorAdquisicion: 60000 }), {}, meta(hoy, 'A-0'))
  for (const mes of [3, 4]) assert.ok((await amortizarPeriodo(repo, f5, { anio: 2026, mes }, meta(hoy))).ok)
  const base = saldosCuenta(d, 2026, '681')
  const r = await altaActivo(repo, f5, entrada({ refExterna: 'ANTIGUO', fechaAlta: '2026-03-05', valorAdquisicion: 120000, porcentajePb: 1200 }), {}, meta(hoy, 'A-1'))
  assert.ok(r.ok, r.ok ? '' : r.errores.join())
  if (r.ok) assert.ok(r.avisos.some((a) => /atrasada/.test(a)))
  assert.equal(saldosCuenta(d, 2026, '681') - base, 2 * 1200, 'marzo y abril, ya asentados sin el bien')
  // Mayo aún no asentado: lo recoge la amortización normal, sin duplicar.
  assert.ok((await amortizarPeriodo(repo, f5, { anio: 2026, mes: 5 }, meta(hoy))).ok)
  const baja = await bajaDeActivo(repo, f5, { ref: 'A-1', fecha: '2026-05-31' }, meta(hoy))
  assert.ok(baja.ok, baja.ok ? '' : baja.errores.join())
})

test('amortización rectificada: el mes puede reasentarse; sin rectificar sigue siendo idempotente', async () => {
  const { repo, f5, d } = await escenario()
  await altaActivo(repo, f5, entrada({ valorAdquisicion: 120000, porcentajePb: 1200 }), {}, meta(hoyCierre, 'A-1'))
  const a = await amortizarPeriodo(repo, f5, { anio: 2026, mes: 2 }, meta())
  assert.ok(a.ok && a.asientoId)
  const rect = await rectificarAsiento(repo, a.ok ? a.asientoId! : '', '2026-02-28', { actor: 'usuario' })
  assert.ok(rect.ok, rect.ok ? '' : rect.errores.join())
  const b = await amortizarPeriodo(repo, f5, { anio: 2026, mes: 2 }, meta())
  assert.ok(b.ok && !b.duplicado && b.asientoId && b.asientoId !== (a.ok ? a.asientoId : null))
  assert.equal(saldosCuenta(d, 2026, '681'), 1200)
  const c = await amortizarPeriodo(repo, f5, { anio: 2026, mes: 2 }, meta())
  assert.ok(c.ok && c.duplicado)
})

test('cierre de un ejercicio sin saldos: se rechaza (0005 exige asiento de cierre y de apertura)', async () => {
  const al = crearAlmacen(); const d = al.empresaLista(A, 2026, 'abierto')
  const r = await cerrarEjercicio(al.repo(A), f5Memoria(d), 2026, meta())
  assert.ok(!r.ok && /sin saldos|no tiene saldos/.test(r.errores.join()))
  assert.equal(d.ejercicios[0].estado, 'abierto')
})
