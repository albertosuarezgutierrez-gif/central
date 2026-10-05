import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// El teléfono NO viaja en la URL: la query string queda en los logs de Vercel (y de cualquier
// proxy). «¿Quién llama?» es POST con cuerpo JSON validado con Zod.
const ruta = readFileSync(new URL('../app/api/operador/llamada/route.ts', import.meta.url), 'utf8')

test('🪤 /api/operador/llamada no acepta el teléfono por la URL (ni GET ni searchParams)', () => {
  assert.doesNotMatch(ruta, /export\s+(async\s+)?function\s+GET\b|export\s+const\s+GET\b/)
  assert.doesNotMatch(ruta, /searchParams/)
})

test('🪤 /api/operador/llamada es POST auditado con el cuerpo validado por CuerpoLlamada.safeParse', () => {
  assert.match(ruta, /export\s+const\s+POST\s*=\s*auditado\(/)
  assert.match(ruta, /CuerpoLlamada\.safeParse\(/)
})

test('CuerpoLlamada: solo { tel } de texto, 1-40 caracteres, sin claves de más', async () => {
  const { CuerpoLlamada } = await import('./llamada-cuerpo.ts')
  assert.equal(CuerpoLlamada.safeParse({ tel: '600112233' }).success, true)
  assert.equal(CuerpoLlamada.safeParse({}).success, false)
  assert.equal(CuerpoLlamada.safeParse({ tel: '' }).success, false)
  assert.equal(CuerpoLlamada.safeParse({ tel: '6'.repeat(41) }).success, false)
  assert.equal(CuerpoLlamada.safeParse({ tel: 600112233 }).success, false)
  assert.equal(CuerpoLlamada.safeParse({ tel: '600112233', clienteId: 'x' }).success, false)
  assert.equal(CuerpoLlamada.safeParse(null).success, false)
})
