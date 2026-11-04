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

// ── Taller que YA existe sin dueño (piloto G2: sembrado por 0002 con configuración y código, 0 usuarios y NIF NULL) ──
// Cepos vistos fallar el 04/11/2026 (uno por brazo, restaurados → verde): sin el candado → rojo «a la vez»; 409 viejo (sin mirar dueños)
// → rojo «0 dueños»; sin el 404 → rojo «inexistente»; sin el chequeo de NIF distinto → rojo «OTRO NIF»; sin fijar NIF → rojo «NIF NULL»;
// sin mapear P2002 → rojo «ux_talleres_nif»; sin el 409 de taller a medias con dueño → rojo «a medias».
const G2 = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
async function sembrarG2(m: ReturnType<typeof montar>, nif: string | null = null) {
  m.bd.sembrar('taller', { id: G2, razonSocial: 'Talleres de Automoción G2', nombreComercial: 'G2', ...(nif ? { nif } : {}), codigoAcceso: 'G2CODIGO' })
  // Configuración completa como la deja el alta (mismo camino que un alta normal, con RLS).
  const alta = configDeAlta()
  const { escalaresDeConfig, guardarConfig } = await import('../lib/config-repo.ts')
  await m.conTaller(G2, async (tx: any) => {
    await tx.configuracion.create({ data: { tallerId: G2, ...escalaresDeConfig(alta) } })
    await guardarConfig(tx, G2, alta)
  })
}

test('taller existente con configuración y 0 dueños activos → se crea el dueño con PIN temporal (201), sin segundo taller', async () => {
  const m = montar()
  await sembrarG2(m, 'B12345678')
  const r = await manejador(m)(req(cuerpo))
  assert.equal(r.status, 201)
  const j: any = await r.json()
  assert.equal(j.tallerId, G2)
  assert.equal(j.codigoTaller, 'G2CODIGO', 'se conserva el código que ya tenía')
  assert.match(j.pinTemporal, /^\d{4}$/)
  assert.equal(m.bd.filas('taller').length, 1, 'no se crea otro taller')
  const u = m.bd.filas('usuarioTaller')
  assert.equal(u.length, 1); assert.equal(u[0].rol, 'dueno'); assert.equal(u[0].debeCambiarPin, true)
  assert.equal(m.bd.filas('configuracion').length, 1, 'no se duplica la configuración')
  assert.ok(m.bd.filas('auditoria').some((a) => a.accion === 'alta_operador'), 'auditado')
  assert.ok(!JSON.stringify(m.bd.filas('auditoria')).includes(j.pinTemporal), 'el PIN no va a la auditoría')
  // Un dueño DADO DE BAJA no cuenta como dueño: se puede volver a dar uno.
  const m2 = montar()
  await sembrarG2(m2, 'B12345678')
  m2.bd.sembrar('usuarioTaller', { tallerId: G2, nombre: 'Antiguo', rol: 'dueno', pinHash: 'x', activo: false })
  assert.equal((await manejador(m2)(req(cuerpo))).status, 201)
})

test('taller existente con dueño activo → 409 con el código, sin PIN nuevo ni segundo dueño (también por tallerId)', async () => {
  const m = montar()
  await sembrarG2(m, 'B12345678')
  const h = manejador(m)
  assert.equal((await h(req(cuerpo))).status, 201)
  for (const c of [cuerpo, { ...cuerpo, tallerId: G2 }]) {
    const r = await h(req(c))
    assert.equal(r.status, 409)
    const j: any = await r.json()
    assert.ok(!('pinTemporal' in j))
    assert.equal(j.codigoTaller, 'G2CODIGO')
  }
  assert.equal(m.bd.filas('usuarioTaller').length, 1)
})

test('tallerId inexistente → 404 y no se crea nada (ni se llama a alta_taller)', async () => {
  const m = montar()
  let llamadas = 0
  const crearTaller = async (d: any) => { llamadas++; return m.crearTaller(d) }
  const h = crearManejadorAlta({ autorizado: () => true, alta: (e) => altaTaller({ crearTaller, conTaller: m.conTaller }, e) })
  const r = await h(req({ ...cuerpo, tallerId: '00000000-0000-4000-8000-0000000000ff' }))
  assert.equal(r.status, 404)
  assert.equal(llamadas, 0)
  assert.equal(m.bd.filas('taller').length, 0)
  assert.equal(m.bd.filas('usuarioTaller').length, 0)
  assert.equal((await h(req({ ...cuerpo, tallerId: 'no-uuid' }))).status, 400)
})

test('tallerId con OTRO NIF → 409, no se pisa el NIF ni se crea dueño', async () => {
  const m = montar()
  await sembrarG2(m, 'B99999999')
  const r = await manejador(m)(req({ ...cuerpo, tallerId: G2 }))
  assert.equal(r.status, 409)
  assert.ok(!('pinTemporal' in ((await r.json()) as any)))
  assert.equal(m.bd.filas('taller')[0].nif, 'B99999999')
  assert.equal(m.bd.filas('usuarioTaller').length, 0)
})

test('tallerId con NIF NULL → se fija el NIF de la entrada y se crea el dueño; sin tallerId ese caso crearía un 2.º taller', async () => {
  const m = montar()
  await sembrarG2(m, null)
  const r = await manejador(m)(req({ ...cuerpo, nif: 'b-12345678', tallerId: G2.toUpperCase(), rrhhEmpresaId: '33333333-3333-4333-8333-333333333333' }))
  assert.equal(r.status, 201)
  const j: any = await r.json()
  assert.equal(j.tallerId, G2)
  assert.equal(m.bd.filas('taller').length, 1)
  assert.equal(m.bd.filas('taller')[0].nif, 'B12345678')
  assert.equal(m.bd.filas('taller')[0].razonSocial, 'Talleres de Automoción G2', 'la razón social no se pisa')
  assert.deepEqual(m.vinculos, [], 'rrhhEmpresaId solo en alta NUEVA')
  assert.equal(m.bd.filas('usuarioTaller').length, 1)
})

test('tallerId con NIF NULL pero ese NIF ya es de OTRO taller (ux_talleres_nif) → 409 y no se crea nada', async () => {
  const m = montar()
  await sembrarG2(m, null)
  m.bd.sembrar('taller', { id: '11111111-1111-4111-8111-111111111111', razonSocial: 'Otro', nombreComercial: 'Otro', nif: 'B12345678' })
  // El fake no tiene índices únicos: se emula el choque de Postgres/Prisma al fijar el NIF.
  const conTaller = (id: unknown, fn: (tx: any) => Promise<any>, o?: any) => m.conTaller(id, (tx: any) => fn(new Proxy(tx, {
    get(t, k) {
      if (k !== 'taller') return t[k]
      const d = t.taller
      return { ...d, update: async (a: any) => {
        if (a.data?.nif && m.bd.filas('taller').some((x) => x.nif === a.data.nif && x.id !== a.where.id))
          throw Object.assign(new Error('Unique constraint failed on the fields: (`nif`)'), { code: 'P2002', meta: { target: ['nif'] } })
        return d.update(a)
      } }
    },
  })), o)
  const h = crearManejadorAlta({ autorizado: () => true, alta: (e) => altaTaller({ crearTaller: m.crearTaller, conTaller: conTaller as any }, e) })
  const r = await h(req({ ...cuerpo, tallerId: G2 }))
  assert.equal(r.status, 409)
  assert.equal(m.bd.filas('taller').find((x) => x.id === G2)!.nif, undefined)
  assert.equal(m.bd.filas('usuarioTaller').length, 0)
})

test('dos altas A LA VEZ del mismo taller sin dueño → un solo dueño y un solo PIN (candado por taller)', async () => {
  const m = montar()
  await sembrarG2(m, 'B12345678')
  const h = manejador(m)
  const rs = await Promise.all([h(req(cuerpo)), h(req({ ...cuerpo, tallerId: G2 }))])
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409])
  assert.equal(m.bd.filas('usuarioTaller').length, 1)
})

test('taller a medias (sin configuración) pero CON dueño activo → se completa la configuración, 409 sin PIN ni segundo dueño', async () => {
  const m = montar()
  m.bd.sembrar('taller', { id: G2, razonSocial: 'G2', nombreComercial: 'G2', nif: 'B12345678', codigoAcceso: 'G2CODIGO' })
  m.bd.sembrar('usuarioTaller', { tallerId: G2, nombre: 'Dueño', rol: 'dueno', pinHash: 'x' })
  const r = await manejador(m)(req(cuerpo))
  assert.equal(r.status, 409)
  assert.ok(!('pinTemporal' in ((await r.json()) as any)))
  assert.equal(m.bd.filas('configuracion').length, 1)
  assert.equal(m.bd.filas('usuarioTaller').length, 1)
})
