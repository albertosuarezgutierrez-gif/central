import test from 'node:test'
import assert from 'node:assert/strict'
import { credencialesCompletas, publicarImagen, publicarCarrusel } from './index.ts'

type Llamada = { url: string; body?: Record<string, unknown> }

function graphFalso(respuestas: unknown[]) {
  const llamadas: Llamada[] = []
  const f = (async (url: string, init?: { body?: string }) => {
    llamadas.push({ url, body: init?.body ? JSON.parse(init.body) : undefined })
    const r = respuestas.shift() ?? {}
    return { json: async () => r } as Response
  }) as unknown as typeof fetch
  return { f, llamadas }
}
const sinEspera = async () => {}
const CRED = { token: 'tok-secreto', userId: '17841' }

test('credencialesCompletas: vacío o ausente no es credencial', () => {
  assert.equal(credencialesCompletas({ token: 'a', userId: 'b' }), true)
  assert.equal(credencialesCompletas({ token: '', userId: 'b' }), false)
  assert.equal(credencialesCompletas({ token: 'a', userId: '  ' }), false)
  assert.equal(credencialesCompletas({ token: 'a' }), false)
  assert.equal(credencialesCompletas(null), false)
})

test('publicarImagen: sin credenciales lanza antes de llamar a nadie', async () => {
  const { f, llamadas } = graphFalso([])
  await assert.rejects(publicarImagen({ token: '', userId: '1' }, 'u', 'c', { fetch: f, esperar: sinEspera }), /faltan credenciales/)
  assert.equal(llamadas.length, 0)
})

test('publicarImagen: contenedor → estado → publicar, con las credenciales PASADAS', async () => {
  const { f, llamadas } = graphFalso([{ id: 'C1' }, { status_code: 'FINISHED' }, { id: 'POST9' }])
  const id = await publicarImagen(CRED, 'https://x/img.png', 'hola', { fetch: f, esperar: sinEspera })
  assert.equal(id, 'POST9')
  assert.match(llamadas[0].url, /graph\.instagram\.com\/v21\.0\/17841\/media$/)
  assert.equal(llamadas[0].body?.image_url, 'https://x/img.png')
  assert.equal(llamadas[0].body?.access_token, 'tok-secreto')
  assert.match(llamadas[2].url, /17841\/media_publish$/)
  assert.equal(llamadas[2].body?.creation_id, 'C1')
})

test('publicarImagen: el error de Graph se cuenta sin filtrar el token', async () => {
  const { f } = graphFalso([{ error: { message: 'Invalid image', code: 9004 } }])
  await assert.rejects(
    publicarImagen(CRED, 'u', 'c', { fetch: f, esperar: sinEspera }),
    (e: Error) => /Invalid image/.test(e.message) && !e.message.includes('tok-secreto'),
  )
})

test('publicarImagen: contenedor que no termina no se publica', async () => {
  const { f, llamadas } = graphFalso([{ id: 'C1' }, { status_code: 'ERROR' }])
  await assert.rejects(publicarImagen(CRED, 'u', 'c', { fetch: f, esperar: sinEspera }), /no listo/)
  assert.ok(!llamadas.some((l) => l.url.endsWith('/media_publish')))
})

test('publicarCarrusel: fuera de 2-10 imágenes lanza; dentro, hijos + carrusel + publicar', async () => {
  await assert.rejects(publicarCarrusel(CRED, ['a'], 'c', { esperar: sinEspera }), /de 2 a 10/)
  const { f, llamadas } = graphFalso([{ id: 'H1' }, { id: 'H2' }, { id: 'CAR' }, { status_code: 'FINISHED' }, { id: 'P' }])
  const id = await publicarCarrusel(CRED, ['a', 'b'], 'c', { fetch: f, esperar: sinEspera })
  assert.equal(id, 'P')
  assert.equal(llamadas[2].body?.children, 'H1,H2')
  assert.equal(llamadas[2].body?.media_type, 'CAROUSEL')
})
