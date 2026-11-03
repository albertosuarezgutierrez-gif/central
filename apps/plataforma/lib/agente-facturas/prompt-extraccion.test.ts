// Cepo sobre el FUENTE del prompt de extracción (`lib/ai-client.ts` no se puede importar en
// `node --test`: arrastra Prisma y la pasarela). Protege lo que tsc no ve: que el vocabulario que la
// IA puede devolver sea EXACTAMENTE el que `tipo-documento.ts` sabe decidir, y que el documento
// llegue entero a la IA (03/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TIPOS_DOCUMENTO } from './tipo-documento.ts'

const fuente = readFileSync(new URL('../ai-client.ts', import.meta.url), 'utf8')
const prompt = fuente.slice(fuente.indexOf('const INVOICE_SYSTEM = `'), fuente.indexOf('Solo JSON, sin texto adicional.`'))

test('el esquema pide tipo_documento con el vocabulario cerrado, ni más ni menos', () => {
  const m = prompt.match(/"tipo_documento":\s*"([^"]+)"/)
  assert.ok(m, 'el esquema JSON no pide tipo_documento')
  assert.deepEqual(m[1].split('|').sort(), [...TIPOS_DOCUMENTO].sort())
})

test('tipo_documento es obligatorio y cada tipo está explicado', () => {
  assert.match(prompt, /"tipo_documento" es OBLIGATORIO/)
  for (const t of TIPOS_DOCUMENTO) assert.ok(prompt.includes(`- "${t}":`), `falta la definición de «${t}»`)
})

test('distingue emisor/destinatario y nº de factura/albarán', () => {
  assert.match(prompt, /"cliente":/)
  assert.match(prompt, /"numero_albaran":/)
  assert.match(prompt, /NUNCA es el proveedor/)
  assert.match(prompt, /NUNCA en "numero_factura"/)
})

test('el texto llega entero (no se corta al encabezado)', () => {
  assert.doesNotMatch(fuente, /input\.text\.slice\(0,\s*4000\)/)
  assert.match(fuente, /recortarTextoDocumento\(input\.text\)/)
})
