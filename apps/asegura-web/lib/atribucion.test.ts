// Cepo del saneado de atribución (first-touch) del lead web.
// Lo que protege: que a plataforma no viaje PII ni basura desde la URL, el
// referrer o un sessionStorage manipulado, y que la lista blanca de claves de
// esta web y la de plataforma (que es quien manda) no se separen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  atribucionFirstTouch,
  capturarAtribucion,
  CLAVE_ATRIBUCION,
  CLAVES_ATRIBUCION,
  CONSENTIMIENTO_VERSION,
  MAX_VALOR_ATRIBUCION,
  sanearAtribucion,
} from './atribucion.ts'

const AHORA = new Date('2026-10-17T09:30:00.000Z')

test('captura utm, gclid, landing sin query y solo el ORIGEN del referrer', () => {
  const a = capturarAtribucion(
    'https://grupoasegura.es/seguros/auto?utm_source=google&utm_medium=cpc&utm_campaign=auto-otono&gclid=Cj0K_abc-123&email=ana@x.es&token=secreto#f',
    'https://www.google.com/search?q=seguro+coche+ana+perez',
    AHORA,
  )
  assert.deepEqual(a, {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'auto-otono',
    gclid: 'Cj0K_abc-123',
    landing: '/seguros/auto',
    referrer: 'https://www.google.com',
    fecha: '2026-10-17T09:30:00.000Z',
  })
  const json = JSON.stringify(a)
  assert.ok(!json.includes('ana@x.es') && !json.includes('secreto') && !json.includes('search?q'), 'nunca la query completa')
})

test('una clave no permitida se descarta', () => {
  const a = sanearAtribucion({ utm_source: 'meta', email: 'ana@x.es', telefono: '612345678', __proto__x: 'x', nif: '12345678Z' })
  assert.deepEqual(a, { utm_source: 'meta' })
})

test('valores maliciosos o con PII se descartan; los largos se recortan a 100', () => {
  const largo = 'a'.repeat(5000)
  const a = sanearAtribucion({
    utm_source: '<script>alert(1)</script>',
    utm_medium: 'ana.perez@gmail.com',
    utm_campaign: 'llamar 612 345 678',
    utm_term: largo,
    utm_content: 'ok\u0000\u2028tras-control',
    gclid: 'abc"; drop table clientes;--',
    landing: '//evil.example/x',
    referrer: 'javascript:alert(1)',
    fecha: 'ayer',
  })
  assert.deepEqual(a, { utm_term: 'a'.repeat(MAX_VALOR_ATRIBUCION), utm_content: 'oktras-control' })
})

test('referrer con credenciales o del propio sitio no cuenta como fuente', () => {
  assert.equal(sanearAtribucion({ referrer: 'https://user:pw@x.com/' }), null)
  const a = capturarAtribucion('https://grupoasegura.es/', 'https://grupoasegura.es/blog/x', AHORA)
  assert.deepEqual(a, { landing: '/', fecha: '2026-10-17T09:30:00.000Z' })
})

test('nada aprovechable → null (no se sabe), no un objeto vacío', () => {
  assert.equal(sanearAtribucion({}), null)
  assert.equal(sanearAtribucion('x'), null)
  assert.equal(sanearAtribucion(null), null)
  assert.equal(sanearAtribucion([{ utm_source: 'x' }]), null)
})

function almacenFalso(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial))
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

test('first-touch: la guardada manda y NO se sobrescribe', () => {
  const primera = { utm_source: 'google', landing: '/', fecha: '2026-10-16T08:00:00.000Z' }
  const s = almacenFalso({ [CLAVE_ATRIBUCION]: JSON.stringify(primera) })
  const r = atribucionFirstTouch(s, { utm_source: 'meta', landing: '/seguros/hogar' }, true)
  assert.deepEqual(r, primera)
  assert.deepEqual(JSON.parse(s.m.get(CLAVE_ATRIBUCION)!), primera)
})

test('first-touch: sin consentimiento de estadística NO se escribe en sessionStorage', () => {
  const s = almacenFalso()
  const actual = { utm_source: 'meta', landing: '/' }
  assert.deepEqual(atribucionFirstTouch(s, actual, false), actual)
  assert.equal(s.m.has(CLAVE_ATRIBUCION), false)
  assert.deepEqual(atribucionFirstTouch(s, actual, true), actual)
  assert.equal(s.m.has(CLAVE_ATRIBUCION), true)
})

test('first-touch: almacén que lanza o contenido manipulado no rompe ni cuela basura', () => {
  const roto = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('quota') } }
  assert.deepEqual(atribucionFirstTouch(roto, { landing: '/' }, true), { landing: '/' })
  const sucio = almacenFalso({ [CLAVE_ATRIBUCION]: JSON.stringify({ email: 'a@b.es', utm_source: 'x@y.z' }) })
  assert.deepEqual(atribucionFirstTouch(sucio, { landing: '/' }, true), { landing: '/' })
  assert.deepEqual(atribucionFirstTouch(null, null, true), null)
})

test('la versión del consentimiento tiene la forma que acepta plataforma', () => {
  assert.match(CONSENTIMIENTO_VERSION, /^privacidad-\d{4}-\d{2}-\d{2}$/)
})

test('la lista blanca de claves es EXACTAMENTE la de plataforma', () => {
  const src = readFileSync(join(import.meta.dirname, '..', '..', 'plataforma', 'lib', 'leads-web.ts'), 'utf8')
  const m = src.match(/export const CLAVES_ATRIBUCION\s*=\s*\[([^\]]*)\]/)
  assert.ok(m, 'no se encontró CLAVES_ATRIBUCION en plataforma/lib/leads-web.ts')
  assert.deepEqual([...CLAVES_ATRIBUCION], [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
})
