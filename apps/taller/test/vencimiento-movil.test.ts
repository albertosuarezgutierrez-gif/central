/* eslint-disable @typescript-eslint/no-explicit-any */
// Móvil obligatorio en la ficha del cliente y vencimiento del seguro del vehículo (con traza) en recepción y entrega (07/11/2026).
// Cepos vistos fallar (07/11/2026), uno por aserción, y restaurados:
//   (1) lib/recepcion.ts: quitar `if (!movil.ok) throw …` → rojo «sin móvil no se guarda la recepción».
//   (2) lib/entrega.ts: validar la fecha DESPUÉS de cambiarEstadoOt → rojo «fecha mala en la entrega: la OT sigue terminada».
// Fechas relativas al `ahora` inyectado (AHORA del escenario), nunca al reloj real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MENSAJE_MOVIL_OBLIGATORIO } from '@central/module-taller'
import { almacenSoloMetadatos } from '../lib/almacen.ts'
import { entregarOt } from '../lib/entrega.ts'
import { AHORA, montar, recibir, T } from './_escenario.ts'

const enDias = (d: number) => new Date(AHORA.getTime() + d * 86_400_000).toISOString().split('T')[0]
const seguro = (vence: string | null) => ({ vigente: true, aseguradora: '', vence })
const veh = (m: ReturnType<typeof montar>) => m.bd.filas('vehiculo')[0]

test('sin móvil no se guarda la recepción (cliente nuevo), con el mensaje claro, y no queda nada a medias', async () => {
  const m = montar()
  await assert.rejects(recibir(m, { cliente: { nombre: 'Ana', movil: '  ', correo: 'ana@correo.es' } }), (e: Error) => e.message === MENSAJE_MOVIL_OBLIGATORIO)
  await assert.rejects(recibir(m, { cliente: { nombre: 'Ana', movil: '123', correo: '' } }), /móvil no es válido/)
  assert.equal(m.bd.filas('cliente').length, 0)
  assert.equal(m.bd.filas('recepcion').length, 0)
})

test('cliente ANTIGUO sin móvil: al volver a recepción se le pide; con él, se guarda normalizado', async () => {
  const m = montar()
  const viejo = m.bd.sembrar('cliente', { tallerId: T, nombre: 'Antiguo', movil: null, correo: null })
  await assert.rejects(recibir(m, { clienteId: viejo.id, cliente: { nombre: 'Antiguo', movil: '', correo: '' } }), /obligatorio/)
  await recibir(m, { clienteId: viejo.id, cliente: { nombre: 'Antiguo', movil: '+34 611 22 33 44', correo: '' } })
  assert.equal(m.bd.filas('cliente').find((c) => c.id === viejo.id).movil, '611223344')
})

test('recepción: vencimiento del seguro al vehículo con quién, cuándo y «recepcion»; sin fecha = NULL (no se sabe)', async () => {
  const m = montar()
  await recibir(m, { usuarioId: m.dueno.id })
  assert.equal(veh(m).seguroHasta ?? null, null, 'nunca un valor por defecto')
  await recibir(m, { usuarioId: m.dueno.id, seguro: seguro(enDias(200)) })
  assert.equal(veh(m).seguroHasta.toISOString().split('T')[0], enDias(200))
  assert.equal(veh(m).seguroHastaPor, m.dueno.id)
  assert.equal(veh(m).seguroHastaEn.getTime(), AHORA.getTime())
  assert.equal(veh(m).seguroHastaOrigen, 'recepcion')
})

test('recepción: campo vacío no borra un vencimiento conocido; fecha fuera de ±2 años se rechaza', async () => {
  const m = montar()
  await recibir(m, { seguro: seguro(enDias(100)) })
  await recibir(m, { seguro: seguro(null) })
  assert.equal(veh(m).seguroHasta.toISOString().split('T')[0], enDias(100))
  await assert.rejects(recibir(m, { seguro: seguro(enDias(800)) }), /más de 2 años/)
  await assert.rejects(recibir(m, { seguro: seguro(enDias(-800)) }), /más de 2 años/)
  assert.equal(veh(m).seguroHasta.toISOString().split('T')[0], enDias(100))
})

async function otTerminada(m: ReturnType<typeof montar>, vence: string | null = null) {
  const r = await recibir(m, { seguro: vence ? seguro(vence) : null })
  await m.conTaller(T, (tx: any) => tx.ordenTrabajo.update({ where: { id: r.otId }, data: { estado: 'terminado' } }))
  return r.otId as string
}
const entregar = (m: ReturnType<typeof montar>, otId: string, vencimientoSeguro: string | null) =>
  m.conTaller(T, (tx: any) => entregarOt(tx, almacenSoloMetadatos, m.config, {
    tallerId: T, otId, ahora: AHORA, retira: { nombre: 'Ana Pérez', firma: { mime: 'image/png', bytes: new Uint8Array([1]) } },
    versionTextoVista: m.config.retirada.versionTextoConformidad, usuarioId: m.mec.id, vencimientoSeguro,
  }))

test('entrega: corrige el vencimiento que constaba y deja la traza «entrega»', async () => {
  const m = montar()
  const id = await otTerminada(m, enDias(30))
  const r: any = await entregar(m, id, enDias(395))
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(veh(m).seguroHasta.toISOString().split('T')[0], enDias(395))
  assert.equal(veh(m).seguroHastaOrigen, 'entrega')
  assert.equal(veh(m).seguroHastaPor, m.mec.id)
})

test('fecha mala en la entrega: no se entrega, la OT sigue terminada y el vencimiento no cambia', async () => {
  const m = montar()
  const id = await otTerminada(m, enDias(30))
  const r: any = await entregar(m, id, enDias(900))
  assert.equal(r.ok, false)
  assert.equal(m.bd.filas('ordenTrabajo').find((x) => x.id === id).estado, 'terminado')
  assert.equal(veh(m).seguroHasta.toISOString().split('T')[0], enDias(30))
  assert.equal(veh(m).seguroHastaOrigen, 'recepcion')
})

test('entrega sin fecha: entrega normal y el vencimiento sigue «no se sabe»', async () => {
  const m = montar()
  const id = await otTerminada(m)
  const r: any = await entregar(m, id, null)
  assert.ok(r.ok)
  assert.equal(veh(m).seguroHasta ?? null, null)
})
