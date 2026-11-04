/* eslint-disable @typescript-eslint/no-explicit-any */
// Recepción: el servicio NO depende de las casillas; el consentimiento guarda texto y versión EXACTOS de module-taller.
// Cepos vistos fallar el 04/11/2026: (1) en lib/consentimientos.ts `o.marcadas.asegura === true` → `true` (crea el
// consentimiento aunque no se marque): rojo en 'sin marcar'. (2) cambiar el texto guardado por el de la config del taller:
// rojo en 'texto y versión exactos'. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEXTOS_CONSENTIMIENTO_ASEGURA, VERSION_TEXTO_ASEGURA_VIGENTE } from '@central/module-taller'
import { AHORA, montar, recibir, T, T2 } from './_escenario.ts'

test('sin marcar ninguna casilla: la recepción se guarda, abre la OT y NO crea consentimiento ASegura', async () => {
  const m = montar()
  const r = await recibir(m)
  assert.equal(r.otNumero, 1)
  assert.equal(r.firmada, true)
  assert.equal(m.bd.filas('consentimiento').length, 0, 'sin marcar = ninguna fila (no se fabrican consentimientos)')
  assert.deepEqual(r.consentimientos, { asegura: false, taller: false })
  assert.equal(r.lead.permitido, false, 'sin consentimiento no hay lead')
  assert.equal(m.bd.filas('recepcion').length, 1)
  assert.equal(m.bd.filas('ordenTrabajo')[0].estado, 'recepcion')
})

test('casilla ASegura marcada: fila con texto y versión exactos del módulo, canal y firma; el lead queda permitido (sin transporte)', async () => {
  const m = montar()
  const r = await recibir(m, { casillas: { asegura: true, taller: false }, ip: '1.2.3.4' })
  const fs = m.bd.filas('consentimiento')
  assert.equal(fs.length, 1)
  assert.equal(fs[0].finalidad, 'asegura')
  assert.equal(fs[0].textoMostrado, TEXTOS_CONSENTIMIENTO_ASEGURA[VERSION_TEXTO_ASEGURA_VIGENTE], 'texto y versión exactos')
  assert.equal(fs[0].versionTexto, VERSION_TEXTO_ASEGURA_VIGENTE)
  assert.equal(fs[0].canal, 'recepcion')
  assert.equal(fs[0].otorgado, true)
  assert.ok(fs[0].firmaRuta, 'ligado a la firma de la recepción')
  assert.equal(fs[0].otorgadoEn, AHORA)
  assert.equal(fs[0].ip, '1.2.3.4')
  assert.ok(r.lead.permitido && r.lead.consentimientoId === fs[0].id)
})

test('casilla del taller: texto y versión de SU configuración; no activa el lead de ASegura', async () => {
  const m = montar()
  const r = await recibir(m, { casillas: { asegura: false, taller: true } })
  const fs = m.bd.filas('consentimiento')
  assert.equal(fs.length, 1)
  assert.equal(fs[0].finalidad, 'taller_comercial')
  assert.equal(fs[0].textoMostrado, m.config.textos.textoConsentimientoComercialTaller)
  assert.equal(fs[0].versionTexto, m.config.textos.versionTextoComercialTaller)
  assert.equal(r.lead.permitido, false)
})

test('misma matrícula (otro formato) reutiliza el vehículo y el cliente; la OT siguiente es la 2', async () => {
  const m = montar()
  const a = await recibir(m, { matricula: '1234 BCD' })
  const b = await recibir(m, { matricula: '1234-bcd', clienteId: a.clienteId, km: 121000 })
  assert.equal(b.vehiculoId, a.vehiculoId)
  assert.equal(b.clienteId, a.clienteId)
  assert.equal(b.otNumero, 2)
  assert.equal(m.bd.filas('vehiculo').length, 1)
  assert.equal(m.bd.filas('vehiculo')[0].kmActuales, 121000)
})

test('sin firma: se guarda, pero NO queda firmada (la OT no podrá presupuestarse)', async () => {
  const m = montar()
  const r = await recibir(m, { firma: null })
  assert.equal(r.firmada, false)
  assert.equal(m.bd.filas('recepcion')[0].firmadoEn ?? null, null)
})

test('fotos: se guardan metadatos (ruta + huella) en orden; no se exige ninguna', async () => {
  const m = montar()
  await recibir(m, { fotos: [{ posicion: 'Frontal', mime: 'image/jpeg', nombre: 'a.jpg', bytes: new Uint8Array([9, 9]), capturadaEn: AHORA }] })
  const f = m.bd.filas('recepcionFoto')
  assert.equal(f.length, 1)
  assert.match(f[0].huellaSha256, /^[0-9a-f]{64}$/)
  const rec = m.bd.filas('recepcion')[0]
  assert.ok(f[0].ruta.startsWith(`${T}/${rec.id}/`), f[0].ruta) // ruta <tallerId>/<recepcionId>/…
  assert.ok(rec.firmaRuta.startsWith(`${T}/${rec.id}/`), rec.firmaRuta)
  assert.equal(f[0].orden, 1)
})

test('sin matrícula o sin nombre: error, y no queda nada a medias', async () => {
  const m = montar()
  await assert.rejects(recibir(m, { matricula: ' - ' }), /matrícula/)
  await assert.rejects(recibir(m, { cliente: { nombre: ' ', movil: '', correo: '' } }), /nombre/)
  assert.equal(m.bd.filas('recepcion').length, 0)
})

test('aislamiento: otro taller no ve la recepción ni el vehículo', async () => {
  const m = montar()
  await recibir(m)
  const vistos = await m.conTaller(T2, async (tx: any) => (await tx.vehiculo.findMany({})).length + (await tx.recepcion.findMany({})).length)
  assert.equal(vistos, 0)
})
