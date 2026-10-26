import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  VERSION_CONSENTIMIENTO_INQUILINO as V,
  type AccesoInquilino,
  type ConsentimientoInquilino,
  type VistaContratoInquilino,
} from '@central/module-patrimonio'

import {
  enlaceVigente,
  inquilinoAceptaOfertas,
  responderCanjear,
  responderConsentimiento,
  responderDescarga,
  responderMiContrato,
  responderMisContratos,
  responderRevocar,
  responderSubirJustificante,
  type EnlaceLeido,
  type PuertosInquilino,
} from './inquilino-api.ts'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const D1 = '33333333-3333-4333-8333-333333333333'
const AHORA = new Date('2026-10-26T10:00:00Z')
const TOKEN = 'a'.repeat(64)

const vista = (contacto: string): VistaContratoInquilino => ({
  contacto, inmueble: 'Calle Socorro 24', inicio: '2026-01-01', fin: null, terminadoEn: null, rentaMensualCent: 85000, seguro: null, recibos: [],
})

/** Mundo en memoria: dos inquilinos (identidades A y B), cada uno con SU contrato. */
function mundo(identidadId: string, extra: { accesos?: AccesoInquilino[]; consentimientos?: ConsentimientoInquilino[]; enlace?: EnlaceLeido | null } = {}) {
  const accesos: AccesoInquilino[] = extra.accesos ?? [
    { id: 'aA', contratoId: C1, inquilinoId: 'qA', identidadId: 'A', revocadoEn: null },
    { id: 'aB', contratoId: C2, inquilinoId: 'qB', identidadId: 'B', revocadoEn: null },
  ]
  const consentimientos = extra.consentimientos ?? []
  const llamadas: string[] = []
  const p: PuertosInquilino = {
    identidadId,
    ahora: () => AHORA,
    hashToken: (t) => `h:${t}`,
    async enlacePorHash(h) {
      return h === `h:${TOKEN}` ? (extra.enlace === undefined ? { id: 'e1', contratoId: C1, inquilinoId: 'qA', anuladoEn: null, caducaEn: new Date('2026-11-01T00:00:00Z'), usado: false } : extra.enlace) : null
    },
    async canjear(id) {
      llamadas.push(`canjear:${id}`)
      return { ok: true, contratoId: C1 }
    },
    async accesos() {
      // El puerto real filtra por identidad; aquí se entrega TODO a propósito para que sea `accesoParaContrato` quien aísle.
      return accesos
    },
    async vista(a) {
      return vista(`contrato de ${a.contratoId}`)
    },
    async misJustificantes() {
      return []
    },
    async guardarJustificante() {
      llamadas.push('guardar')
      return { ok: true, id: 'doc1' }
    },
    async descargar(a, documentoId) {
      llamadas.push(`descargar:${a.contratoId}:${documentoId}`)
      return { nombre: 'x.pdf', mime: 'application/pdf', contenido: Buffer.from('%PDF-1.4') }
    },
    async consentimientos() {
      return consentimientos
    },
    async registrarConsentimiento({ concedido, versionTexto }) {
      llamadas.push(`consentir:${concedido}:${versionTexto}`)
      consentimientos.push({ concedido, versionTexto, creadoEn: new Date(AHORA.getTime() + consentimientos.length + 1) })
    },
    async revocar(a) {
      llamadas.push(`revocar:${a.id}`)
      return true
    },
  }
  return { p, llamadas }
}

test('🚨 AISLAMIENTO: el inquilino B pide el contrato de A y recibe la MISMA 404 que un contrato inexistente', async () => {
  const { p } = mundo('B')
  const ajeno = await responderMiContrato(p, C1)
  const inexistente = await responderMiContrato(p, '99999999-9999-4999-8999-999999999999')
  assert.equal(ajeno.status, 404)
  assert.deepEqual(ajeno, inexistente)
  assert.equal((await responderMiContrato(p, C2)).status, 200, 'el suyo sí')
})

test('🚨 AISLAMIENTO: lo mismo en justificantes, descarga, consentimiento y revocación', async () => {
  const { p, llamadas } = mundo('B')
  const fichero = { nombre: 'a.pdf', tamano: 8, contenido: Buffer.from('%PDF-1.4') }
  assert.equal((await responderSubirJustificante(p, C1, fichero)).status, 404)
  assert.equal((await responderDescarga(p, C1, D1)).status, 404)
  assert.equal((await responderConsentimiento(p, C1, { concedido: true, version: V })).status, 404)
  assert.equal((await responderRevocar(p, C1)).status, 404)
  assert.deepEqual(llamadas, [], 'ni una sola escritura ni lectura de fichero sobre el contrato ajeno')
})

test('un acceso REVOCADO no abre nada (ni la vista ni la descarga)', async () => {
  const { p } = mundo('A', { accesos: [{ id: 'aA', contratoId: C1, inquilinoId: 'qA', identidadId: 'A', revocadoEn: AHORA }] })
  assert.equal((await responderMiContrato(p, C1)).status, 404)
  assert.equal((await responderDescarga(p, C1, D1)).status, 404)
  assert.deepEqual((await responderMisContratos(p)).body, { contratos: [] })
})

test('mis contratos: solo los vivos de MI identidad', async () => {
  const { p } = mundo('A')
  const r = await responderMisContratos(p)
  assert.deepEqual((r.body.contratos as Array<{ contratoId: string }>).map((c) => c.contratoId), [C1])
})

test('canjear: enlace vigente → 200 y gasta; anulado, gastado, caducado, desconocido y mal formado → LA MISMA respuesta', async () => {
  const ok = await responderCanjear(mundo('A').p, TOKEN)
  assert.equal(ok.status, 200)
  const base = { id: 'e1', contratoId: C1, inquilinoId: 'qA', anuladoEn: null, caducaEn: new Date('2026-11-01T00:00:00Z'), usado: false }
  const muertos = await Promise.all([
    responderCanjear(mundo('A', { enlace: { ...base, anuladoEn: AHORA } }).p, TOKEN),
    responderCanjear(mundo('A', { enlace: { ...base, usado: true } }).p, TOKEN),
    responderCanjear(mundo('A', { enlace: { ...base, caducaEn: new Date('2026-10-01T00:00:00Z') } }).p, TOKEN),
    responderCanjear(mundo('A', { enlace: null }).p, TOKEN),
    responderCanjear(mundo('A').p, 'b'.repeat(64)),
    responderCanjear(mundo('A').p, 'no-es-un-token'),
    responderCanjear(mundo('A').p, undefined),
  ])
  for (const m of muertos) assert.deepEqual(m, muertos[0])
  assert.equal(muertos[0].status, 404)
})

test('canjear no gasta nada si el enlace no es canjeable', async () => {
  const { p, llamadas } = mundo('A', { enlace: { id: 'e1', contratoId: C1, inquilinoId: 'qA', anuladoEn: AHORA, caducaEn: null, usado: false } })
  await responderCanjear(p, TOKEN)
  assert.deepEqual(llamadas, [])
  assert.equal(await enlaceVigente(p, TOKEN), false)
  assert.equal(await enlaceVigente(mundo('A').p, TOKEN), true)
})

test('🚨 consentimiento: nace SIN decidir, un «sí» exige la versión actual, y retirar siempre se admite', async () => {
  const { p, llamadas } = mundo('A')
  const inicial = await responderMiContrato(p, C1)
  assert.equal((inicial.body.consentimiento as { estado: string }).estado, 'sin_decidir')
  assert.equal(await inquilinoAceptaOfertas(p, C1), false, 'sin gesto, cero ofertas')
  assert.equal((await responderConsentimiento(p, C1, { concedido: true, version: 'vieja' })).status, 409)
  assert.equal((await responderConsentimiento(p, C1, { concedido: true })).status, 409)
  assert.equal((await responderConsentimiento(p, C1, { concedido: 'si' })).status, 400)
  assert.deepEqual(llamadas, [], 'ninguno de los intentos inválidos escribe')
  assert.equal((await responderConsentimiento(p, C1, { concedido: true, version: V })).status, 200)
  assert.equal(await inquilinoAceptaOfertas(p, C1), true)
  assert.equal((await responderConsentimiento(p, C1, { concedido: false })).status, 200)
  assert.equal(await inquilinoAceptaOfertas(p, C1), false, 'retirado = cero ofertas')
})

test('🚨 ofertas: aunque haya consentimiento, un acceso ajeno o revocado no las abre', async () => {
  const consentido = [{ concedido: true, versionTexto: V, creadoEn: AHORA }]
  assert.equal(await inquilinoAceptaOfertas(mundo('B', { consentimientos: consentido }).p, C1), false)
  const revocado: AccesoInquilino[] = [{ id: 'aA', contratoId: C1, inquilinoId: 'qA', identidadId: 'A', revocadoEn: AHORA }]
  assert.equal(await inquilinoAceptaOfertas(mundo('A', { accesos: revocado, consentimientos: consentido }).p, C1), false)
})

test('justificantes: formato real (no la extensión), tamaño y fichero obligatorio', async () => {
  const { p, llamadas } = mundo('A')
  assert.equal((await responderSubirJustificante(p, C1, null)).status, 400)
  assert.equal((await responderSubirJustificante(p, C1, { nombre: 'a.pdf', tamano: 5, contenido: Buffer.from('<html>') })).status, 415)
  assert.equal((await responderSubirJustificante(p, C1, { nombre: 'a.pdf', tamano: 11 * 1024 * 1024, contenido: Buffer.from('%PDF-1.4') })).status, 413)
  assert.deepEqual(llamadas, [])
  const ok = await responderSubirJustificante(p, C1, { nombre: 'recibo seguro', tamano: 8, contenido: Buffer.from('%PDF-1.4') })
  assert.equal(ok.status, 201)
  assert.equal(ok.body.nombre, 'recibo seguro.pdf', 'la extensión es la del tipo REAL')
})

test('la vista que llega al cliente no trae nada fuera de la lista blanca', async () => {
  const r = await responderMiContrato(mundo('A').p, C1)
  const v = r.body.vista as Record<string, unknown>
  for (const prohibido of ['fianza', 'fianzaCent', 'gastos', 'rentabilidad', 'titular', 'inquilinos', 'inmuebleId', 'nif', 'email', 'telefono']) {
    assert.equal(prohibido in v, false, prohibido)
  }
})
