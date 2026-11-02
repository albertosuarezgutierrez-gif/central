import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emailEntregable } from './email-sintaxis.ts'

test('acepta correos entregables', () => {
  for (const b of ['alberto@grupoasegura.es', 'a.b+etiqueta@sub.dominio.co.uk', "o'brien@dominio.es", 'x_y@a-b.com']) {
    assert.equal(emailEntregable(b), true, b)
  }
})

test('rechaza lo que el SMTP devuelve como «Bad recipient address syntax»', () => {
  for (const m of [
    'a..b@x.es', '.a@x.es', 'a.@x.es', 'a@-x.es', 'a@x-.es', 'a@x..es', 'a@x.es.', 'a@x_y.es',
    'a@x.e', 'a@x.123', 'ñandú@x.es', 'a@dominiô.es', 'a@@x.es', 'a@b@x.es', 'a b@x.es', '', 'a@', '@x.es',
  ]) {
    assert.equal(emailEntregable(m), false, JSON.stringify(m))
  }
  assert.equal(emailEntregable(undefined), false)
})

test('🪤 /api/acceso/solicitar valida la sintaxis del correo con el mismo 400 de destino inválido', () => {
  const r = readFileSync(new URL('../app/api/acceso/solicitar/route.ts', import.meta.url), 'utf8')
  assert.match(r, /emailEntregable\(destino\)/)
  assert.match(r, /destino_invalido/)
})
