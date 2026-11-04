// Almacén real contra Supabase Storage con fetch FALSO: ruta con el taller delante, cabeceras, firmado y rechazo entre talleres.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { almacenSupabase, almacenActivo, rutaDe, rutaEsDelTaller, huellaSha256 } from '../lib/almacen.ts'
import { T, T2 } from './_escenario.ts'

type Llamada = { url: string; init: RequestInit }
function fetchFalso(respuestas: Array<{ ok: boolean; status?: number; json?: unknown }>) {
  const llamadas: Llamada[] = []
  const fn = (async (url: string, init: RequestInit) => {
    llamadas.push({ url: String(url), init })
    const r = respuestas.shift() ?? { ok: true, json: {} }
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.json ?? {} } as Response
  }) as unknown as typeof fetch
  return { fn, llamadas }
}
const cfg = (fn: typeof fetch) => ({ url: 'https://x.supabase.test/', claveServicio: 'sb_secret_x', fetch: fn })
const bytes = new Uint8Array([1, 2, 3])

test('guardar: POST al bucket privado `taller`, ruta <taller>/<carpeta>/…, clave de servicio en las dos cabeceras', async () => {
  const { fn, llamadas } = fetchFalso([{ ok: true }])
  const r = await almacenSupabase(cfg(fn)).guardar({ tallerId: T, carpeta: 'rec-1', nombre: 'Foto 0.JPG', mime: 'image/jpeg', bytes })
  assert.equal(r.huellaSha256, huellaSha256(bytes))
  assert.equal(r.ruta, `${T}/rec-1/foto-0-${r.huellaSha256}.jpg`)
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, `https://x.supabase.test/storage/v1/object/taller/${r.ruta}`)
  const h = llamadas[0].init.headers as Record<string, string>
  assert.equal(h.apikey, 'sb_secret_x')
  assert.equal(h.Authorization, 'Bearer sb_secret_x')
  assert.equal(h['Content-Type'], 'image/jpeg')
  assert.equal(llamadas[0].init.method, 'POST')
})

test('guardar: fallo de Storage lanza (no se da por guardada una foto que no está); tipo y carpeta raros se rechazan', async () => {
  const { fn } = fetchFalso([{ ok: false, status: 403 }])
  const a = almacenSupabase(cfg(fn))
  await assert.rejects(a.guardar({ tallerId: T, carpeta: 'r', nombre: 'a.jpg', mime: 'image/jpeg', bytes }), /Storage upload 403/)
  await assert.rejects(a.guardar({ tallerId: T, carpeta: 'r', nombre: 'a.svg', mime: 'image/svg+xml', bytes }), /no admitido/)
  await assert.rejects(a.guardar({ tallerId: T, carpeta: '../T2', nombre: 'a.png', mime: 'image/png', bytes }), /carpeta/)
})

test('urlFirmada: expiresIn corto, URL absoluta; ruta de OTRO taller → null sin llamar a Storage', async () => {
  const { fn, llamadas } = fetchFalso([{ ok: true, json: { signedURL: '/object/sign/taller/x?token=abc' } }])
  const a = almacenSupabase(cfg(fn))
  const ruta = `${T}/rec-1/firma-aa.png`
  assert.equal(await a.urlFirmada(T, ruta), 'https://x.supabase.test/storage/v1/object/sign/taller/x?token=abc')
  assert.equal(JSON.parse(String(llamadas[0].init.body)).expiresIn, 300)
  assert.equal(await a.urlFirmada(T2, ruta), null)
  assert.equal(await a.urlFirmada(T, `${T}/../${T2}/x.png`), null)
  assert.equal(llamadas.length, 1, 'las rutas ajenas no llegan a Storage')
})

test('urlFirmada: fallo de red o 4xx → null (la pantalla dice «sin imagen», no revienta)', async () => {
  const mal = (async () => { throw new Error('red') }) as unknown as typeof fetch
  assert.equal(await almacenSupabase(cfg(mal)).urlFirmada(T, `${T}/a/b.png`), null)
  const { fn } = fetchFalso([{ ok: false, status: 400 }])
  assert.equal(await almacenSupabase(cfg(fn)).urlFirmada(T, `${T}/a/b.png`), null)
})

test('sin variables de entorno, el almacén real falla CERRADO nombrando la variable (sin literal de reserva)', () => {
  const prev = { u: process.env.SUPABASE_URL, k: process.env.TALLER_STORAGE_SERVICE_KEY }
  delete process.env.SUPABASE_URL; delete process.env.TALLER_STORAGE_SERVICE_KEY
  try { assert.throws(() => almacenActivo(), /SUPABASE_URL/) } finally {
    if (prev.u) process.env.SUPABASE_URL = prev.u
    if (prev.k) process.env.TALLER_STORAGE_SERVICE_KEY = prev.k
  }
})

test('rutaDe / rutaEsDelTaller', () => {
  assert.equal(rutaEsDelTaller(T, `${T}/a.png`), true)
  assert.equal(rutaEsDelTaller(T, `${T2}/a.png`), false)
  assert.ok(rutaDe({ tallerId: T, carpeta: 'marca', nombre: 'logo.png', mime: 'image/png', bytes }).ruta.startsWith(`${T}/marca/logo-`))
})
