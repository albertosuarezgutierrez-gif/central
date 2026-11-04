// Runner: `node --test --experimental-strip-types lib/adapters/alta-taller-rrhh.test.ts`
// Alta de taller (puerto TALLER_*) y «vincular responsable existente» de rrhh, con fetch FALSO.
// Cepos vistos fallar el 04/11/2026: (1) en alta.ts cambiar `=== true` por `!!` → rojo en 'solo el booleano true';
// (2) en taller.ts quitar el `if (!res.ok) throw` → rojo en 'taller rechaza'. Restaurados → verde.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tallerAdapter, cuerpoAltaTaller } from './taller.ts'
import { rrhhAdapter } from './rrhh.ts'
import { nuevoClienteDesdeBody, respuestaAlta } from './alta.ts'

const real = globalThis.fetch
let llamadas: { url: string; init: any }[] = []
const falso = (res: () => Response | Promise<Response>) => { globalThis.fetch = (async (url: any, init: any) => { llamadas.push({ url: String(url), init }); return res() }) as any }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  llamadas = []
  process.env.TALLER_URL = 'https://taller.test/'; process.env.TALLER_OPERADOR_SECRET = 'sec-taller'
  process.env.RRHH_URL = 'https://rrhh.test'; process.env.RRHH_OPERADOR_SECRET = 'sec-rrhh'
})
afterEach(() => { globalThis.fetch = real; delete process.env.TALLER_URL; delete process.env.TALLER_OPERADOR_SECRET; delete process.env.RRHH_URL; delete process.env.RRHH_OPERADOR_SECRET })

test('taller: alta OK → POST al puerto con Bearer propio, cuerpo mínimo y PIN temporal devuelto', async () => {
  falso(() => json({ tallerId: 't1', usuarioId: 'u1', pinTemporal: '4826', codigoTaller: 'ABCD2345', debeCambiarPin: true }, 201))
  const r = await tallerAdapter.crear!({ nombre: ' Talleres G2 SL ', nif: 'B12345678', responsableNombre: 'Pilar', direccion: { cp: '41900', provincia: 'Sevilla', municipio: 'Camas', via: 'Calle Real', numero: '5', } })
  assert.deepEqual(r, { id: 't1', pinTemporal: '4826', codigoTaller: 'ABCD2345' })
  assert.equal(llamadas[0].url, 'https://taller.test/api/operador/talleres')
  assert.equal(llamadas[0].init.headers.Authorization, 'Bearer sec-taller')
  assert.deepEqual(JSON.parse(llamadas[0].init.body), {
    razonSocial: 'Talleres G2 SL', nif: 'B12345678', duenoNombre: 'Pilar',
    direccion: { cp: '41900', provincia: 'Sevilla', municipio: 'Camas', via: 'Calle Real', numero: '5' },
  })
})

test('taller: sin NIF ni dirección no se mandan campos vacíos', () => {
  assert.deepEqual(cuerpoAltaTaller({ nombre: 'A', responsableNombre: 'B', nif: '  ', direccion: { cp: '', via: ' ' } }), { razonSocial: 'A', duenoNombre: 'B' })
})

test('taller rechaza (409 NIF, 401…): el error llega al operador tal cual y no hay PIN', async () => {
  falso(() => json({ error: 'Ya existe un taller con ese NIF', tallerId: 't0' }, 409))
  await assert.rejects(tallerAdapter.crear!({ nombre: 'A', responsableNombre: 'B', nif: 'B12345678' }), /Ya existe un taller con ese NIF/)
  falso(() => json({ error: 'No autorizado' }, 401))
  await assert.rejects(tallerAdapter.crear!({ nombre: 'A', responsableNombre: 'B', nif: 'B12345678' }), /No autorizado/)
})

test('taller: el NIF es OBLIGATORIO (hallazgo 4 de la revisión): sin él (o en blanco) no se llama al puerto', async () => {
  falso(() => json({ tallerId: 't1', pinTemporal: '4826', codigoTaller: 'ABCD2345' }, 201))
  for (const nif of [undefined, '', '   ']) await assert.rejects(tallerAdapter.crear!({ nombre: 'A', responsableNombre: 'B', nif }), /NIF obligatorio/)
  assert.equal(llamadas.length, 0)
  const form = readFileSync(new URL('../../app/(usuario)/operador/clientes/ClientesClient.tsx', import.meta.url), 'utf8')
  assert.match(form, /label="NIF de la sociedad"><input[^\n]*\brequired\b/, 'el formulario también lo exige')
})

test('taller: la respuesta sin código del taller se rechaza (sin código el dueño no podría entrar)', async () => {
  falso(() => json({ tallerId: 't1', pinTemporal: '4826' }, 201))
  await assert.rejects(tallerAdapter.crear!({ nombre: 'A', responsableNombre: 'B', nif: 'B12345678' }), /código del taller/)
})

test('taller: sin envs no llama; red caída avisa de que no se sabe si se creó; faltan datos → error', async () => {
  falso(() => json({}, 201))
  delete process.env.TALLER_OPERADOR_SECRET
  await assert.rejects(tallerAdapter.crear!({ nombre: 'A', responsableNombre: 'B', nif: 'B12345678' }), /TALLER_URL \+ TALLER_OPERADOR_SECRET/)
  assert.equal(llamadas.length, 0)
  process.env.TALLER_OPERADOR_SECRET = 'x'
  globalThis.fetch = (async () => { throw new Error('boom') }) as any
  await assert.rejects(tallerAdapter.crear!({ nombre: 'A', responsableNombre: 'B', nif: 'B12345678' }), /No se sabe si se creó|no se sabe si se creó/i)
  await assert.rejects(tallerAdapter.crear!({ nombre: 'A', responsableNombre: '', nif: 'B12345678' }), /dueño/)
})

test('rrhh: vincularExistente manda vincular_existente:true y devuelve vinculado; sin él, el cuerpo no lo lleva', async () => {
  falso(() => json({ id: 'e1', vinculado: true }, 201))
  const a = await rrhhAdapter.crear!({ nombre: 'Nueva SL', email: 'ana@x.es', responsableNombre: 'Ana', vincularExistente: true })
  assert.deepEqual(a, { id: 'e1', vinculado: true })
  assert.equal(JSON.parse(llamadas[0].init.body).vincular_existente, true)
  falso(() => json({ id: 'e2' }, 201))
  const b = await rrhhAdapter.crear!({ nombre: 'Otra SL', email: 'b@x.es', responsableNombre: 'Bea' })
  assert.deepEqual(b, { id: 'e2' })
  assert.equal('vincular_existente' in JSON.parse(llamadas[1].init.body), false)
})

test('rrhh: el 409 por correo existente sigue llegando al operador', async () => {
  falso(() => json({ error: 'Ya existe un usuario con ese email' }, 409))
  await assert.rejects(rrhhAdapter.crear!({ nombre: 'N', email: 'a@x.es', responsableNombre: 'A' }), /Ya existe un usuario/)
})

test('cuerpo de la ruta → NuevoCliente: solo el booleano true vincula', () => {
  const base = { vertical: 'rrhh', nombre: 'N', email: 'a@x.es' }
  assert.equal(nuevoClienteDesdeBody({ ...base, vincularExistente: true }).vincularExistente, true)
  for (const v of ['true', 1, undefined, null]) assert.equal(nuevoClienteDesdeBody({ ...base, vincularExistente: v }).vincularExistente, false)
  assert.equal(nuevoClienteDesdeBody({ ...base, direccion: { cp: '41900', via: 5 } }).direccion?.via, undefined)
})

test('respuesta: el PIN temporal va una vez y con no-store; «vinculado» se indica; sin PIN no hay cabecera', () => {
  const t = respuestaAlta({ id: 't1', pinTemporal: '4826', codigoTaller: 'ABCD2345' })
  assert.deepEqual(t.cuerpo, { ok: true, id: 't1', pinTemporal: '4826', codigoTaller: 'ABCD2345' }); assert.equal(t.cabeceras['Cache-Control'], 'no-store')
  const r = respuestaAlta({ id: 'e1', vinculado: true })
  assert.deepEqual(r.cuerpo, { ok: true, id: 'e1', vinculado: true }); assert.deepEqual(r.cabeceras, {})
})

test('secretos nuevos en el registro (solo metadatos, sin valores) y propios', () => {
  const src = readFileSync(new URL('../secrets-registry.ts', import.meta.url), 'utf8')
  assert.match(src, /name: 'TALLER_OPERADOR_SECRET'/)
  assert.match(src, /name: 'RRHH_FICHAJE_TALLER_SECRET'/)
})
