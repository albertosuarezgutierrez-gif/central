// Cepos de la regularización de RC (03/11/2026): aislamiento por token, un solo uso, nada sale sin ✅. `node --test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  hashTokenRegularizacion, leerRespuestaCifrada, regularizacionPorToken, responderRegularizacionConRepo, vistaPublica,
  type FilaRegularizacionToken, type RepoRegularizacionToken,
} from './regularizacion-rc-portal.ts'
import { PREFIJO_RRC, botonesRegularizacion, leerBotonRrc, textoAvisoRespuestaRegularizacion, textoPropuestaRegularizacion } from './regularizacion-rc-telegram.ts'

const TOKEN_A = 'A'.repeat(43)
const TOKEN_B = 'B'.repeat(43)
const futuro = () => new Date(Date.now() + 86_400_000)

function fila(id: string, poliza: string, extra: Partial<FilaRegularizacionToken> = {}): FilaRegularizacionToken {
  return {
    id, correduriaId: 'c0000000-0000-4000-8000-000000000001', polizaId: poliza, clienteId: `cli-${poliza}`, compania: 'OCCIDENT',
    periodoDesde: '2025-06', periodoHasta: '2026-06', estado: 'pendiente', caduca: futuro(), documentoId: null, ...extra,
  }
}

/** Repo en memoria que aplica LAS MISMAS condiciones que el SQL de `repoPrisma` (id + correduría + hash + pendiente viva). */
function repoMemoria(filas: Record<string, FilaRegularizacionToken>) {
  const respuestas = new Map<string, string>()
  const repo: RepoRegularizacionToken = {
    async porTokenHash(h) { return filas[h] ? { ...filas[h] } : null },
    async completar(x) {
      const f = filas[x.tokenHash]
      if (!f || f.id !== x.id || f.correduriaId !== x.correduriaId || f.estado !== 'pendiente' || !f.caduca || f.caduca <= new Date()) return 0
      f.estado = 'completada'
      respuestas.set(f.id, x.respuestaCifrada)
      return 1
    },
    async fijarDocumento() { return 0 },
  }
  return { repo, respuestas }
}

test('🚨 un token solo ve y completa SU póliza: el de A no toca B, y lo público no lleva ids ni nº', async () => {
  const A = fila('sol-a', 'poliza-A')
  const B = fila('sol-b', 'poliza-B')
  const { repo, respuestas } = repoMemoria({ [hashTokenRegularizacion(TOKEN_A)]: A, [hashTokenRegularizacion(TOKEN_B)]: B })

  const vista = await regularizacionPorToken(repo, TOKEN_A)
  assert.equal(vista?.estado, 'ok')
  const json = JSON.stringify(vista)
  for (const prohibido of ['poliza-A', 'poliza-B', 'cli-', 'sol-a', 'c0000000']) assert.ok(!json.includes(prohibido), `la vista pública no puede llevar «${prohibido}»`)
  assert.deepEqual(Object.keys(vista ?? {}).sort(), ['compania', 'documento', 'estado', 'motivo', 'periodo'])

  const r = await responderRegularizacionConRepo(repo, TOKEN_A, { facturacion: '125.000,00' }, (s) => `cifrado:${s}`)
  assert.equal(r.ok, true)
  assert.ok(r.ok && r.fila.polizaId === 'poliza-A')
  assert.ok(respuestas.has('sol-a'))
  assert.ok(!respuestas.has('sol-b'), 'el token de A NO completa la de B')
  assert.equal(B.estado, 'pendiente')
  assert.equal((await regularizacionPorToken(repo, TOKEN_B))?.estado, 'ok', 'B sigue viva y sin contestar')
})

test('🚨 de un solo uso: el segundo envío con el mismo token es «completada», no se pisa la cifra', async () => {
  const A = fila('sol-a', 'poliza-A')
  const { repo, respuestas } = repoMemoria({ [hashTokenRegularizacion(TOKEN_A)]: A })
  assert.equal((await responderRegularizacionConRepo(repo, TOKEN_A, { facturacion: '1.000' }, (s) => s)).ok, true)
  const otra = await responderRegularizacionConRepo(repo, TOKEN_A, { facturacion: '999.999' }, (s) => s)
  assert.deepEqual(otra, { ok: false, estado: 'completada' })
  assert.match(respuestas.get('sol-a') ?? '', /100000/)
  assert.deepEqual(await regularizacionPorToken(repo, TOKEN_A), { estado: 'completada', motivo: 'regularizacion_rc' })
})

test('caducada, borrador o token que no existe → «muerta»; token con forma rara → no es de regularización', async () => {
  const { repo } = repoMemoria({ [hashTokenRegularizacion(TOKEN_A)]: fila('a', 'p', { caduca: new Date(Date.now() - 1000) }) })
  assert.deepEqual(await regularizacionPorToken(repo, TOKEN_A), { estado: 'muerta' })
  assert.deepEqual((await responderRegularizacionConRepo(repo, TOKEN_A, { facturacion: '1' }, (s) => s)), { ok: false, estado: 'muerta' })
  assert.equal(await regularizacionPorToken(repo, TOKEN_B), null, 'sin fila = el puente prueba la de presupuesto')
  assert.equal(await regularizacionPorToken(repo, 'corto'), null)
  assert.deepEqual(vistaPublica(fila('x', 'p', { estado: 'enviando' })), { estado: 'muerta' })
  assert.deepEqual(vistaPublica(fila('x', 'p', { caduca: null })), { estado: 'muerta' })
})

test('errores de validación no completan nada', async () => {
  const A = fila('sol-a', 'poliza-A')
  const { repo } = repoMemoria({ [hashTokenRegularizacion(TOKEN_A)]: A })
  const r = await responderRegularizacionConRepo(repo, TOKEN_A, { facturacion: '' }, (s) => s)
  assert.equal(r.ok, false)
  assert.equal(A.estado, 'pendiente')
})

test('la respuesta cifrada ilegible es null (nunca un 0)', () => {
  assert.equal(leerRespuestaCifrada('x', () => { throw new Error('clave') }), null)
  assert.equal(leerRespuestaCifrada(null, (s) => s), null)
  assert.deepEqual(leerRespuestaCifrada('{"facturacionCent":0,"empleados":null,"masaSalarialCent":null}', (s) => s), { facturacionCent: 0, empleados: null, masaSalarialCent: null })
})

test('botones rrc: ≤64 bytes, con versión; leer valida acción, uuid y versión', () => {
  const id = '3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b'
  const b = botonesRegularizacion(id, 12).flat()
  assert.deepEqual(b.map((x) => x.texto), ['✅ Enviar', '✏️ Modificar', '❌ Descartar'])
  for (const x of b) assert.ok(Buffer.byteLength(x.callback) <= 64 && x.callback.startsWith(`${PREFIJO_RRC}_`))
  assert.deepEqual(leerBotonRrc('env', [id, '12']), { accion: 'env', id, version: 12 })
  assert.equal(leerBotonRrc('env', [id, '0']), null)
  assert.equal(leerBotonRrc('borrar', [id, '1']), null)
  assert.equal(leerBotonRrc('env', ['x', '1']), null)
})

test('Telegram: escapa el borrador, sin email ni DNI; la cifra en formato español', () => {
  const t = textoPropuestaRegularizacion({ quien: 'Ana <b>', compania: 'OCCIDENT', numeroPoliza: 'BIDS1', periodo: { desde: '2025-06', hasta: '2026-06' }, hayEmail: false, asunto: 'x', texto: 'Hola <x>' })
  assert.ok(!t.includes('<b>Ana <b>') && t.includes('&lt;x&gt;'))
  assert.match(t, /No tiene email/)
  const a = textoAvisoRespuestaRegularizacion({ quien: 'Ana', compania: 'OCCIDENT', numeroPoliza: null, periodo: { desde: '2025-06', hasta: '2026-06' }, respuesta: { facturacionCent: 12500050, empleados: null, masaSalarialCent: null }, conDocumento: false, urlFicha: null })
  assert.match(a, /125\.000,50€/)
  assert.match(a, /no lo ha indicado/)
})

// ─── Cepos sobre el FUENTE (lo que tsc no ve: el SQL y el orden de los pasos) ────────────────────
const fuente = readFileSync(new URL('./regularizacion-rc.ts', import.meta.url), 'utf8')
const rutaOperador = readFileSync(new URL('../app/api/operador/regularizacion-rc/route.ts', import.meta.url), 'utf8')
const puente = readFileSync(new URL('../app/api/portal/solicitud-datos/route.ts', import.meta.url), 'utf8')

test('🚨 el SQL del token completa por id + correduría + MISMO hash + pendiente viva (un solo uso)', () => {
  const completar = fuente.slice(fuente.indexOf('async completar('), fuente.indexOf('async fijarDocumento('))
  for (const c of ['id = ${x.id}::uuid', 'correduria_id = ${x.correduriaId}::uuid', 'token_hash = ${x.tokenHash}', "estado = 'pendiente'", 'caduca_at > now()']) {
    assert.ok(completar.includes(c), `falta «${c}» en el UPDATE de completar`)
  }
})

test('🚨 nada sale sin ✅: se reclama (borrador → enviando) ANTES de mandar; sin proveedor 503 ≠ fallo 502', () => {
  const decidir = fuente.slice(fuente.indexOf('export async function decidirRegularizacion'), fuente.indexOf('export async function editarRegularizacion'))
  const reclama = decidir.indexOf("set estado = 'enviando'")
  assert.ok(reclama > 0 && reclama < decidir.indexOf('enviarCorreoCliente('), 'la reclamación va antes del envío')
  assert.match(decidir, /estado = 'borrador' and version = \$\{d\.version\}/)
  assert.ok(!fuente.slice(fuente.indexOf('export async function crearRegularizacion'), fuente.indexOf('type FilaBorrador')).includes('enviarCorreoCliente'), 'crear NO envía nada')
  assert.match(rutaOperador, /canal_no_disponible: 503/)
  assert.match(rutaOperador, /envio_fallido: 502/)
})

test('el puente prueba primero la solicitud de presupuesto y solo con «muerta» la regularización', () => {
  const get = puente.slice(puente.indexOf('export async function GET'), puente.indexOf('async function POSTSin'))
  assert.ok(get.indexOf('solicitudPorToken(') < get.indexOf('regularizacionPublica('))
  assert.match(get, /r\.estado === 'muerta'/)
})
