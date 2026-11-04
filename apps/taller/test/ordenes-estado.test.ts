/* eslint-disable @typescript-eslint/no-explicit-any */
// Cambios de estado de la OT con la decisión de recepción: en_curso→terminado y terminado→entregado (sin factura en F1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abrirParteMecanico, cambiarEstadoOt, cerrarParteMecanico } from '../lib/ordenes.ts'
import { aceptarPorToken, crearPresupuestoDesdeOt, generarEnlace } from '../lib/presupuestos.ts'
import { AHORA, montar, recibir, T } from './_escenario.ts'

async function otEnCurso(m: ReturnType<typeof montar>) {
  const r = await recibir(m)
  const c: any = await m.conTaller(T, (tx: any) => crearPresupuestoDesdeOt(tx, { tallerId: T, otId: r.otId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }], ahora: AHORA }, m.config))
  const g: any = await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: c.presupuestoId, ahora: AHORA, config: m.config }))
  await m.conTaller(T, (tx: any) => aceptarPorToken(tx, { tallerId: T, token: g.token, ip: null, userAgent: null, ahora: AHORA, casillas: { asegura: false, taller: false } }, { textoTaller: { version: 'v', texto: 't' } }))
  await m.conTaller(T, (tx: any) => abrirParteMecanico(tx, { tallerId: T, mecanicoId: m.mec.id, otId: r.otId, ahora: AHORA }))
  await m.conTaller(T, (tx: any) => cerrarParteMecanico(tx, { tallerId: T, mecanicoId: m.mec.id, ahora: AHORA }))
  return r.otId as string
}
const ir = (m: ReturnType<typeof montar>, otId: string, hacia: string, ahora = AHORA) =>
  m.conTaller(T, (tx: any) => cambiarEstadoOt(tx, { tallerId: T, otId, hacia, ahora }))

test('en_curso → terminado → entregado: ok, con fechas de cierre y de entrega', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  const t: any = await ir(m, ot, 'terminado')
  assert.ok(t.ok, JSON.stringify(t))
  const fin = new Date(AHORA.getTime() + 3600_000)
  const e: any = await ir(m, ot, 'entregado', fin)
  assert.ok(e.ok, JSON.stringify(e))
  const f = m.bd.filas('ordenTrabajo').find((o) => o.id === ot)
  assert.equal(f.estado, 'entregado')
  assert.equal(f.terminadoEn.getTime(), AHORA.getTime())
  assert.equal(f.entregadoEn.getTime(), fin.getTime())
  assert.equal(((await ir(m, ot, 'en_curso')) as any).ok, false, 'entregado es final')
})

test('no se entrega un coche que no está terminado, ni uno cuya recepción no está firmada', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  assert.equal(((await ir(m, ot, 'entregado')) as any).ok, false, 'en_curso → entregado no existe')
  // la guarda del módulo exige la recepción firmada (aquí firmada → ok; sin firma no se llega a presupuestar)
  await ir(m, ot, 'terminado')
  await m.conTaller(T, (tx: any) => tx.recepcion.update({ where: { id: m.bd.filas('recepcion')[0].id }, data: { firmadoEn: null } }))
  const r: any = await ir(m, ot, 'entregado')
  assert.equal(r.ok, false)
  assert.match(r.motivo, /firmada/)
})

test('con partes abiertos no se termina (sigue igual)', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  await m.conTaller(T, (tx: any) => abrirParteMecanico(tx, { tallerId: T, mecanicoId: m.mec.id, otId: ot, ahora: AHORA }))
  assert.equal(((await ir(m, ot, 'terminado')) as any).ok, false)
})
