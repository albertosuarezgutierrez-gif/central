/* eslint-disable @typescript-eslint/no-explicit-any */
// Partes de horas del mecánico y estados de OT. Cepo visto fallar el 04/11/2026: quitar en lib/ordenes.ts la línea
// `if (abiertos.some((p) => p.otId === o.otId)) return …` → el segundo «abrir» en la misma OT creaba otro parte (rojo en
// 'parte abierto duplicado rechazado'); restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abrirParteMecanico, cambiarEstadoOt, cerrarParteMecanico, horasYMargen } from '../lib/ordenes.ts'
import { crearPresupuestoDesdeOt, generarEnlace, aceptarPorToken } from '../lib/presupuestos.ts'
import { AHORA, montar, recibir, T } from './_escenario.ts'

const min = (n: number) => new Date(AHORA.getTime() + n * 60_000)

/** OT aceptada y con líneas (baremo 60 min). */
async function otAceptada(m: ReturnType<typeof montar>, matricula = '1234BCD') {
  const r = await recibir(m, { matricula })
  const c: any = await m.conTaller(T, (tx: any) => crearPresupuestoDesdeOt(tx, { tallerId: T, otId: r.otId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }], ahora: AHORA }, m.config))
  const g: any = await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: c.presupuestoId, ahora: AHORA, config: m.config }))
  await m.conTaller(T, (tx: any) => aceptarPorToken(tx, { tallerId: T, token: g.token, ip: null, userAgent: null, ahora: AHORA, casillas: { asegura: false, taller: false } }, { textoTaller: { version: 'v', texto: 't' } }))
  return r.otId as string
}
const abrir = (m: ReturnType<typeof montar>, mecanicoId: string, otId: string, ahora = AHORA) =>
  m.conTaller(T, (tx: any) => abrirParteMecanico(tx, { tallerId: T, mecanicoId, otId, ahora }))
const cerrar = (m: ReturnType<typeof montar>, mecanicoId: string, ahora: Date) =>
  m.conTaller(T, (tx: any) => cerrarParteMecanico(tx, { tallerId: T, mecanicoId, ahora }))

test('parte abierto duplicado rechazado (misma OT) y queda UNO solo', async () => {
  const m = montar()
  const ot = await otAceptada(m)
  assert.deepEqual(await abrir(m, m.mec.id, ot), { ok: true, abierto: true, cerrados: 0 })
  const dup = await abrir(m, m.mec.id, ot, min(5))
  assert.equal(dup.ok, false)
  assert.equal(m.bd.filas('parteHoras').filter((p) => p.fin == null).length, 1)
  assert.equal(m.bd.filas('parteHoras').length, 1)
})

test('abrir parte pasa la OT de «aceptado» a «en_curso»; cambiar de coche cierra el anterior (un abierto por mecánico)', async () => {
  const m = montar()
  const a = await otAceptada(m, '1111AAA')
  const b = await otAceptada(m, '2222BBB')
  await abrir(m, m.mec.id, a)
  assert.equal(m.bd.filas('ordenTrabajo').find((o) => o.id === a).estado, 'en_curso')
  const r = await abrir(m, m.mec.id, b, min(30))
  assert.deepEqual(r, { ok: true, abierto: true, cerrados: 1 })
  const abiertos = m.bd.filas('parteHoras').filter((p) => p.fin == null)
  assert.equal(abiertos.length, 1)
  assert.equal(abiertos[0].otId, b)
  // otro mecánico puede tener su propio parte abierto en el mismo coche
  assert.equal((await abrir(m, m.mec2.id, b, min(31))).ok, true)
  assert.equal(m.bd.filas('parteHoras').filter((p) => p.fin == null).length, 2)
})

test('no se trabaja en una OT sin presupuesto aceptado', async () => {
  const m = montar()
  const r = await recibir(m)
  const x = await abrir(m, m.mec.id, r.otId)
  assert.equal(x.ok, false)
  assert.equal(m.bd.filas('parteHoras').length, 0)
})

test('cerrar sin parte abierto → rechazo; con parte → cierra', async () => {
  const m = montar()
  const ot = await otAceptada(m)
  assert.equal((await cerrar(m, m.mec.id, min(1))).ok, false)
  await abrir(m, m.mec.id, ot)
  assert.deepEqual(await cerrar(m, m.mec.id, min(90)), { ok: true, abierto: false, cerrados: 1 })
})

test('horas reales vs baremo y margen; faltando un dato es null, nunca 0', async () => {
  const m = montar()
  const ot = await otAceptada(m)
  const h = () => m.conTaller(T, (tx: any) => horasYMargen(tx, { tallerId: T, otId: ot, precioHoraCent: m.config.precioHoraCent }))
  const sin = await h()
  assert.equal(sin.baremoMinutos, 60)
  assert.equal(sin.realesMinutos, null, 'sin partes: no medido')
  assert.equal(sin.margenCent, null)
  await abrir(m, m.mec.id, ot, min(0))
  assert.equal((await h()).realesMinutos, null, 'con un parte abierto el dato no es definitivo')
  await cerrar(m, m.mec.id, min(45))
  const fin = await h()
  assert.equal(fin.realesMinutos, 45)
  assert.equal(fin.diferenciaMinutos, 15)
  assert.equal(fin.margenCent, 1500, '15 min × 60,00 €/h')
})

test('estados por transicionarOt: terminar con un parte abierto se rechaza; con el parte cerrado, pasa', async () => {
  const m = montar()
  const ot = await otAceptada(m)
  await abrir(m, m.mec.id, ot)
  const cambiar = (hacia: string) => m.conTaller(T, (tx: any) => cambiarEstadoOt(tx, { tallerId: T, otId: ot, hacia, ahora: min(60) }))
  const no = await cambiar('terminado')
  assert.equal(no.ok, false)
  assert.equal((await cambiar('inexistente')).ok, false)
  await cerrar(m, m.mec.id, min(50))
  assert.equal((await cambiar('terminado')).ok, true)
  assert.equal(m.bd.filas('ordenTrabajo').find((o) => o.id === ot).terminadoEn.getTime(), min(60).getTime())
  assert.equal((await cambiar('facturado')).ok, false, 'sin factura emitida no se factura (F2)')
})
