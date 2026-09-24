import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INDEXNOW_CLAVE, avisadasTras, enviarIndexNow, urlsParaIndexNow } from './indexnow.ts'

const SITEMAP = [
  { url: 'https://grupoasegura.es/', lastmod: null },
  { url: 'https://grupoasegura.es/blog/a', lastmod: '2026-09-20' },
  { url: 'https://grupoasegura.es/telefonos-siniestros', lastmod: null },
]

test('primera vez: se avisa de todo', () => {
  assert.equal(urlsParaIndexNow(SITEMAP, {}).length, 3)
})

test('solo lo nuevo o lo que cambió de lastmod', () => {
  const previas = { 'https://grupoasegura.es/': null, 'https://grupoasegura.es/blog/a': '2026-09-01' }
  assert.deepEqual(urlsParaIndexNow(SITEMAP, previas), [
    'https://grupoasegura.es/blog/a',
    'https://grupoasegura.es/telefonos-siniestros',
  ])
})

test('nada que avisar si no ha cambiado nada', () => {
  assert.deepEqual(urlsParaIndexNow(SITEMAP, avisadasTras({}, SITEMAP)), [])
})

test('avisadasTras conserva lo que ya no está en el sitemap', () => {
  const r = avisadasTras({ 'https://grupoasegura.es/vieja': null }, SITEMAP)
  assert.ok('https://grupoasegura.es/vieja' in r)
  assert.equal(r['https://grupoasegura.es/blog/a'], '2026-09-20')
})

test('enviarIndexNow: cuerpo del protocolo y 202 es éxito; 403 lanza', async () => {
  let cuerpo: Record<string, unknown> = {}
  const ok = async (_u: string, init?: RequestInit) => {
    cuerpo = JSON.parse(String(init?.body))
    return new Response('', { status: 202 })
  }
  assert.equal(await enviarIndexNow('grupoasegura.es', ['https://grupoasegura.es/'], ok), 202)
  assert.equal(cuerpo.host, 'grupoasegura.es')
  assert.equal(cuerpo.keyLocation, `https://grupoasegura.es/${INDEXNOW_CLAVE}.txt`)
  const mal = async () => new Response('key not found', { status: 403 })
  await assert.rejects(enviarIndexNow('grupoasegura.es', ['https://grupoasegura.es/'], mal), /IndexNow 403/)
})

test('la clave coincide con el fichero que publica la web (si no, Bing responde 403)', () => {
  const fichero = new URL(`../../../asegura-web/public/${INDEXNOW_CLAVE}.txt`, import.meta.url)
  assert.equal(readFileSync(fichero, 'utf8'), INDEXNOW_CLAVE)
})
