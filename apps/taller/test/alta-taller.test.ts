/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/operador/talleres: sin secreto 401, alta OK (taller + config de alta + dueño con PIN temporal que se enseña UNA vez), NIF duplicado 409.
// Cepo visto fallar el 04/11/2026: en crearManejadorAlta quitar el `if (!deps.autorizado(req))`: rojo en '401'. Restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verificarPin } from '@central/core-identity/pin'
import { configDeAlta } from '@central/module-taller'
import { altaTaller, crearManejadorAlta, crearManejadorVinculoRrhh } from '../lib/alta-taller.ts'
import { normalizarCodigoTaller } from '../lib/codigo-taller.ts'
import { leerConfig } from '../lib/config-repo.ts'
import { crearConTaller } from '../lib/rls.ts'
import { crearBdFake } from './_fake-prisma.ts'

const UUID_FIJO = 'a1b2c3d4-0000-4000-8000-00000000abcd'
function montar() {
  const bd = crearBdFake()
  const conTaller = crearConTaller(bd.cliente) as any
  const crearTaller = async (d: { razonSocial: string; nombreComercial: string; nif: string | null }) => {
    const ya = d.nif ? bd.filas('taller').find((t) => t.nif === d.nif) : null
    if (ya) return { id: ya.id as string, creado: false }
    const n = bd.filas('taller').length + 1
    const t = bd.sembrar('taller', { id: UUID_FIJO.replace('abcd', String(1000 + n)), razonSocial: d.razonSocial, nombreComercial: d.nombreComercial, nif: d.nif })
    return { id: t.id as string, creado: true }
  }
  const vinculos: Array<[string, string | null]> = []
  const fijarRrhhEmpresa = async (id: string, empresa: string | null) => {
    const t = bd.filas('taller').find((x) => x.id === id)
    if (!t) return false
    vinculos.push([id, empresa])
    return true
  }
  return { bd, conTaller, crearTaller, fijarRrhhEmpresa, vinculos }
}
const req = (cuerpo: unknown, auth = true) =>
  new Request('http://x/api/operador/talleres', { method: 'POST', headers: auth ? { authorization: 'Bearer s3creto' } : {}, body: JSON.stringify(cuerpo) })
const manejador = (m: ReturnType<typeof montar>, autorizado = (r: Request) => r.headers.get('authorization') === 'Bearer s3creto') =>
  crearManejadorAlta({ autorizado, alta: (e) => altaTaller({ crearTaller: m.crearTaller, conTaller: m.conTaller, fijarRrhhEmpresa: m.fijarRrhhEmpresa }, e) })
const cuerpo = { razonSocial: 'Talleres Nuevos SL', nif: 'B12345678', duenoNombre: 'Pepe Dueño' }

test('sin secreto (o con uno incorrecto) → 401 y no se crea nada', async () => {
  const m = montar()
  const h = manejador(m)
  assert.equal((await h(req(cuerpo, false))).status, 401)
  assert.equal((await h(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer otro' }, body: '{}' }))).status, 401)
  assert.equal(m.bd.filas('taller').length, 0)
})

test('alta OK: taller + configuración de alta + dueño con PIN temporal (una vez; en BD solo el hash; obliga a cambiarlo)', async () => {
  const m = montar()
  const r = await manejador(m)(req(cuerpo))
  assert.equal(r.status, 201)
  assert.equal(r.headers.get('cache-control'), 'no-store')
  const j: any = await r.json()
  assert.match(j.pinTemporal, /^\d{4}$/)
  assert.equal(j.debeCambiarPin, true)
  const t = m.bd.filas('taller')[0]
  assert.equal(j.tallerId, t.id)
  assert.equal(t.nif, 'B12345678')
  assert.equal(t.nombreComercial, 'Talleres Nuevos SL')
  // configuración ≡ configDeAlta()
  const cfg = await m.conTaller(t.id, (tx: any) => leerConfig(tx, t.id))
  const alta = configDeAlta()
  assert.equal(cfg!.precioHoraCent, alta.precioHoraCent)
  assert.deepEqual(cfg!.ivas.map((i: { codigo: string }) => i.codigo).sort(), alta.ivas.map((i) => i.codigo).sort())
  assert.deepEqual(cfg!.seguridadLogin, alta.seguridadLogin)
  // dueño: hash, no PIN; debe cambiarlo
  const u = m.bd.filas('usuarioTaller')
  assert.equal(u.length, 1)
  assert.equal(u[0].rol, 'dueno')
  assert.equal(u[0].debeCambiarPin, true)
  assert.notEqual(u[0].pinHash, j.pinTemporal)
  assert.ok(await verificarPin(j.pinTemporal, u[0].pinHash))
  assert.ok(!JSON.stringify(m.bd.filas('auditoria')).includes(j.pinTemporal), 'el PIN no va a la auditoría')
})

test('NIF duplicado → 409 con el id existente, sin segundo taller, sin segundo dueño ni PIN nuevo', async () => {
  const m = montar()
  const h = manejador(m)
  const primero: any = await (await h(req(cuerpo))).json()
  const r = await h(req({ ...cuerpo, razonSocial: 'Otra SL', nif: 'b-12345678' }))
  assert.equal(r.status, 409)
  const j: any = await r.json()
  assert.equal(j.tallerId, primero.tallerId)
  assert.ok(!('pinTemporal' in j))
  assert.equal(m.bd.filas('taller').length, 1)
  assert.equal(m.bd.filas('usuarioTaller').length, 1)
})

test('datos inválidos → 400; el NIF es OBLIGATORIO y validado (sin él no hay idempotencia: dos altas = dos talleres)', async () => {
  const m = montar()
  const h = manejador(m)
  assert.equal((await h(req({ razonSocial: '', duenoNombre: 'x', nif: 'B12345678' }))).status, 400)
  assert.equal((await h(req({ razonSocial: 'A', duenoNombre: 'x', nif: '12' }))).status, 400)
  assert.equal((await h(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer s3creto' }, body: 'no-json' }))).status, 400)
  assert.equal((await h(req({ razonSocial: 'A SL', duenoNombre: 'x' }))).status, 400, 'sin NIF → 400')
  assert.equal((await h(req({ razonSocial: 'A SL', duenoNombre: 'x', nif: '   ' }))).status, 400, 'NIF en blanco → 400')
  assert.equal(m.bd.filas('taller').length, 0, 'ningún 400 crea nada')
  assert.equal((await h(req({ razonSocial: 'A SL', duenoNombre: 'x', nif: 'B87654321' }))).status, 201)
})

test('el alta genera el CÓDIGO del taller (único, bien formado) y lo devuelve al operador, también en el 409', async () => {
  const m = montar()
  const h = manejador(m)
  const j: any = await (await h(req(cuerpo))).json()
  assert.ok(normalizarCodigoTaller(j.codigoTaller), 'código con forma válida')
  assert.equal(j.codigoTaller.length, 8)
  assert.equal(m.bd.filas('taller')[0].codigoAcceso, j.codigoTaller, 'queda en el taller')
  const dup = await h(req(cuerpo))
  assert.equal(dup.status, 409)
  assert.equal(((await dup.json()) as any).codigoTaller, j.codigoTaller, 'si se perdió la 1.ª respuesta, el operador recupera el código (el PIN no)')
  const otro: any = await (await h(req({ ...cuerpo, nif: 'B87654321' }))).json()
  assert.notEqual(otro.codigoTaller, j.codigoTaller)
})

test('rrhh: el operador fija la empresa en el alta (solo si es nueva) y por PATCH; uuid inválido → 400; taller inexistente → 404; sin secreto → 401', async () => {
  const E = '33333333-3333-4333-8333-333333333333'
  const m = montar()
  const h = manejador(m)
  assert.equal((await h(req({ ...cuerpo, rrhhEmpresaId: 'no-uuid' }))).status, 400)
  assert.equal(m.bd.filas('taller').length, 0)
  const j: any = await (await h(req({ ...cuerpo, rrhhEmpresaId: E.toUpperCase() }))).json()
  assert.deepEqual(m.vinculos, [[j.tallerId, E]])
  // Repetir el alta (409) NO cambia el vínculo.
  await h(req({ ...cuerpo, rrhhEmpresaId: '44444444-4444-4444-8444-444444444444' }))
  assert.equal(m.vinculos.length, 1)
  const patch = crearManejadorVinculoRrhh({ autorizado: (r) => r.headers.get('authorization') === 'Bearer s3creto', fijar: m.fijarRrhhEmpresa })
  const rq = (c: unknown, auth = true) => new Request('http://x', { method: 'PATCH', headers: auth ? { authorization: 'Bearer s3creto' } : {}, body: JSON.stringify(c) })
  assert.equal((await patch(rq({ tallerId: j.tallerId, rrhhEmpresaId: E }, false))).status, 401)
  assert.equal((await patch(rq({ tallerId: j.tallerId, rrhhEmpresaId: 'x' }))).status, 400)
  assert.equal((await patch(rq({ tallerId: '00000000-0000-4000-8000-0000000000ff', rrhhEmpresaId: E }))).status, 404)
  assert.equal((await patch(rq({ tallerId: j.tallerId, rrhhEmpresaId: null }))).status, 200)
  assert.deepEqual(m.vinculos.at(-1), [j.tallerId, null])
})

test('la ruta usa TALLER_OPERADOR_SECRET con autorizacionBearerValida y es pública para el middleware (sin PIN)', () => {
  const lee = (...r: string[]) => readFileSync(join(import.meta.dirname, '..', ...r), 'utf8')
  assert.match(lee('app', 'api', 'operador', 'talleres', 'route.ts'), /autorizacionBearerValida\(req, 'TALLER_OPERADOR_SECRET'\)/)
  assert.match(lee('middleware.ts'), /'\/api\/operador\/'/)
})

test('alta con dirección completa la guarda; a medias → 400 y no se crea nada; sin ella queda vacía', async () => {
  const m = montar()
  const h = manejador(m)
  const dir = { cp: '41900', provincia: 'Sevilla', municipio: 'Camas', via: 'Calle Real', numero: '5' }
  assert.equal((await h(req({ ...cuerpo, direccion: dir }))).status, 201)
  const t = m.bd.filas('taller')[0]
  assert.equal(t.cp, '41900'); assert.equal(t.municipio, 'Camas'); assert.equal(t.numero, '5')
  const m2 = montar()
  const r = await manejador(m2)(req({ ...cuerpo, direccion: { cp: '41900', via: 'Calle Real' } }))
  assert.equal(r.status, 400)
  assert.equal(m2.bd.filas('taller').length, 0)
  const m3 = montar()
  assert.equal((await manejador(m3)(req(cuerpo))).status, 201)
  assert.equal(m3.bd.filas('taller')[0].cp, undefined)
})
