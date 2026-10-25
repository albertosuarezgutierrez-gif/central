// Ofertas que pulsa el cliente (25/10/2026): aislamiento, nivel, estado recalculado y lista cerrada, con puertos falsos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { responderHipoteca, responderOferta, type PuertosOfertas } from './ofertas-api.ts'
import {
  DIAS_VENTANA_COMPARAR,
  TIPOS_OFERTA,
  itemsCompararPendientes,
  textoCompararExterna,
  tituloProtegeRenta,
  type DeclaradaParaOferta,
} from './ofertas.ts'
import type { PeticionPuentePedirPrecio, ResultadoPuentePedirPrecio } from './pedir-precio-puente.ts'
import { pendientesDeTi } from '../pendiente-de-ti.ts'

const INM = '11111111-1111-4111-8111-111111111111'
const AJENO = '22222222-2222-4222-8222-222222222222'
const CON = '33333333-3333-4333-8333-333333333333'
const DEC = '44444444-4444-4444-8444-444444444444'

function puertos(o: {
  nivel?: 'gestion' | 'total'
  hipoteca?: 'si' | 'no' | 'no_se' | null
  terminadoEn?: string | null
  contrato?: boolean
  declarada?: { vigente: boolean } | null
  puente?: ResultadoPuentePedirPrecio
} = {}) {
  const puente: Omit<PeticionPuentePedirPrecio, 'identidadId'>[] = []
  const guardado: unknown[] = []
  const p: PuertosOfertas = {
    inmueble: async (id) => (id === INM ? { id: INM, nivel: o.nivel ?? 'total', hipoteca: o.hipoteca ?? null } : null),
    contrato: async (inm, id) => (inm === INM && id === CON && o.contrato !== false ? { id: CON, terminadoEn: o.terminadoEn ?? null } : null),
    declarada: async (id) => (id === DEC && o.declarada !== null ? { id: DEC, vigente: o.declarada?.vigente ?? true } : null),
    hoy: () => '2026-10-25',
    pedirPorPuente: async (x) => {
      puente.push(x)
      return o.puente ?? { estado: 'ok', pedidoEl: '2026-10-25', yaExistia: false }
    },
    guardarHipoteca: async (id, v) => {
      guardado.push([id, v])
    },
  }
  return { p, puente, guardado }
}

const NO_ENC = { status: 404, body: { error: 'no_encontrado' } }

test('🚨 lista cerrada: un tipo que no es oferta (ni los de «Pedir precio» del inmueble) se rechaza sin llamar al puente', async () => {
  assert.deepEqual([...TIPOS_OFERTA], ['comparar_externa', 'impago_alquiler', 'hipoteca'])
  const { p, puente } = puertos()
  for (const tipo of ['inmueble_sin_seguro', 'seguro_no_vigente', 'vida', undefined, 7]) {
    const r = await responderOferta(p, { tipo, inmuebleId: INM })
    assert.equal(r.status, 400, String(tipo))
    assert.deepEqual(r.body, { error: 'datos_invalidos', campo: 'tipo' })
  }
  assert.equal((await responderOferta(p, null)).status, 400)
  assert.equal(puente.length, 0)
})

test('comparar_externa: solo SUS declaradas; ajena o inexistente = 404; no vigente = 409; sin vencimiento SÍ (botón manual)', async () => {
  const a = puertos()
  assert.deepEqual(await responderOferta(a.p, { tipo: 'comparar_externa', polizaDeclaradaId: DEC, inmuebleId: INM }), {
    status: 201, body: { ok: true, yaExistia: false, pedidoEl: '2026-10-25' },
  })
  assert.deepEqual(a.puente, [{ tipo: 'comparar_externa', polizaDeclaradaId: DEC }], 'solo la póliza: nunca inmueble ni titular')
  assert.deepEqual(await responderOferta(a.p, { tipo: 'comparar_externa', polizaDeclaradaId: AJENO }), NO_ENC)
  assert.deepEqual(await responderOferta(a.p, { tipo: 'comparar_externa', polizaDeclaradaId: 'x' }), { status: 400, body: { error: 'datos_invalidos', campo: 'polizaDeclaradaId' } })
  const b = puertos({ declarada: { vigente: false } })
  assert.deepEqual(await responderOferta(b.p, { tipo: 'comparar_externa', polizaDeclaradaId: DEC }), { status: 409, body: { error: 'no_aplica' } })
  assert.equal(b.puente.length, 0)
  assert.deepEqual(await responderOferta(puertos({ declarada: null }).p, { tipo: 'comparar_externa', polizaDeclaradaId: DEC }), NO_ENC)
})

test('impago_alquiler: inmueble ajeno o nivel no Total = misma 404; contrato de otro inmueble = 404; terminado = 409; vivo = puente', async () => {
  const a = puertos()
  assert.equal((await responderOferta(a.p, { tipo: 'impago_alquiler', inmuebleId: INM, contratoId: CON })).status, 201)
  assert.deepEqual(a.puente, [{ tipo: 'impago_alquiler', inmuebleId: INM, contratoId: CON }])
  assert.deepEqual(await responderOferta(a.p, { tipo: 'impago_alquiler', inmuebleId: AJENO, contratoId: CON }), NO_ENC)
  assert.deepEqual(await responderOferta(puertos({ nivel: 'gestion' }).p, { tipo: 'impago_alquiler', inmuebleId: INM, contratoId: CON }), NO_ENC)
  assert.deepEqual(await responderOferta(puertos({ contrato: false }).p, { tipo: 'impago_alquiler', inmuebleId: INM, contratoId: CON }), NO_ENC)
  assert.deepEqual(await responderOferta(a.p, { tipo: 'impago_alquiler', inmuebleId: INM }), { status: 400, body: { error: 'datos_invalidos', campo: 'contratoId' } })
  const t = puertos({ terminadoEn: '2026-10-24' })
  assert.deepEqual(await responderOferta(t.p, { tipo: 'impago_alquiler', inmuebleId: INM, contratoId: CON }), { status: 409, body: { error: 'no_aplica' } })
  assert.equal(t.puente.length, 0)
  const futuro = puertos({ terminadoEn: '2026-12-31' })
  assert.equal((await responderOferta(futuro.p, { tipo: 'impago_alquiler', inmuebleId: INM, contratoId: CON })).status, 201)
})

test('hipoteca: solo con «sí» declarado; no / no sé / sin contestar = 409 sin puente; nivel no Total = 404', async () => {
  const si = puertos({ hipoteca: 'si' })
  assert.equal((await responderOferta(si.p, { tipo: 'hipoteca', inmuebleId: INM })).status, 201)
  assert.deepEqual(si.puente, [{ tipo: 'hipoteca', inmuebleId: INM }])
  for (const h of ['no', 'no_se', null] as const) {
    const x = puertos({ hipoteca: h })
    assert.deepEqual(await responderOferta(x.p, { tipo: 'hipoteca', inmuebleId: INM }), { status: 409, body: { error: 'no_aplica' } }, String(h))
    assert.equal(x.puente.length, 0)
  }
  assert.deepEqual(await responderOferta(puertos({ hipoteca: 'si', nivel: 'gestion' }).p, { tipo: 'hipoteca', inmuebleId: INM }), NO_ENC)
})

test('desenlaces del puente: ya pedido 200, sin puente 503, fallo 502; nunca «ok» ante un fallo', async () => {
  const cuerpo = { tipo: 'hipoteca', inmuebleId: INM }
  const casos: [ResultadoPuentePedirPrecio, number][] = [
    [{ estado: 'ok', pedidoEl: '2026-10-20', yaExistia: true }, 200],
    [{ estado: 'no_encontrado' }, 404],
    [{ estado: 'no_aplica' }, 409],
    [{ estado: 'sin_puente' }, 503],
    [{ estado: 'error', causa: 'red' }, 502],
  ]
  for (const [puente, status] of casos) {
    const r = await responderOferta(puertos({ hipoteca: 'si', puente }).p, cuerpo)
    assert.equal(r.status, status, puente.estado)
    if (status !== 200) assert.notEqual((r.body as { ok?: boolean }).ok, true)
  }
})

test('«¿tiene hipoteca?»: declaración de nivel Total, lista cerrada, ajeno = 404 y no pide nada al puente', async () => {
  const a = puertos()
  assert.deepEqual(await responderHipoteca(a.p, INM, { valor: 'si' }), { status: 200, body: { ok: true } })
  assert.deepEqual(a.guardado, [[INM, 'si']])
  assert.equal(a.puente.length, 0, 'declarar no abre ninguna petición')
  assert.deepEqual(await responderHipoteca(a.p, INM, { valor: 'quizá' }), { status: 400, body: { error: 'datos_invalidos', campo: 'valor' } })
  assert.deepEqual(await responderHipoteca(a.p, AJENO, { valor: 'si' }), NO_ENC)
  assert.deepEqual(await responderHipoteca(a.p, 'no-uuid', { valor: 'si' }), NO_ENC)
  assert.deepEqual(await responderHipoteca(puertos({ nivel: 'gestion' }).p, INM, { valor: 'si' }), NO_ENC)
  assert.equal(a.guardado.length, 1)
})

const dec = (x: Partial<DeclaradaParaOferta> & { id: string }): DeclaradaParaOferta => ({ vence: null, vigente: true, etiqueta: 'de hogar', ...x })

test('«Pendiente de ti»: solo declaradas vigentes que vencen en ≤ 60 días; sin fecha, pasadas o no vigentes NO avisan', () => {
  const hoy = '2026-10-25'
  const items = itemsCompararPendientes(
    [
      dec({ id: 'a', vence: '2026-12-24' }), // 60 días: entra
      dec({ id: 'b', vence: '2026-12-25' }), // 61: no
      dec({ id: 'c', vence: '2026-10-25' }), // hoy: entra
      dec({ id: 'd', vence: '2026-10-24' }), // pasada: no
      dec({ id: 'e', vence: null }), // sin vencimiento: no se avisa por fecha
      dec({ id: 'f', vence: '2026-11-01', vigente: false }), // marcada no vigente
      dec({ id: 'g', vence: '2026-11-10' }),
    ],
    hoy,
  )
  assert.equal(DIAS_VENTANA_COMPARAR, 60)
  assert.deepEqual(items.map((i) => i.id), ['c', 'g', 'a'], 'la más cercana primero')
  assert.equal(items[0]!.titulo, 'Tu póliza de hogar vence el 25/10')
  assert.equal(items[0]!.href, '/boveda/anadida/c')
  assert.deepEqual(itemsCompararPendientes([], hoy), [])
})

test('«Pendiente de ti» las pinta sin urgencia y la lista sigue sin ellas si no hay ninguna', () => {
  const base = { recibosDevueltos: [], anulaciones: 0, presupuestos: [], contactoPorConfirmar: false }
  const con = pendientesDeTi({ ...base, declaradasPorVencer: itemsCompararPendientes([dec({ id: 'a', vence: '2026-11-10' })], '2026-10-25') }, (r) => r)
  assert.equal(con.items.length, 1)
  assert.equal(con.items[0]!.clave, 'comparar:a')
  assert.equal(con.items[0]!.urgente, false)
  assert.equal(pendientesDeTi(base, (r) => r).items.length, 0)
})

test('textos: «Vence el dd/mm. ¿Te la comparamos?» con fecha; sin fecha no inventa; renta con cifra o sin ella', () => {
  assert.equal(textoCompararExterna('2026-12-03'), 'Vence el 03/12. ¿Te la comparamos?')
  assert.equal(textoCompararExterna(null), '¿Quieres que te la comparemos?')
  assert.equal(tituloProtegeRenta('850,00€'), 'Protege la renta (850,00€/mes)')
  assert.equal(tituloProtegeRenta(null), 'Protege la renta')
})

test('🚨 cableado: el servidor no lee clienteId/titular del cuerpo, la BD busca dentro de lo autorizado y las ofertas no envían nada', () => {
  const quita = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const api = quita(readFileSync(new URL('./ofertas-api.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(api, /clienteId|titular/i)
  const bd = quita(readFileSync(new URL('./ofertas-bd.ts', import.meta.url), 'utf8'))
  assert.match(bd, /clienteId: \{ in: \[\.\.\.acc\.keys\(\)\] \}/)
  assert.match(bd, /identidadId, \.\.\.DECLARADA_NO_ELIMINADA/)
  assert.match(bd, /inmuebleId, archivadoEn: null/)
  const ruta = quita(readFileSync(new URL('../../app/api/patrimonio/ofertas/route.ts', import.meta.url), 'utf8'))
  assert.match(ruta, /requireIdentidad\(\)/)
  assert.doesNotMatch(ruta, /sendMail|enviarCorreo|core-email|whatsapp/i)
  const puente = quita(readFileSync(new URL('./pedir-precio-puente.ts', import.meta.url), 'utf8'))
  for (const t of TIPOS_OFERTA) assert.ok(puente.includes(`'${t}'`), `el puente conoce ${t}`)
})
