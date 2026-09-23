import { test } from 'node:test'
import assert from 'node:assert/strict'
import { viaIA } from './ia.ts'

test('con URL y secreto de la pasarela, la IA va por la pasarela', () => {
  assert.equal(viaIA({ AI_GATEWAY_URL: 'https://p', AI_GATEWAY_SECRET: 's' }), 'pasarela')
})

test('si falta cualquiera de las dos, se cae a la llamada directa', () => {
  assert.equal(viaIA({ AI_GATEWAY_URL: 'https://p' }), 'directo')
  assert.equal(viaIA({ AI_GATEWAY_SECRET: 's' }), 'directo')
  assert.equal(viaIA({}), 'directo')
})

test('ningún fichero de asegura llama a aiComplete directo salvo lib/ia.ts', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')
  const raiz = new URL('..', import.meta.url).pathname
  const infractores: string[] = []
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue
      const p = join(dir, n)
      if (statSync(p).isDirectory()) { recorrer(p); continue }
      if (!/\.(ts|tsx)$/.test(n) || n.endsWith('.test.ts') || p.endsWith(join('lib', 'ia.ts'))) continue
      if (/\baiComplete\s*\(/.test(readFileSync(p, 'utf8'))) infractores.push(p.slice(raiz.length))
    }
  }
  for (const d of ['lib', 'app']) recorrer(join(raiz, d))
  assert.deepEqual(infractores, [], 'la IA de texto va por iaTexto() de lib/ia.ts, para que cuente en ai_usos y respete los topes')
})
