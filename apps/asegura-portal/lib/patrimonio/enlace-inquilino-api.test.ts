import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { NivelPatrimonio } from '@central/module-patrimonio'

import {
  responderCompartirRecibo,
  responderCrearEnlace,
  responderListarEnlaces,
  responderRetirarEnlace,
  type DocumentoCompartible,
  type PuertosEnlaceInquilino,
} from './enlace-inquilino-api.ts'

const CT = '11111111-1111-4111-8111-111111111111'
const CT_AJENO = '22222222-2222-4222-8222-222222222222'
const Q1 = '33333333-3333-4333-8333-333333333333'
const Q_OTRO_CONTRATO = '44444444-4444-4444-8444-444444444444'
const DOC = '55555555-5555-4555-8555-555555555555'
const DOC_AJENO = '66666666-6666-4666-8666-666666666666'
const AHORA = new Date('2026-10-26T10:00:00Z')

function puertos(nivel: NivelPatrimonio | null, hoyCreados = 0) {
  const escrituras: string[] = []
  const docs: DocumentoCompartible[] = [
    { id: DOC, inquilinoId: Q1, nombre: 'ene.pdf', carpeta: 'recibos', creadoEn: AHORA, compartido: false },
  ]
  const p: PuertosEnlaceInquilino = {
    async accesos() {
      return new Map(nivel ? [['cliente1', nivel]] : [])
    },
    ahora: () => AHORA,
    async contrato(id) {
      return id === CT ? { clienteId: 'cliente1', contratoId: CT, inquilinoIds: [Q1] } : null
    },
    async creadosDesde() {
      return hoyCreados
    },
    async crearEnlace(x) {
      escrituras.push(`crear:${x.tokenHash}:${x.contacto}:${x.caducaEn.toISOString()}`)
      return { id: 'e1' }
    },
    async listar() {
      return [
        { id: 'e1', inquilinoId: Q1, creadoEn: AHORA, caducaEn: new Date('2026-11-09T10:00:00Z'), anuladoEn: null, acceso: null },
        { id: 'e2', inquilinoId: Q1, creadoEn: AHORA, caducaEn: new Date('2026-11-09T10:00:00Z'), anuladoEn: null, acceso: { id: 'a', aceptadoEn: AHORA, revocadoEn: null, revocadoPor: null } },
        { id: 'e3', inquilinoId: Q1, creadoEn: AHORA, caducaEn: new Date('2026-11-09T10:00:00Z'), anuladoEn: null, acceso: { id: 'b', aceptadoEn: AHORA, revocadoEn: AHORA, revocadoPor: 'inquilino' } },
      ]
    },
    async retirar(x) {
      escrituras.push(`retirar:${x.contratoId}:${x.enlaceId}`)
      return true
    },
    async documentos() {
      return docs
    },
    async compartir(x) {
      escrituras.push(`compartir:${x.inquilinoId}:${x.documentoId}:${x.compartir}`)
      return true
    },
    token: () => 'tok',
    hashToken: (t) => `hash(${t})`,
  }
  return { p, escrituras }
}

test('crear: solo Total, token una vez, en BD solo el hash, caduca a 14 días', async () => {
  const { p, escrituras } = puertos('total')
  const r = await responderCrearEnlace(p, CT, { inquilinoId: Q1, contacto: '  Rosa  ' })
  assert.equal(r.status, 201)
  assert.equal(r.body.token, 'tok')
  assert.equal(r.body.caducaEn, '2026-11-09T10:00:00.000Z')
  assert.deepEqual(escrituras, ['crear:hash(tok):Rosa:2026-11-09T10:00:00.000Z'])
  assert.ok(!escrituras.join().includes(',tok'), 'el token en claro no llega al puerto de BD')
})

test('🚨 sin nivel Total (gestión, consulta o sin acceso) o contrato ajeno: la MISMA 404 y nada escrito', async () => {
  for (const nivel of ['gestion', 'consulta', null] as Array<NivelPatrimonio | null>) {
    const { p, escrituras } = puertos(nivel)
    const r = await responderCrearEnlace(p, CT, { inquilinoId: Q1, contacto: 'Rosa' })
    assert.deepEqual(r, { status: 404, body: { error: 'no_encontrado' } }, String(nivel))
    assert.deepEqual(escrituras, [])
  }
  const { p, escrituras } = puertos('total')
  assert.deepEqual(await responderCrearEnlace(p, CT_AJENO, { inquilinoId: Q1, contacto: 'Rosa' }), { status: 404, body: { error: 'no_encontrado' } })
  assert.deepEqual(await responderCrearEnlace(p, 'no-uuid', {}), { status: 404, body: { error: 'no_encontrado' } })
  assert.deepEqual(escrituras, [])
})

test('crear: el inquilino se busca DENTRO del contrato; contacto obligatorio; tope diario', async () => {
  const { p, escrituras } = puertos('total')
  assert.equal((await responderCrearEnlace(p, CT, { inquilinoId: Q_OTRO_CONTRATO, contacto: 'Rosa' })).status, 404)
  assert.equal((await responderCrearEnlace(p, CT, { inquilinoId: 'x', contacto: 'Rosa' })).status, 404)
  assert.deepEqual(await responderCrearEnlace(p, CT, { inquilinoId: Q1, contacto: '   ' }), { status: 400, body: { error: 'datos_invalidos', campo: 'contacto' } })
  assert.deepEqual(escrituras, [])
  const lleno = puertos('total', 20)
  assert.equal((await responderCrearEnlace(lleno.p, CT, { inquilinoId: Q1, contacto: 'Rosa' })).status, 429)
  assert.deepEqual(lleno.escrituras, [])
})

test('listar: estados legibles y el token nunca sale', async () => {
  const r = await responderListarEnlaces(puertos('total').p, CT)
  const e = r.body.enlaces as Array<Record<string, unknown>>
  assert.deepEqual(e.map((x) => x.estado), ['vigente', 'en_uso', 'revocado'])
  assert.equal(e[2].revocadoPor, 'inquilino')
  assert.ok(e.every((x) => !('token' in x) && !('tokenHash' in x)))
  assert.equal((await responderListarEnlaces(puertos('gestion').p, CT)).status, 404)
})

test('retirar: solo Total y contrato propio', async () => {
  const { p, escrituras } = puertos('total')
  assert.equal((await responderRetirarEnlace(p, CT, 'e1x')).status, 404, 'enlace que no es uuid')
  assert.equal((await responderRetirarEnlace(p, CT, '77777777-7777-4777-8777-777777777777')).status, 200)
  assert.deepEqual(escrituras, ['retirar:' + CT + ':77777777-7777-4777-8777-777777777777'])
  const g = puertos('gestion')
  assert.equal((await responderRetirarEnlace(g.p, CT, '77777777-7777-4777-8777-777777777777')).status, 404)
  assert.deepEqual(g.escrituras, [])
})

test('compartir recibo: el inquilino sale del documento real, no del cuerpo; documento ajeno = 404', async () => {
  const { p, escrituras } = puertos('total')
  assert.equal((await responderCompartirRecibo(p, CT, { documentoId: DOC, compartir: true, inquilinoId: Q_OTRO_CONTRATO })).status, 200)
  assert.deepEqual(escrituras, [`compartir:${Q1}:${DOC}:true`])
  assert.equal((await responderCompartirRecibo(p, CT, { documentoId: DOC_AJENO, compartir: true })).status, 404)
  assert.equal((await responderCompartirRecibo(p, CT, { documentoId: DOC })).status, 400)
  assert.equal((await responderCompartirRecibo(puertos('gestion').p, CT, { documentoId: DOC, compartir: true })).status, 404)
  assert.equal(escrituras.length, 1)
})
