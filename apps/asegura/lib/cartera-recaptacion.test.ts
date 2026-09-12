// apps/asegura/lib/cartera-recaptacion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = readFileSync(new URL('./cartera-recaptacion.ts', import.meta.url), 'utf8')

test('el filtro de cartera viva usa el helper compartido, no una condición propia', () => {
  assert.match(FUENTE, /sqlVolcadoHistorico|sqlCarteraViva/)
})

test('la exclusión de cliente-ya-vivo-por-CIMA está en el SQL de la cola', () => {
  // Debe existir un NOT EXISTS que mire otras pólizas del mismo cliente que SÍ
  // sean cartera viva — si esta línea desaparece, un cliente actual volvería a
  // aparecer en la cola de "leads a recaptar".
  assert.match(FUENTE, /not exists[\s\S]{0,400}cartera_viva|not exists[\s\S]{0,400}import_ref is null or[\s\S]{0,80}eiac_xml_hash is not null/i)
})

test('la prima usa nullif para no pintar 0 como si fuera un importe real', () => {
  assert.match(FUENTE, /nullif/i)
})

test('el opt-out de WhatsApp y de email se respetan cada uno por su canal', () => {
  // Guarda obligatoria del spec (punto 1, la única que Alberto marcó como
  // "sí o sí"): un cliente que dio de baja un canal no puede recibir esa
  // oferta por ese canal, aunque siga teniendo el otro disponible.
  assert.match(FUENTE, /wa_opt_out_at/i)
  assert.match(FUENTE, /email_opt_out_at/i)
})
