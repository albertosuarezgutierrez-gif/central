// F4 en la app: de los hechos a los modelos, ciclo borrador → revisado → presentado con sus asientos, y las barreras (no soportado, presentado
// definitivo, complementaria). Cepos vistos fallar el 05/11/2026: (1) quitar el `completo` de `marcarRevisada` en el fake y el chequeo de
// `problemasParaRevisar` → rojo en «no soportado no se revisa»; (2) calcular los asientos de presentación con `calcularConDatos` otra vez en lugar del
// snapshot → rojo en «snapshot»; (3) `datosFiscalesDeHechos` sin filtrar `irpf === 0` → rojo en «nóminas».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importeDe, type HechoContable } from '@central/module-contabilidad'
import { calcularConDatos, compensacionPendiente, cuadreDelPeriodo, guardarCalculo, pagos130Anteriores, presentarDeclaracion, revisarDeclaracion, devolverDeclaracion } from '../lib/impuestos.ts'
import { datosFiscalesDeHechos, type FilaHechoFiscal } from '../lib/impuestos-datos.ts'
import { recibirHecho } from '../lib/servicio.ts'
import { crearAlmacen } from './_repo-memoria.ts'
import { f4Memoria } from './_f4-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const U = '00000000-0000-4000-8000-0000000000f1'
const hoy = new Date('2026-04-19T10:00:00Z')

const venta: HechoContable = { tipo: 'venta', fecha: '2026-01-10', ref: 'V-1', desglose: [{ base: 100000, tipoIva: 21 }, { base: 50000, tipoIva: 10 }] }
const compra: HechoContable = { tipo: 'compra', fecha: '2026-02-15', ref: 'K-1', desglose: [{ base: 100000, tipoIva: 21 }], retencion: 15000 }
const filas = (): FilaHechoFiscal[] => [
  { hechoId: 'h1', tipo: 'venta', ref: 'V-1', fecha: '2026-01-10', payload: venta, asientoRef: '1/2026', proveedorNif: null, proveedorNombre: null, facturaNumero: null },
  { hechoId: 'h2', tipo: 'compra', ref: 'K-1', fecha: '2026-02-15', payload: compra, asientoRef: '2/2026', proveedorNif: 'B99999990', proveedorNombre: 'Gestoría', facturaNumero: 'GF-77' },
]

async function escenario(opts: { cerrado?: boolean } = {}) {
  const al = crearAlmacen(); al.empresaLista(A, 2026, opts.cerrado ? 'cerrado' : 'abierto')
  const repo = al.repo(A)
  if (!opts.cerrado) {
    for (const h of [venta, compra]) await recibirHecho(repo, 'taller', h)
  }
  const f4 = f4Memoria({ hechos: filas() }).repo
  const datos = datosFiscalesDeHechos(filas())
  return { al, repo, f4, datos }
}
const saldo = (al: ReturnType<typeof crearAlmacen>, cuenta: string) => al.datos(A).asientos.reduce((t, a) => t + a.apuntes.filter((p) => p.cuenta === cuenta).reduce((s, p) => s + p.debe - p.haber, 0), 0)
const entrada = (modelo: '303' | '111' | '130', periodo: '1T' | '2T' | '0A', datos: ReturnType<typeof datosFiscalesDeHechos>, extra: object = {}) =>
  ({ modelo, anio: 2026, periodo, datos, regimenIva: 'general', compensarAnteriores: 0, rendimiento130: null, truncado: false, ...extra }) as Parameters<typeof calcularConDatos>[0]

test('hechos → datos fiscales: operaciones por tipo con NIF de la factura, retención del profesional y trazabilidad al asiento', () => {
  const d = datosFiscalesDeHechos(filas())
  assert.deepEqual(d.ops.map((o) => [o.ref, o.sentido, o.tipoIva, o.base, o.cuota]), [['V-1', 'emitida', 21, 100000, 21000], ['V-1', 'emitida', 10, 50000, 5000], ['K-1', 'recibida', 21, 100000, 21000]])
  assert.equal(d.ops[2].tercero.nif, 'B99999990')
  assert.equal(d.ops[2].numero, 'GF-77')
  assert.deepEqual(d.retenciones.map((r) => [r.ref, r.concepto, r.percepcion, r.retencion, r.perceptor.nif]), [['K-1', 'actividad_profesional', 100000, 15000, 'B99999990']])
  assert.deepEqual(d.refAAsiento, { 'V-1': '1/2026', 'K-1': '2/2026' })
  assert.ok(d.avisos.some((a) => /periodo de la factura/.test(a)))
})

test('hechos → datos fiscales: alquiler con retención va al 115 y se excluye del 347; nómina con IRPF 0 no genera retención; payload ilegible se avisa', () => {
  const alq: HechoContable = { tipo: 'compra', fecha: '2026-03-05', ref: 'ALQ-3', desglose: [{ base: 80000, tipoIva: 21, categoria: 'alquiler' }], retencion: 15200 }
  const d = datosFiscalesDeHechos([
    { hechoId: 'a', tipo: 'compra', ref: 'ALQ-3', fecha: '2026-03-05', payload: { ...alq, refCatastral: '1234567VK1234N0001AB' }, asientoRef: '3/2026', proveedorNif: 'A58818501', proveedorNombre: 'Inmo', facturaNumero: 'R-3' },
    { hechoId: 'b', tipo: 'nomina', ref: 'NOM-1', fecha: '2026-03-31', payload: { tipo: 'nomina', bruto: 200000, irpf: 0, ssEmpresa: 1, ssTrabajador: 1, liquido: 200000 }, asientoRef: null, proveedorNif: null, proveedorNombre: null, facturaNumero: null },
    { hechoId: 'c', tipo: 'nomina', ref: 'NOM-2', fecha: '2026-03-31', payload: { tipo: 'nomina', bruto: 200000, irpf: 30000, perceptor: { nif: '12345678Z', nombre: 'Ana', provincia: '41' } }, asientoRef: null, proveedorNif: null, proveedorNombre: null, facturaNumero: null },
    { hechoId: 'd', tipo: 'venta', ref: 'MAL', fecha: '2026-03-31', payload: { desglose: 'x' }, asientoRef: null, proveedorNif: null, proveedorNombre: null, facturaNumero: null },
  ])
  assert.equal(d.ops[0].alquilerConRetencion, true)
  assert.deepEqual(d.retenciones.map((r) => [r.ref, r.concepto, r.origen]), [['ALQ-3', 'alquiler', 'compras'], ['NOM-2', 'trabajo', 'nominas']])
  assert.equal(d.retenciones[0].refCatastral, '1234567VK1234N0001AB')
  assert.ok(d.avisos.some((a) => /MAL/.test(a)))
  const c115 = calcularConDatos(entrada('111', '1T', d, { modelo: '111' }))
  assert.equal(importeDe(c115, '03'), 30000, 'solo la nómina con IRPF entra en el 111; el alquiler no')
})

test('303 desde los hechos ≡ mayor: cuadre libros/mayor OK y se rompe con 1 céntimo de diferencia', async () => {
  const { repo, datos } = await escenario()
  const sumas = await repo.sumasPorCuenta({ desde: '2026-01-01', hasta: '2026-03-31' })
  const c = calcularConDatos(entrada('303', '1T', datos))
  assert.equal(c.resultado, 5000)
  assert.equal(cuadreDelPeriodo('303', 2026, '1T', datos, sumas)!.ok, true)
  const roto = cuadreDelPeriodo('303', 2026, '1T', datos, sumas.map((s) => (s.cuenta === '477' ? { ...s, haber: s.haber + 1 } : s)))!
  assert.equal(roto.ok, false)
  assert.equal(cuadreDelPeriodo('111', 2026, '1T', datos, sumas), null)
})

test('ciclo completo del 303: calcular → revisar → presentar (con pago) genera liquidación y pago; 477/472/4750 a cero y el banco sale', async () => {
  const { al, repo, f4, datos } = await escenario()
  const calc = calcularConDatos(entrada('303', '1T', datos))
  const g = await guardarCalculo(f4, calc, { cuadre: null }, { usuarioId: U })
  assert.ok(g.ok && g.version === 1 && g.creada)
  const id = (g as { id: string }).id
  assert.deepEqual(await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-04-18', justificante: 'CSV-ABC123' }, { pagar: true }, { usuarioId: U, hoy }), { ok: false, errores: ['primero hay que marcarla como revisada'] })
  assert.deepEqual(await revisarDeclaracion(repo, f4, id, { usuarioId: U }), { ok: true })
  const antes = al.datos(A).asientos.length
  const p = await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-04-18', justificante: 'CSV-ABC123' }, { pagar: true }, { usuarioId: U, hoy })
  assert.ok(p.ok)
  assert.equal(al.datos(A).asientos.length, antes + 2)
  assert.equal(saldo(al, '477'), 0); assert.equal(saldo(al, '472'), 0); assert.equal(saldo(al, '4750'), 0)
  assert.equal(saldo(al, '572'), -5000)
  const d = await f4.declaracion(id)
  assert.equal(d!.estado, 'presentado')
  assert.deepEqual([d!.presentadoEl, d!.justificante], ['2026-04-18', 'CSV-ABC123'])
  assert.ok(d!.asientoLiquidacionId && d!.asientoPagoId)
  assert.deepEqual(al.datos(A).asientos.filter((a) => a.concepto.includes('IVA')).map((a) => a.fecha), ['2026-03-31', '2026-04-18'], 'liquidación a fin de periodo; pago a la fecha de presentación')
  assert.ok(al.datos(A).auditoria.some((x) => x.accion === 'presentar_declaracion'))
  // Presentado es definitivo
  assert.deepEqual((await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-04-18', justificante: 'OTRO-123' }, { pagar: true }, { usuarioId: U, hoy })).ok, false)
  assert.equal((await devolverDeclaracion(repo, f4, id, { usuarioId: U })).ok, false)
  const re = await guardarCalculo(f4, calc, {}, { usuarioId: U })
  assert.equal(re.ok, false)
  assert.match(!re.ok ? re.errores[0] : '', /complementaria/)
  const comp = await guardarCalculo(f4, calc, {}, { usuarioId: U, complementaria: true })
  assert.ok(comp.ok && comp.version === 2)
})

test('presentar SIN pago: solo la liquidación (el IVA queda en 4750 pendiente de ingreso)', async () => {
  const { al, repo, f4, datos } = await escenario()
  const g = await guardarCalculo(f4, calcularConDatos(entrada('303', '1T', datos)), {}, { usuarioId: U })
  const id = (g as { id: string }).id
  await revisarDeclaracion(repo, f4, id, { usuarioId: U })
  const p = await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-04-18', justificante: 'REF 001' }, { pagar: false }, { usuarioId: U, hoy })
  assert.ok(p.ok && p.asientos.length === 1)
  assert.equal(saldo(al, '4750'), -5000)
  assert.equal(saldo(al, '572'), 0)
})

test('111 presentado: 4751 → 572 por 150,00; el mayor 4751 queda a cero', async () => {
  const { al, repo, f4, datos } = await escenario()
  assert.equal(saldo(al, '4751'), -15000)
  const calc = calcularConDatos(entrada('111', '1T', datos))
  assert.equal(calc.resultado, 15000)
  const id = (await guardarCalculo(f4, calc, {}, { usuarioId: U }) as { id: string }).id
  await revisarDeclaracion(repo, f4, id, { usuarioId: U })
  const p = await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-04-18', justificante: 'NRC-111-1' }, { pagar: true }, { usuarioId: U, hoy })
  assert.ok(p.ok && p.asientos.length === 1 && p.asientos[0].rol === 'pago')
  assert.equal(saldo(al, '4751'), 0)
})

test('NO SOPORTADO: se guarda como borrador incompleto pero no se revisa ni se presenta; truncado por tope también bloquea', async () => {
  const { repo, f4, datos } = await escenario()
  const mal = { ...datos, ops: [...datos.ops, { ...datos.ops[2], ref: 'P-1', regimen: 'prorrata' as const }] }
  const calc = calcularConDatos(entrada('303', '1T', mal))
  assert.equal(calc.resultado, null)
  const g = await guardarCalculo(f4, calc, {}, { usuarioId: U })
  assert.ok(g.ok)
  const r = await revisarDeclaracion(repo, f4, (g as { id: string }).id, { usuarioId: U })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.errores.join(' ') : '', /no soportados/)
  assert.equal((await f4.declaracion((g as { id: string }).id))!.estado, 'borrador')
  assert.equal(calcularConDatos(entrada('303', '1T', datos, { truncado: true })).resultado, null)
})

test('revisado se puede devolver a borrador y recalcular; revisado NO se recalcula directamente', async () => {
  const { repo, f4, datos } = await escenario()
  const calc = calcularConDatos(entrada('303', '1T', datos))
  const id = (await guardarCalculo(f4, calc, {}, { usuarioId: U }) as { id: string }).id
  await revisarDeclaracion(repo, f4, id, { usuarioId: U })
  const r1 = await guardarCalculo(f4, calc, {}, { usuarioId: U })
  assert.equal(r1.ok, false)
  assert.match(!r1.ok ? r1.errores[0] : '', /devuélvela a borrador/)
  assert.equal((await devolverDeclaracion(repo, f4, id, { usuarioId: U })).ok, true)
  const r2 = await guardarCalculo(f4, calc, {}, { usuarioId: U })
  assert.ok(r2.ok && !r2.creada && r2.id === id, 'recalcula el mismo borrador')
})

test('presentar con ejercicio cerrado o datos de presentación inválidos: errores y la declaración sigue REVISADA (sin asientos a medias)', async () => {
  const { al, repo, f4, datos } = await escenario()
  const id = (await guardarCalculo(f4, calcularConDatos(entrada('303', '1T', datos)), {}, { usuarioId: U }) as { id: string }).id
  await revisarDeclaracion(repo, f4, id, { usuarioId: U })
  const futura = await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-05-01', justificante: 'ABC123' }, { pagar: true }, { usuarioId: U, hoy })
  assert.equal(futura.ok, false)
  const sinRef = await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-04-18', justificante: '' }, { pagar: true }, { usuarioId: U, hoy })
  assert.equal(sinRef.ok, false)
  al.datos(A).ejercicios[0].estado = 'cerrado'
  const antes = al.datos(A).asientos.length
  const cerrado = await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-04-18', justificante: 'ABC123' }, { pagar: true }, { usuarioId: U, hoy })
  assert.equal(cerrado.ok, false)
  assert.equal(al.datos(A).asientos.length, antes)
  assert.equal((await f4.declaracion(id))!.estado, 'revisado')
})

test('SNAPSHOT: lo que se asienta es lo que se revisó, aunque después cambien los datos', async () => {
  const { al, repo, f4, datos } = await escenario()
  const id = (await guardarCalculo(f4, calcularConDatos(entrada('303', '1T', datos)), {}, { usuarioId: U }) as { id: string }).id
  await revisarDeclaracion(repo, f4, id, { usuarioId: U })
  await recibirHecho(repo, 'taller', { tipo: 'venta', fecha: '2026-03-20', ref: 'V-TARDIA', desglose: [{ base: 1_000_000, tipoIva: 21 }] }) // llega después de revisar
  const p = await presentarDeclaracion(repo, f4, id, { fechaPresentacion: '2026-04-18', justificante: 'ABC123' }, { pagar: true }, { usuarioId: U, hoy })
  assert.ok(p.ok)
  assert.equal(saldo(al, '4750'), 0)
  assert.equal(saldo(al, '477'), -210000, 'la venta tardía queda en 477: no entró en lo revisado')
})

test('compensación pendiente: negativos presentados anteriores menos lo ya aplicado; solo periodos anteriores', () => {
  const p = (periodo: '1T' | '2T' | '3T', resultado: number, c68 = 0, anio = 2026) => ({ id: periodo, modelo: '303' as const, anio, periodo, version: 1, estado: 'presentado' as const, resultado, completo: true, calculadoEn: '', revisadoEn: null, presentadoEl: '2026-01-01', justificante: 'x', asientoLiquidacionId: null, asientoPagoId: null, calculo: { casillas: [{ casilla: '68', importe: c68 }] } })
  const xs = [p('1T', -10000), p('2T', 4000, 3000), p('3T', -500)]
  assert.equal(compensacionPendiente(xs, 2026, '2T'), 10000)
  assert.equal(compensacionPendiente(xs, 2026, '3T'), 10000 - 3000)
  assert.equal(compensacionPendiente(xs, 2026, '1T'), 0)
  const dec = { ...p('1T', -2500, 0, 2025), periodo: '4T' as const }
  assert.equal(compensacionPendiente([dec], 2026, '1T'), 2500, 'el 4T del año anterior arrastra')
})

test('pagos del 130 anteriores: solo presentados del mismo ejercicio y trimestres previos; el negativo cuenta 0', () => {
  const d = (periodo: '1T' | '2T' | '3T', resultado: number) => ({ id: periodo, modelo: '130' as const, anio: 2026, periodo, version: 1, estado: 'presentado' as const, resultado, completo: true, calculadoEn: '', revisadoEn: null, presentadoEl: '2026-01-01', justificante: 'x', asientoLiquidacionId: null, asientoPagoId: null })
  assert.equal(pagos130Anteriores([d('1T', 150000), d('2T', 0), d('3T', 90000)], 2026, '3T'), 150000)
  assert.equal(pagos130Anteriores([d('1T', 150000), d('2T', 40000)], 2026, '1T'), 0)
})

test('130 en la app necesita su acumulado; modelo anual con periodo trimestral se rechaza', async () => {
  const { datos } = await escenario()
  assert.throws(() => calcularConDatos(entrada('130', '2T', datos)), /acumulado/)
  assert.throws(() => calcularConDatos({ ...entrada('303', '1T', datos), modelo: '347' }), /no admite el periodo/)
})
