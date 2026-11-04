/* eslint-disable @typescript-eslint/no-explicit-any */
// Firma de retirada: OT terminado → entregado con la conformidad firmada. Cepos vistos fallar el 04/11/2026:
//   (1) lib/entrega.ts: quitar la llamada a validarRetirada → rojo en «firma obligatoria: sin firma no se entrega»;
//   (2) lib/entrega.ts: guardar `config.retirada.versionTextoConformidad` sin guardar el texto → rojo en «guarda … el texto EXACTO».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { almacenSoloMetadatos } from '../lib/almacen.ts'
import { entregarOt } from '../lib/entrega.ts'
import { AHORA, montar, recibir, T } from './_escenario.ts'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9])
const firma = { mime: 'image/png', bytes: PNG }

async function otTerminada(m: ReturnType<typeof montar>) {
  const r = await recibir(m)
  await m.conTaller(T, (tx: any) => tx.ordenTrabajo.update({ where: { id: r.otId }, data: { estado: 'terminado' } }))
  return r.otId as string
}
const entregar = (m: ReturnType<typeof montar>, otId: string, o: { nombre?: string; firma?: typeof firma | null; version?: string | null; almacen?: any } = {}) =>
  m.conTaller(T, (tx: any) => entregarOt(tx, o.almacen ?? almacenSoloMetadatos, m.config, {
    tallerId: T, otId, ahora: AHORA,
    retira: { nombre: o.nombre ?? 'Ana Pérez', firma: o.firma === undefined ? firma : o.firma },
    versionTextoVista: o.version === undefined ? m.config.retirada.versionTextoConformidad : o.version,
  }))
const ot = (m: ReturnType<typeof montar>, id: string) => m.bd.filas('ordenTrabajo').find((x) => x.id === id)

test('guarda la firma en el almacén de la OT, entregado_en, el texto EXACTO, su versión y el nombre de quien retira', async () => {
  const m = montar()
  m.config.retirada.textoConformidad = 'Texto de conformidad ÚNICO de este taller.'
  m.config.retirada.versionTextoConformidad = 'retirada-7'
  const id = await otTerminada(m)
  const r: any = await entregar(m, id, { nombre: '  Luis Gómez ' })
  assert.ok(r.ok, JSON.stringify(r))
  const f = ot(m, id)
  assert.equal(f.estado, 'entregado')
  assert.equal(f.entregadoEn.getTime(), AHORA.getTime())
  assert.ok(f.entregaFirmaRuta.startsWith(`${T}/${id}/firma-entrega-`) && f.entregaFirmaRuta.endsWith('.png'))
  assert.equal(f.entregaConformidadTexto, 'Texto de conformidad ÚNICO de este taller.')
  assert.equal(f.entregaConformidadVersion, 'retirada-7')
  assert.equal(f.entregaRetiraNombre, 'Luis Gómez')
})

test('firma obligatoria: sin firma o sin nombre no se entrega y la OT sigue terminada', async () => {
  const m = montar()
  assert.equal(m.config.retirada.firmaObligatoria, true)
  const id = await otTerminada(m)
  const sinFirma: any = await entregar(m, id, { firma: null })
  assert.equal(sinFirma.ok, false)
  assert.match(sinFirma.motivo, /firma/)
  const sinNombre: any = await entregar(m, id, { nombre: '  ' })
  assert.equal(sinNombre.ok, false)
  assert.match(sinNombre.motivo, /nombre/)
  assert.equal(ot(m, id).estado, 'terminado')
  assert.equal(ot(m, id).entregadoEn ?? null, null)
})

test('firma desactivada por el taller: se entrega sin firma (quien retira, si se dio, se anota)', async () => {
  const m = montar()
  m.config.retirada.firmaObligatoria = false
  const id = await otTerminada(m)
  const r: any = await entregar(m, id, { firma: null, nombre: '' })
  assert.ok(r.ok, JSON.stringify(r))
  const f = ot(m, id)
  assert.equal(f.estado, 'entregado')
  assert.equal(f.entregaFirmaRuta ?? null, null)
  assert.equal(f.entregaConformidadTexto ?? null, null, 'sin firma no se anota una conformidad que nadie firmó')
})

test('si el texto cambió mientras se firmaba (otra versión en pantalla), se rechaza', async () => {
  const m = montar()
  const id = await otTerminada(m)
  const r: any = await entregar(m, id, { version: 'retirada-vieja' })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /texto de conformidad ha cambiado/)
  assert.equal(ot(m, id).estado, 'terminado')
})

test('si Storage falla al guardar la firma, la OT NO queda entregada (se deshace todo)', async () => {
  const m = montar()
  const id = await otTerminada(m)
  const caido = { ...almacenSoloMetadatos, guardar: async () => { throw new Error('Storage upload 500') } }
  await assert.rejects(entregar(m, id, { almacen: caido }), /Storage upload/)
  assert.equal(ot(m, id).estado, 'terminado')
  assert.equal(ot(m, id).entregadoEn ?? null, null)
})

test('solo se entrega lo que está terminado (transición validada por el módulo)', async () => {
  const m = montar()
  const r0 = await recibir(m)
  const r: any = await entregar(m, r0.otId)
  assert.equal(r.ok, false)
  assert.equal(ot(m, r0.otId).estado, 'recepcion')
})
