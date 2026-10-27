import { test } from 'node:test'
import assert from 'node:assert/strict'

import { VERSION_CONSENTIMIENTO_INQUILINO as V, type AccesoInquilino, type VistaContratoInquilino } from '@central/module-patrimonio'

import {
  consentimientoDeLaSolicitud,
  responderPedirPrecioInquilino,
  revisarSolicitudPrecioInquilino,
  type PuertosPrecioInquilino,
  type ResultadoPuentePrecioInquilino,
} from './precio-inquilino.ts'
import { interpretarPuentePrecioInquilino } from './precio-puente.ts'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const CUERPO = { que: 'ambos', nombre: 'Lucía Pérez', canal: 'correo', contacto: 'Lucia@Example.com' }

const vista: VistaContratoInquilino = {
  contacto: 'X', inmueble: 'Calle Socorro 24', inicio: '2026-01-01', fin: null, terminadoEn: null, rentaMensualCent: 85000, seguro: null, recibos: [],
}

function mundo(identidadId: string, extra: { accesos?: AccesoInquilino[]; puente?: ResultadoPuentePrecioInquilino; falla?: boolean } = {}) {
  const accesos = extra.accesos ?? [
    { id: 'aA', contratoId: C1, inquilinoId: 'qA', identidadId: 'A', revocadoEn: null },
    { id: 'aB', contratoId: C2, inquilinoId: 'qB', identidadId: 'B', revocadoEn: null },
  ]
  const puente: Array<Record<string, unknown>> = []
  const consentimientos: Array<{ accesoId: string; concedido: boolean; versionTexto: string }> = []
  const p: PuertosPrecioInquilino = {
    identidadId,
    // Se entrega TODO a propósito: es `accesoParaContrato` quien aísla.
    accesos: async () => accesos,
    vista: async () => vista,
    consentimientos: async () => [],
    async registrarConsentimiento(x) {
      if (extra.falla) throw new Error('bd')
      consentimientos.push({ accesoId: x.acceso.id, concedido: x.concedido, versionTexto: x.versionTexto })
    },
    async pedirPorPuente(x) {
      puente.push({ ...x })
      return extra.puente ?? { estado: 'ok', pedidoEl: '2026-10-27', yaExistia: false }
    },
  }
  return { p, puente, consentimientos }
}

test('🚨 AISLAMIENTO: B no puede pedir precio sobre el contrato de A (404 y el puente ni se llama)', async () => {
  const m = mundo('B')
  const r = await responderPedirPrecioInquilino(m.p, C1, CUERPO)
  assert.equal(r.status, 404)
  assert.equal(m.puente.length, 0)
  assert.equal(m.consentimientos.length, 0)
})

test('🚨 AISLAMIENTO: acceso revocado o contrato que no es un uuid = la misma 404', async () => {
  const m = mundo('A', { accesos: [{ id: 'aA', contratoId: C1, inquilinoId: 'qA', identidadId: 'A', revocadoEn: new Date() }] })
  assert.equal((await responderPedirPrecioInquilino(m.p, C1, CUERPO)).status, 404)
  assert.equal((await responderPedirPrecioInquilino(mundo('A').p, 'x', CUERPO)).status, 404)
  assert.equal(m.puente.length, 0)
})

test('🚨 al puente va la identidad de la COOKIE y la solicitud, NADA del contrato ni del consentimiento', async () => {
  const m = mundo('A')
  const r = await responderPedirPrecioInquilino(m.p, C1, { ...CUERPO, identidadId: 'B', contratoId: C2, clienteId: C2, ofertas: true, versionOfertas: V })
  assert.equal(r.status, 201)
  assert.equal(m.puente.length, 1)
  assert.deepEqual(Object.keys(m.puente[0]!).sort(), ['canal', 'contacto', 'identidadId', 'nombre', 'que'])
  assert.equal(m.puente[0]!.identidadId, 'A')
  assert.equal(m.puente[0]!.contacto, 'lucia@example.com')
})

test('🚨 solicitud ≠ consentimiento: sin «sí» explícito NO se escribe nada (ni concedido ni retirada)', async () => {
  for (const ofertas of [undefined, false, 'true', 1, null, 'on']) {
    const m = mundo('A')
    const r = await responderPedirPrecioInquilino(m.p, C1, { ...CUERPO, ofertas, versionOfertas: V })
    assert.equal(r.status, 201, String(ofertas))
    assert.equal(r.body.ofertas, 'no_marcada')
    assert.equal(m.consentimientos.length, 0, `ofertas=${String(ofertas)} escribió un consentimiento`)
  }
  assert.equal(consentimientoDeLaSolicitud(false), null)
})

test('casilla marcada con el texto vigente: UN consentimiento concedido, de ESTE acceso y de la versión actual', async () => {
  const m = mundo('A')
  const r = await responderPedirPrecioInquilino(m.p, C1, { ...CUERPO, ofertas: true, versionOfertas: V })
  assert.equal(r.body.ofertas, 'guardada')
  assert.deepEqual(m.consentimientos, [{ accesoId: 'aA', concedido: true, versionTexto: V }])
})

test('casilla marcada con un texto viejo: 409 y no se pide nada (no se sella un «sí» a otro texto)', async () => {
  const m = mundo('A')
  const r = await responderPedirPrecioInquilino(m.p, C1, { ...CUERPO, ofertas: true, versionOfertas: '2026-10-26-borrador-1' })
  assert.equal(r.status, 409)
  assert.equal(m.puente.length, 0)
  assert.equal(m.consentimientos.length, 0)
})

test('si la petición no sale, tampoco se guarda la casilla; si la casilla falla, se dice', async () => {
  for (const [puente, status] of [[{ estado: 'error' }, 502], [{ estado: 'sin_puente' }, 503], [{ estado: 'invalido', campo: 'contacto' }, 400]] as const) {
    const m = mundo('A', { puente })
    const r = await responderPedirPrecioInquilino(m.p, C1, { ...CUERPO, ofertas: true, versionOfertas: V })
    assert.equal(r.status, status)
    assert.equal(m.consentimientos.length, 0)
  }
  const f = mundo('A', { falla: true })
  const r = await responderPedirPrecioInquilino(f.p, C1, { ...CUERPO, ofertas: true, versionOfertas: V })
  assert.equal(r.status, 201)
  assert.equal(r.body.ofertas, 'no_guardada')
})

test('ya pedido: 200 con la fecha de la primera petición', async () => {
  const m = mundo('A', { puente: { estado: 'ok', pedidoEl: '2026-10-20', yaExistia: true } })
  const r = await responderPedirPrecioInquilino(m.p, C1, CUERPO)
  assert.equal(r.status, 200)
  assert.equal(r.body.pedidoEl, '2026-10-20')
})

test('validación: lista cerrada, nombre, y el contacto según el canal elegido', () => {
  assert.equal(revisarSolicitudPrecioInquilino({ ...CUERPO, que: 'vida' }).ok, false)
  assert.equal(revisarSolicitudPrecioInquilino({ ...CUERPO, nombre: '  ' }).ok, false)
  assert.equal(revisarSolicitudPrecioInquilino({ ...CUERPO, nombre: 'x'.repeat(81) }).ok, false)
  assert.equal(revisarSolicitudPrecioInquilino({ ...CUERPO, canal: 'whatsapp' }).ok, false)
  const malCorreo = revisarSolicitudPrecioInquilino({ ...CUERPO, contacto: '600000000' })
  assert.ok(!malCorreo.ok && malCorreo.campo === 'contacto')
  const tel = revisarSolicitudPrecioInquilino({ ...CUERPO, canal: 'telefono', contacto: '+34 600 00 00 00' })
  assert.ok(tel.ok && tel.solicitud.contacto === '600000000')
})

test('interpretar el puente: solo un 200 ok bien formado es «pedido»', () => {
  assert.deepEqual(interpretarPuentePrecioInquilino(200, { estado: 'ok', pedidoEl: '2026-10-27', yaExistia: false }), { estado: 'ok', pedidoEl: '2026-10-27', yaExistia: false })
  assert.deepEqual(interpretarPuentePrecioInquilino(200, { estado: 'ok' }), { estado: 'error' })
  assert.deepEqual(interpretarPuentePrecioInquilino(422, { estado: 'invalido', campo: 'contacto' }), { estado: 'invalido', campo: 'contacto' })
  assert.deepEqual(interpretarPuentePrecioInquilino(503, { estado: 'sin_configurar' }), { estado: 'sin_puente' })
  assert.deepEqual(interpretarPuentePrecioInquilino(503, { estado: 'error' }), { estado: 'error' })
  assert.deepEqual(interpretarPuentePrecioInquilino(500, null), { estado: 'error' })
})
