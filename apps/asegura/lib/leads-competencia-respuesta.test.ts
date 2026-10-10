import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Lee el FUENTE a propósito: lo que vigila vive dentro de un `Prisma.sql`, donde ni `tsc` ni el
// build miran, y así no importa el cliente de Prisma (el job de tests corre sin `prisma generate`).
const fuente = readFileSync(fileURLToPath(new URL('./leads-competencia.ts', import.meta.url)), 'utf8')
const respondio = fuente.slice(fuente.indexOf('select 1 from recaptacion_envios r\n        where r.cliente_id = c.id and r.estado'), fuente.indexOf('as respondio'))

test('🪤 «respondió» no cuenta el WhatsApp que abrió Alberto (enlace_abierto) y sí la respuesta por WhatsApp', () => {
  assert.ok(respondio.length > 0, 'no encuentro el cálculo de «respondió» en leads-competencia.ts')
  // 'enlace_abierto' es el registro al PULSAR el botón, no una respuesta del cliente.
  assert.doesNotMatch(respondio, /'enlace_abierto'/)
  assert.match(respondio, /PREFIJO_LLAMADA_CONTESTADA/)
  assert.match(respondio, /PREFIJO_WHATSAPP_RESPONDIDO/)
})
