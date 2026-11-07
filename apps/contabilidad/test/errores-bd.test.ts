// Las rutas de la F5 no convierten todo error en «¿falta aplicar 0005?»: tabla inexistente = 503, duplicado = 409, el resto = 500.
// Cepo visto fallar el 07/11/2026: devolver 503 siempre en `respuestaDeErrorBd` → rojo en duplicado y en genérico.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { respuestaDeErrorBd } from '../lib/errores-bd.ts'

test('tabla inexistente (42P01, también como mensaje de Prisma) = 503; duplicado (23505) = 409; lo demás = 500', () => {
  assert.equal(respuestaDeErrorBd({ code: '42P01' }).status, 503)
  assert.equal(respuestaDeErrorBd({ code: 'P2010', meta: { code: '42P01', message: 'relation "contabilidad.activos_fijos" does not exist' } }).status, 503)
  assert.equal(respuestaDeErrorBd(new Error('relation "contabilidad.cierres_ejercicio" does not exist')).status, 503)
  assert.equal(respuestaDeErrorBd({ code: 'P2010', meta: { code: '23505' } }).status, 409)
  assert.equal(respuestaDeErrorBd(new Error('uq_asientos_origen_f5: duplicate key value violates unique constraint')).status, 409)
  const otro = respuestaDeErrorBd(new Error('connection reset'))
  assert.equal(otro.status, 500)
  assert.doesNotMatch(otro.body.errores.join(), /0005/)
  assert.equal(respuestaDeErrorBd(undefined).status, 500)
})

test('las tres rutas de la F5 usan respuestaDeErrorBd y ya no devuelven 503 fijo', () => {
  for (const r of ['cierre', 'inmovilizado', 'cuentas-anuales']) {
    const src = readFileSync(join(import.meta.dirname, '..', 'app', 'api', r, 'route.ts'), 'utf8')
    assert.match(src, /respuestaDeErrorBd/, r)
    assert.doesNotMatch(src, /¿falta aplicar el esquema de la fase 5/, r)
  }
})
