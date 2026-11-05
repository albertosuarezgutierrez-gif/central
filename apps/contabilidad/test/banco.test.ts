// Banco: importación Norma 43 / CSV (con dedupe), propuestas de conciliación y confirmación (asientos de cobro/pago cuadrados).
// Cepos vistos fallar el 05/11/2026: (1) proponer siempre que haya ≥1 candidato en `proponerConciliacion` (core-banca) → rojo en «AMBIGUO» y en
// «dos movimientos iguales»; (2) quitar el ordinal de `huellasDeMovimientos` → rojo en el dedupe de core-banca; (3) quitar la comprobación de
// movimiento ya conciliado en `confirmarConciliacion` → rojo en «DOS VECES». Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { HechoContable } from '@central/module-contabilidad'
import { recibirHecho } from '../lib/servicio.ts'
import { registrarFacturaRecibida } from '../lib/compras.ts'
import { confirmarConciliacion, crearReglaConciliacion, importarExtractos, leerExtracto, vistaDePendientes, cabecerasDeCsv } from '../lib/banco.ts'
import { crearAlmacen } from './_repo-memoria.ts'
import { N43_EJEMPLO } from '../../../packages/core-banca/test/_n43-ejemplo.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const HOY = new Date('2026-11-30T10:00:00Z')
const meta = { usuarioId: '00000000-0000-4000-8000-0000000000f1', hoy: HOY }
const suma = (a: { apuntes: readonly { cuenta: string; debe: number; haber: number }[] }, cuenta: string, lado: 'debe' | 'haber') => a.apuntes.filter((p) => p.cuenta === cuenta).reduce((t, p) => t + p[lado], 0)

/** Escenario: factura de proveedor de 45,50 € (la luz del N43), factura emitida de 1.210,00 € (el cobro del N43) y la comisión sin partida. */
async function escenario() {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  const compra = await registrarFacturaRecibida(repo, { proveedor: { nif: 'A58818501', nombre: 'Endesa Energía' }, numero: '2026-10', fecha: '2026-10-31', lineas: [{ base: 3760, tipoIva: 21, categoria: 'suministros' }] }, meta)
  assert.ok(compra.ok && compra.total === 4550, JSON.stringify(compra))
  const venta: HechoContable = { tipo: 'venta', fecha: '2026-11-02', ref: 'F-2026-045', documento: 'F-2026-045', desglose: [{ base: 100000, tipoIva: 21 }] }
  assert.equal((await recibirHecho(repo, 'taller', venta)).resultado, 'asentado')
  const lec = leerExtracto({ formato: 'norma43', texto: N43_EJEMPLO })
  assert.ok(lec.ok)
  const imp = await importarExtractos(repo, lec.extractos, { origen: 'norma43' }, meta)
  assert.ok(imp.ok)
  return { al, repo }
}

test('Norma 43: importa 3 movimientos con su cuenta; REIMPORTAR el mismo fichero no duplica', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  const lec = leerExtracto({ formato: 'norma43', texto: N43_EJEMPLO })
  assert.ok(lec.ok)
  const a = await importarExtractos(repo, lec.extractos, { origen: 'norma43' }, meta)
  assert.deepEqual(a.ok && [a.nuevos, a.repetidos], [3, 0])
  const b = await importarExtractos(repo, lec.extractos, { origen: 'norma43' }, meta)
  assert.deepEqual(b.ok && [b.nuevos, b.repetidos], [0, 3])
  const d = al.datos(A).f3.movimientos
  assert.equal(d.length, 3)
  assert.deepEqual(d.map((m) => m.importe), [-4550, 121000, -325])
  assert.equal(d[0].cuentaRef, '000000010000012345')
})

test('Norma 43: un fichero que no lo es, vacío o enorme se rechaza con motivo', () => {
  assert.equal(leerExtracto({ formato: 'norma43', texto: 'hola\nmundo' }).ok, false)
  assert.equal(leerExtracto({ formato: 'norma43', texto: '   ' }).ok, false)
  assert.equal(leerExtracto({ formato: 'norma43', texto: 'x'.repeat(3_000_001) }).ok, false)
  assert.equal(leerExtracto({ formato: 'xls' as never, texto: 'a' }).ok, false)
})

test('CSV con «;» y decimales con coma: mapeo → movimientos; líneas malas se avisan; sin mapeo o con mapeo roto, error claro', async () => {
  const csv = ['Fecha;Concepto;Importe', '03/11/2026;RECIBO LUZ;-45,50', '10/11/2026;COBRO TALLER;1.210,00', '99/99/2026;MALA;1,00'].join('\n')
  const c = cabecerasDeCsv(csv)
  assert.equal(c.separador, ';')
  const lec = leerExtracto({ formato: 'csv', texto: csv, mapeo: { fecha: 'Fecha', concepto: 'Concepto', importe: 'Importe' }, cuentaRef: 'Caja Rural' })
  assert.ok(lec.ok)
  assert.equal(lec.avisos.length, 1)
  const al = crearAlmacen(); al.empresaLista(A)
  const r = await importarExtractos(al.repo(A), lec.extractos, { origen: 'csv', cuentaRef: 'Caja Rural' }, meta)
  assert.deepEqual(r.ok && r.nuevos, 2)
  assert.deepEqual(al.datos(A).f3.movimientos.map((m) => [m.importe, m.cuentaRef]), [[-4550, 'Caja Rural'], [121000, 'Caja Rural']])
  assert.equal(leerExtracto({ formato: 'csv', texto: csv }).ok, false)
  const mal = leerExtracto({ formato: 'csv', texto: csv, mapeo: { fecha: 'Nada', concepto: 'Concepto', importe: 'Importe' } })
  assert.ok(!mal.ok && /Nada/.test(mal.errores.join(' ')))
})

test('propuestas: cargo ↔ pago pendiente y abono ↔ cobro pendiente por importe exacto; la comisión queda sin candidato', async () => {
  const { repo } = await escenario()
  const v = await vistaDePendientes(repo, HOY)
  assert.equal(v.movimientos.length, 3)
  const porImporte = (i: number) => v.propuestas.find((p) => p.movimientoId === v.movimientos.find((m) => m.importe === i)!.id)!
  const luz = porImporte(-4550), cobro = porImporte(121000), com = porImporte(-325)
  assert.ok(luz.estado === 'propuesta' && luz.metodo === 'importe_exacto')
  assert.ok(cobro.estado === 'propuesta' && cobro.metodo === 'importe_exacto')
  assert.equal(com.estado, 'sin_candidato')
  assert.equal(v.candidatos.length, 2)
})

test('confirmar COBRO: asiento 572 / 430 cuadrado con el documento de la factura; la partida se cierra y el movimiento queda conciliado', async () => {
  const { al, repo } = await escenario()
  const v = await vistaDePendientes(repo, HOY)
  const mov = v.movimientos.find((m) => m.importe === 121000)!
  const cand = v.candidatos.find((c) => c.sentido === 'cobro')!
  const r = await confirmarConciliacion(repo, { movimientoId: mov.id, modo: 'partida', documento: cand.documento!, cuenta: cand.cuenta! }, meta)
  assert.ok(r.ok && r.metodo === 'importe_exacto', JSON.stringify(r))
  const a = al.datos(A).asientos.at(-1)!
  assert.deepEqual([suma(a, '572', 'debe'), suma(a, '430', 'haber')], [121000, 121000])
  assert.equal(a.apuntes.reduce((t, p) => t + p.debe, 0), a.apuntes.reduce((t, p) => t + p.haber, 0))
  assert.equal(a.fecha, '2026-11-10')
  const despues = await vistaDePendientes(repo, HOY)
  assert.equal(despues.candidatos.filter((c) => c.sentido === 'cobro').length, 0, 'la partida ya está cobrada')
  assert.equal(despues.movimientos.length, 2)
  assert.equal((await repo.movimientosBanco({ filtro: 'conciliados', limite: 10 })).length, 1)
})

test('confirmar PAGO: asiento 400 / 572 cuadrado; no se puede conciliar DOS VECES el mismo movimiento', async () => {
  const { al, repo } = await escenario()
  const v = await vistaDePendientes(repo, HOY)
  const mov = v.movimientos.find((m) => m.importe === -4550)!
  const cand = v.candidatos.find((c) => c.sentido === 'pago')!
  const conf = { movimientoId: mov.id, modo: 'partida' as const, documento: cand.documento!, cuenta: cand.cuenta! }
  const r = await confirmarConciliacion(repo, conf, meta)
  assert.ok(r.ok)
  const a = al.datos(A).asientos.at(-1)!
  assert.deepEqual([suma(a, '400', 'debe'), suma(a, '572', 'haber')], [4550, 4550])
  const n = al.datos(A).asientos.length
  const otra = await confirmarConciliacion(repo, conf, meta)
  assert.ok(!otra.ok && /ya está conciliado/.test(otra.errores.join(' ')))
  assert.equal(al.datos(A).asientos.length, n, 'el segundo intento no asienta nada')
})

test('un cargo NO puede cobrar una factura emitida ni un abono pagar una recibida', async () => {
  const { repo } = await escenario()
  const v = await vistaDePendientes(repo, HOY)
  const cargo = v.movimientos.find((m) => m.importe === -4550)!
  const cobro = v.candidatos.find((c) => c.sentido === 'cobro')!
  const r = await confirmarConciliacion(repo, { movimientoId: cargo.id, modo: 'partida', documento: cobro.documento!, cuenta: cobro.cuenta! }, meta)
  assert.equal(r.ok, false)
})

test('AMBIGUO: dos facturas del mismo importe → ninguna propuesta; la persona elige (manual); la elegida se cierra y la otra sigue pendiente', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  for (const n of ['A-1', 'A-2']) await registrarFacturaRecibida(repo, { proveedor: { nif: 'A58818501', nombre: 'Endesa' }, numero: n, fecha: '2026-11-01', lineas: [{ base: 3760, tipoIva: 21 }] }, meta)
  const lec = leerExtracto({ formato: 'norma43', texto: N43_EJEMPLO })
  assert.ok(lec.ok)
  await importarExtractos(repo, lec.extractos, { origen: 'norma43' }, meta)
  const v = await vistaDePendientes(repo, HOY)
  const mov = v.movimientos.find((m) => m.importe === -4550)!
  const p = v.propuestas.find((x) => x.movimientoId === mov.id)!
  assert.equal(p.estado, 'ambigua')
  const elegida = v.candidatos.find((c) => c.documento!.endsWith('A-2'))!
  const r = await confirmarConciliacion(repo, { movimientoId: mov.id, modo: 'partida', documento: elegida.documento!, cuenta: elegida.cuenta! }, meta)
  assert.ok(r.ok && r.metodo === 'manual')
  const resto = (await vistaDePendientes(repo, HOY)).candidatos.filter((c) => c.sentido === 'pago')
  assert.deepEqual(resto.map((c) => c.documento), ['A58818501 A-1'])
})

test('dos movimientos iguales y UNA factura: ambos ambiguos y, si la persona asigna los dos a la misma, el segundo se rechaza (nunca dos movimientos a una factura)', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  await registrarFacturaRecibida(repo, { proveedor: { nif: 'A58818501', nombre: 'Endesa' }, numero: 'A-1', fecha: '2026-11-01', lineas: [{ base: 3760, tipoIva: 21 }] }, meta)
  const csv = ['Fecha;Concepto;Importe', '03/11/2026;RECIBO 1;-45,50', '04/11/2026;RECIBO 2;-45,50'].join('\n')
  const lec = leerExtracto({ formato: 'csv', texto: csv, mapeo: { fecha: 'Fecha', concepto: 'Concepto', importe: 'Importe' } })
  assert.ok(lec.ok)
  assert.deepEqual((await importarExtractos(repo, lec.extractos, { origen: 'csv' }, meta)).ok && 2, 2)
  const v = await vistaDePendientes(repo, HOY)
  assert.deepEqual(v.propuestas.map((p) => p.estado), ['ambigua', 'ambigua'])
  const c = v.candidatos[0]
  const r1 = await confirmarConciliacion(repo, { movimientoId: v.movimientos[0].id, modo: 'partida', documento: c.documento!, cuenta: c.cuenta! }, meta)
  const r2 = await confirmarConciliacion(repo, { movimientoId: v.movimientos[1].id, modo: 'partida', documento: c.documento!, cuenta: c.cuenta! }, meta)
  assert.ok(r1.ok)
  assert.ok(!r2.ok && /ya no está pendiente/.test(r2.errores.join(' ')))
  assert.equal(al.datos(A).f3.conciliaciones.length, 1)
})

test('pago parcial manual: el movimiento menor que lo pendiente se admite y deja el resto; mayor que lo pendiente, no', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  await registrarFacturaRecibida(repo, { proveedor: { nif: 'A58818501', nombre: 'Endesa' }, numero: 'A-1', fecha: '2026-11-01', lineas: [{ base: 10000, tipoIva: 21 }] }, meta)
  const csv = ['Fecha;Concepto;Importe', '03/11/2026;PARTE;-50,00', '04/11/2026;DE MAS;-500,00'].join('\n')
  const lec = leerExtracto({ formato: 'csv', texto: csv, mapeo: { fecha: 'Fecha', concepto: 'Concepto', importe: 'Importe' } })
  assert.ok(lec.ok)
  await importarExtractos(repo, lec.extractos, { origen: 'csv' }, meta)
  const v = await vistaDePendientes(repo, HOY)
  const c = v.candidatos[0]
  const parte = v.movimientos.find((m) => m.importe === -5000)!
  const demas = v.movimientos.find((m) => m.importe === -50000)!
  assert.equal((await confirmarConciliacion(repo, { movimientoId: demas.id, modo: 'partida', documento: c.documento!, cuenta: c.cuenta! }, meta)).ok, false)
  const r = await confirmarConciliacion(repo, { movimientoId: parte.id, modo: 'partida', documento: c.documento!, cuenta: c.cuenta! }, meta)
  assert.ok(r.ok && r.metodo === 'manual')
  assert.equal((await vistaDePendientes(repo, HOY)).candidatos[0].importe, 12100 - 5000)
})

test('regla por concepto: la comisión se asienta 626 / 572; cuentas de terceros/tesorería no valen como regla; no casa con otro movimiento', async () => {
  const { al, repo } = await escenario()
  assert.equal((await crearReglaConciliacion(repo, { patron: 'comision', cuenta: '572', sentido: 'cargo' }, null)).ok, false)
  assert.equal((await crearReglaConciliacion(repo, { patron: 'comision', cuenta: '400', sentido: 'cargo' }, null)).ok, false)
  assert.equal((await crearReglaConciliacion(repo, { patron: 'comision', cuenta: '9999', sentido: 'cargo' }, null)).ok, false)
  assert.equal((await crearReglaConciliacion(repo, { patron: 'co', cuenta: '626', sentido: 'cargo' }, null)).ok, false)
  const regla = await crearReglaConciliacion(repo, { patron: 'COMISIÓN mantenimiento', cuenta: '626', sentido: 'cargo' }, null)
  assert.ok(regla.ok)
  assert.equal((await crearReglaConciliacion(repo, { patron: 'comisión MANTENIMIENTO', cuenta: '626', sentido: 'cargo' }, null)).ok, false, 'duplicada')

  const v = await vistaDePendientes(repo, HOY)
  const com = v.movimientos.find((m) => m.importe === -325)!
  const p = v.propuestas.find((x) => x.movimientoId === com.id)!
  assert.ok(p.estado === 'propuesta' && p.metodo === 'regla' && p.cuenta === '626')
  const luz = v.movimientos.find((m) => m.importe === -4550)!
  assert.equal((await confirmarConciliacion(repo, { movimientoId: luz.id, modo: 'regla', reglaId: regla.id }, meta)).ok, false, 'la regla no corresponde a ese movimiento')

  const r = await confirmarConciliacion(repo, { movimientoId: com.id, modo: 'regla', reglaId: regla.id }, meta)
  assert.ok(r.ok && r.metodo === 'regla', JSON.stringify(r))
  const a = al.datos(A).asientos.at(-1)!
  assert.deepEqual([suma(a, '626', 'debe'), suma(a, '572', 'haber')], [325, 325])
  assert.equal(a.apuntes.reduce((t, p2) => t + p2.debe, 0), a.apuntes.reduce((t, p2) => t + p2.haber, 0))
})

test('movimiento en un ejercicio que no existe: no se concilia (el hecho no se asienta) y no queda ninguna conciliación', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  await registrarFacturaRecibida(repo, { proveedor: { nif: 'A58818501', nombre: 'Endesa' }, numero: 'A-1', fecha: '2026-11-01', lineas: [{ base: 3760, tipoIva: 21 }] }, meta)
  const lec = leerExtracto({ formato: 'csv', texto: ['Fecha;Concepto;Importe', '01/12/2025;ANTIGUO;-45,50'].join('\n'), mapeo: { fecha: 'Fecha', concepto: 'Concepto', importe: 'Importe' } })
  assert.ok(lec.ok)
  await importarExtractos(repo, lec.extractos, { origen: 'csv' }, meta)
  const v = await vistaDePendientes(repo, HOY)
  const c = v.candidatos[0]
  const r = await confirmarConciliacion(repo, { movimientoId: v.movimientos[0].id, modo: 'partida', documento: c.documento!, cuenta: c.cuenta! }, meta)
  assert.equal(r.ok, false)
  assert.equal(al.datos(A).f3.conciliaciones.length, 0)
})

test('multi-empresa: los movimientos y conciliaciones de una empresa no se ven desde otra', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const B = '00000000-0000-4000-8000-00000000000b'
  al.empresaLista(B)
  const lec = leerExtracto({ formato: 'norma43', texto: N43_EJEMPLO })
  assert.ok(lec.ok)
  await importarExtractos(al.repo(A), lec.extractos, { origen: 'norma43' }, meta)
  assert.equal((await al.repo(B).movimientosBanco({ filtro: 'todos', limite: 10 })).length, 0)
  assert.equal((await vistaDePendientes(al.repo(B), HOY)).movimientos.length, 0)
})
