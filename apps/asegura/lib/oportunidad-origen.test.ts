import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { comoSeAbrioOportunidad } from './oportunidad-origen.ts'

test('🪤 el lead que llega por CORREO no se anota como «documento subido» (19/10/2026)', () => {
  assert.equal(comoSeAbrioOportunidad('correo:lead'), 'sola desde el correo del lead')
  assert.equal(comoSeAbrioOportunidad('web:lead'), 'sola desde el formulario web')
  assert.equal(comoSeAbrioOportunidad('ficha:manual'), 'a mano')
  assert.equal(comoSeAbrioOportunidad('documento:poliza'), 'sola desde un documento subido')
  assert.equal(comoSeAbrioOportunidad('whatsapp_ia'), 'sola desde una conversación de WhatsApp')
  assert.equal(comoSeAbrioOportunidad('algo:nuevo'), 'automáticamente', 'un origen nuevo nunca se disfraza de otro canal')
})

test('🪤 los ORIGEN_* del alta casan con el helper y el historial lo usa (lee el fuente)', () => {
  const src = readFileSync(new URL('./oportunidad-seguimiento.ts', import.meta.url), 'utf8')
  assert.match(src, /ORIGEN_LEAD_CORREO = 'correo:lead'/)
  assert.match(src, /ORIGEN_LEAD_WEB = 'web:lead'/)
  assert.match(src, /ORIGEN_MANUAL = 'ficha:manual'/)
  assert.match(src, /const como = comoSeAbrioOportunidad\(origen\)/)
  assert.doesNotMatch(src, /'sola desde un documento subido'/, 'el texto vuelve a estar a mano en el alta')
})
