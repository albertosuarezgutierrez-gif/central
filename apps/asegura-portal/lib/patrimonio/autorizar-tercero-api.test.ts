import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_INVITACIONES_PATRIMONIO_DIA,
  responderInvitar,
  responderListar,
  responderRevocar,
  type PuertosAutorizarPatrimonio,
} from './autorizar-tercero-api.ts'

const MARIA = '11111111-1111-4111-8111-111111111111'
const AJENA = '22222222-2222-4222-8222-222222222222'
const AUT = '33333333-3333-4333-8333-333333333333'
const AHORA = new Date('2030-01-01T10:00:00Z')

type Llamadas = { crear: number; enviar: number; token: number; revocar: unknown[]; orden: string[] }

function puertos(o: Partial<PuertosAutorizarPatrimonio> = {}, titulares = [{ clienteId: MARIA, nombre: 'María Pérez' }]) {
  const ll: Llamadas = { crear: 0, enviar: 0, token: 0, revocar: [], orden: [] }
  const p: PuertosAutorizarPatrimonio = {
    autorizables: async () => titulares,
    ahora: () => AHORA,
    concedidos: async () => [],
    pendientes: async () => [],
    recibidos: async () => [],
    token: () => {
      ll.token++
      return 'a'.repeat(64)
    },
    enlace: (t) => `https://portal.example/invitacion/${t}`,
    hashCanal: (e) => `h:${e}`,
    hashToken: (t) => `ht:${t}`,
    enviadasDesde: async () => 0,
    esMiCorreo: async () => false,
    yaAutorizado: async () => false,
    crearInvitacion: async () => {
      ll.crear++
      ll.orden.push('fila')
      return { id: 'inv-1' }
    },
    enviarCorreo: async () => {
      ll.enviar++
      ll.orden.push('correo')
      return true
    },
    revocar: async (x) => {
      ll.revocar.push(x)
      return 'ok'
    },
    ...o,
  }
  return { p, ll }
}

const cuerpo = (o: Record<string, unknown> = {}) => ({
  titularClienteId: MARIA,
  alcance: 'patrimonio_gestion',
  email: 'jose@example.com',
  invitadoNombre: 'José',
  ...o,
})

test('🚨 SOLO el titular concede: un titular que no está en autorizables (p. ej. José con Total) = 404 y no escribe nada', async () => {
  const { p, ll } = puertos()
  const r = await responderInvitar(p, cuerpo({ titularClienteId: AJENA }))
  assert.equal(r.status, 404)
  assert.deepEqual(r.body, { error: 'no_encontrado' })
  assert.equal(ll.crear + ll.enviar + ll.token, 0)
  // El autorizado puro: sin titulares propios, ni el de María ni ninguno.
  const sinNada = puertos({}, [])
  assert.equal((await responderInvitar(sinNada.p, cuerpo())).status, 404)
  assert.equal(sinNada.ll.crear, 0)
})

test('el titular invita: la fila ANTES del correo, 201, y ni el token ni el correo vuelven', async () => {
  for (const alcance of ['patrimonio_gestion', 'patrimonio_total']) {
    const { p, ll } = puertos()
    const r = await responderInvitar(p, cuerpo({ alcance }))
    assert.equal(r.status, 201)
    assert.deepEqual(r.body, { id: 'inv-1' })
    assert.deepEqual(ll.orden, ['fila', 'correo'])
    assert.doesNotMatch(JSON.stringify(r.body), /aaaa|jose@/)
  }
})

test('fail-closed: los alcances de la BÓVEDA y la basura no se conceden por aquí (400, sin escribir)', async () => {
  for (const alcance of ['total', 'gestion', 'ver', 'ver_economico', 'flota', 'ninguno', '', null]) {
    const { p, ll } = puertos()
    const r = await responderInvitar(p, cuerpo({ alcance }))
    assert.equal(r.status, 400, String(alcance))
    assert.equal(ll.crear, 0)
  }
})

test('forma: correo inválido, sin nombre o titular sin forma de uuid → 400', async () => {
  for (const c of [cuerpo({ email: 'no-es-correo' }), cuerpo({ email: '' }), cuerpo({ invitadoNombre: '  ' }), cuerpo({ titularClienteId: 'x' }), null]) {
    const { p, ll } = puertos()
    assert.equal((await responderInvitar(p, c)).status, 400)
    assert.equal(ll.crear, 0)
  }
})

test('sin enlace (503) NO escribe la fila; envío fallido (502) SÍ y lo dice con registrada: true', async () => {
  const sin = puertos({ enlace: () => null })
  const r1 = await responderInvitar(sin.p, cuerpo())
  assert.equal(r1.status, 503)
  assert.equal(sin.ll.crear, 0)
  const fallo = puertos({ enviarCorreo: async () => false })
  const r2 = await responderInvitar(fallo.p, cuerpo())
  assert.equal(r2.status, 502)
  assert.equal(r2.body.registrada, true)
  assert.equal(r2.body.error, 'envio_fallido')
})

test('cupo, a uno mismo, ya autorizado y ya invitado', async () => {
  const cupo = puertos({ enviadasDesde: async () => MAX_INVITACIONES_PATRIMONIO_DIA })
  assert.equal((await responderInvitar(cupo.p, cuerpo())).status, 429)
  assert.equal(cupo.ll.crear, 0)
  const yo = puertos({ esMiCorreo: async () => true })
  assert.equal((await responderInvitar(yo.p, cuerpo())).body.error, 'a_si_mismo')
  assert.equal(yo.ll.crear, 0)
  const ya = puertos({ yaAutorizado: async () => true })
  assert.equal((await responderInvitar(ya.p, cuerpo())).status, 409)
  assert.equal(ya.ll.crear, 0)
  const dos = puertos({ crearInvitacion: async () => 'ya_invitado' })
  const r = await responderInvitar(dos.p, cuerpo())
  assert.equal(r.body.error, 'ya_invitado')
  assert.equal(dos.ll.enviar, 0)
})

test('revocar: pasa los titulares autorizables al puerto; ajeno = 404; ya revocado = 409; forma mala = 400', async () => {
  const { p, ll } = puertos()
  assert.equal((await responderRevocar(p, AUT, { accion: 'revocar' })).status, 200)
  assert.deepEqual(ll.revocar, [{ autorizacionId: AUT, clientesIds: [MARIA] }])
  assert.equal((await responderRevocar(puertos({ revocar: async () => 'no_encontrada' }).p, AUT, { accion: 'revocar' })).status, 404)
  assert.equal((await responderRevocar(puertos({ revocar: async () => 'ya_revocada' }).p, AUT, { accion: 'revocar' })).status, 409)
  assert.equal((await responderRevocar(p, 'x', { accion: 'revocar' })).status, 400)
  assert.equal((await responderRevocar(p, AUT, { accion: 'aceptar' })).status, 400)
})

test('listar: sin titulares propios no pregunta por concedidos ni pendientes, pero sí por lo recibido', async () => {
  let preguntas = 0
  const { p } = puertos(
    {
      concedidos: async () => {
        preguntas++
        return []
      },
      pendientes: async () => {
        preguntas++
        return []
      },
      recibidos: async () => [{ id: AUT, alcance: 'patrimonio_total', titular: 'María Pérez', desde: AHORA }],
    },
    [],
  )
  const r = await responderListar(p)
  assert.equal(r.status, 200)
  assert.equal(preguntas, 0)
  assert.equal((r.body.recibidos as unknown[]).length, 1)
  assert.equal((r.body.niveles as unknown[]).length, 2)
})
