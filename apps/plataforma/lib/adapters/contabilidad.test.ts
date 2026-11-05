// Runner: `node --test --experimental-strip-types lib/adapters/contabilidad.test.ts`
// Alta de empresa en contabilidad (puerto CONTABILIDAD_*) con fetch FALSO.
// Cepo visto fallar el 05/11/2026: en contabilidad.ts quitar el `if (!res.ok) throw` → rojo en «contabilidad rechaza». Restaurado → verde.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { contabilidadAdapter, cuerpoAltaContabilidad } from './contabilidad.ts'
import { readFileSync } from 'node:fs'

const real = globalThis.fetch
let llamadas: { url: string; init: any }[] = []
const falso = (res: () => Response | Promise<Response>) => { globalThis.fetch = (async (url: any, init: any) => { llamadas.push({ url: String(url), init }); return res() }) as any }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })
const alta = { nombre: ' Talleres Prueba SL ', nif: 'B12345678', email: 'Duena@Ejemplo.es', responsableNombre: 'Pilar', color: '#8FFA09', logo: 'https://x.es/l.png' }

beforeEach(() => { llamadas = []; process.env.CONTABILIDAD_URL = 'https://contabilidad.test/'; process.env.CONTABILIDAD_OPERADOR_SECRET = 'sec-conta' })
afterEach(() => { globalThis.fetch = real; delete process.env.CONTABILIDAD_URL; delete process.env.CONTABILIDAD_OPERADOR_SECRET })

test('registrado en el panel como vertical con alta (index.ts importa sin extensión: se comprueba el registro en el fuente)', () => {
  const idx = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  assert.match(idx, /import \{ contabilidadAdapter \} from '\.\/contabilidad'/)
  assert.match(idx, /contabilidad: contabilidadAdapter,/)
  assert.equal(contabilidadAdapter.vertical, 'contabilidad')
  assert.equal(contabilidadAdapter.puedeCrear, true)
})

test('alta OK → POST al puerto con Bearer PROPIO y cuerpo mínimo (dueño por correo, sin PIN)', async () => {
  falso(() => json({ empresaId: 'e1', creada: true, duenoUsuarioId: 'u1', completado: [] }, 201))
  const r = await contabilidadAdapter.crear!(alta)
  assert.deepEqual(r, { id: 'e1' })
  assert.equal(llamadas[0].url, 'https://contabilidad.test/api/operador/empresas')
  assert.equal(llamadas[0].init.headers.Authorization, 'Bearer sec-conta')
  assert.deepEqual(JSON.parse(llamadas[0].init.body), {
    razonSocial: 'Talleres Prueba SL', nif: 'B12345678', dueno: { email: 'duena@ejemplo.es', nombre: 'Pilar' },
    colorPrimario: '#8ffa09', logoUrl: 'https://x.es/l.png',
  })
})

test('repetir el alta (200, idempotente por NIF) devuelve el mismo id', async () => {
  falso(() => json({ empresaId: 'e1', creada: false, duenoUsuarioId: null, completado: [] }, 200))
  assert.deepEqual(await contabilidadAdapter.crear!(alta), { id: 'e1' })
})

test('contabilidad rechaza (400/401): el error llega al operador y no hay id', async () => {
  falso(() => json({ error: 'datos_no_validos', errores: ['NIF no válido'] }, 400))
  await assert.rejects(contabilidadAdapter.crear!(alta), /NIF no válido/)
  falso(() => json({ error: 'No autorizado' }, 401))
  await assert.rejects(contabilidadAdapter.crear!(alta), /No autorizado/)
})

test('sin URL o sin secreto: no se llama a nada (fail-closed); faltan datos obligatorios → error antes de la red', async () => {
  falso(() => json({}))
  delete process.env.CONTABILIDAD_OPERADOR_SECRET
  await assert.rejects(contabilidadAdapter.crear!(alta), /sin conectar/)
  process.env.CONTABILIDAD_OPERADOR_SECRET = 'sec-conta'
  await assert.rejects(contabilidadAdapter.crear!({ ...alta, email: '' }), /Correo/)
  await assert.rejects(contabilidadAdapter.crear!({ ...alta, nif: ' ' }), /NIF/)
  assert.equal(llamadas.length, 0)
})

test('cuerpo: logo no https y color vacío no se mandan', () => {
  assert.deepEqual(cuerpoAltaContabilidad({ nombre: 'A', nif: 'B1', email: 'a@b.es', responsableNombre: 'B', logo: 'http://x', color: ' ' }),
    { razonSocial: 'A', nif: 'B1', dueno: { email: 'a@b.es', nombre: 'B' } })
})
