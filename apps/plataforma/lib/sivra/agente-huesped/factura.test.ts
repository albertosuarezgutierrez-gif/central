import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { esPeticionFactura, MOTIVO_FACTURA, REGLA_GESTIONES, REGLA_VOZ, REGLA_FACTURA } from './factura.ts'
import { tipoHueco } from './reglas.ts'

const FUENTE = readFileSync(new URL('./decidir.ts', import.meta.url), 'utf8')

test('esPeticionFactura: positivos en es/en/it/pt/fr', () => {
  for (const t of [
    'Hola, necesitaría una factura a nombre de mi empresa',
    'Could you send me an invoice for my company?',
    'Vorrei la fattura intestata alla mia azienda',
    'Preciso de uma fatura com NIF da empresa',
    "Pouvez-vous m'envoyer une facture ?",
    'Necesito el CIF de la empresa en el recibo',
    'Please issue it with our VAT number, company name is Acme Ltd',
  ]) assert.equal(esPeticionFactura(t), true, t)
})

test('esPeticionFactura: negativos', () => {
  for (const t of ['¿A qué hora es el check-in?', 'What is the wifi password?', 'Gracias por todo', 'Mi factorial favorito es 5', '', null, undefined])
    assert.equal(esPeticionFactura(t as any), false, String(t))
})

test('el prompt habla en primera persona: sin «anfitrión» ni «se lo traslado» como tercero', () => {
  for (const r of [REGLA_GESTIONES, REGLA_VOZ.split('NUNCA')[0]]) assert.doesNotMatch(r, /trasladas|al anfitri[oó]n/i)
  assert.match(REGLA_GESTIONES, /lo gestiono yo y te confirmo/)
  // El system del redactor (entre `const system =` y `Escribe ÚNICAMENTE`) no nombra al anfitrión.
  const ini = FUENTE.indexOf('const system = `Eres el asistente de atención')
  const fin = FUENTE.indexOf('Escribe ÚNICAMENTE el mensaje', ini)
  assert.ok(ini > 0 && fin > ini)
  assert.doesNotMatch(FUENTE.slice(ini, fin), /anfitri[oó]n/i)
  assert.match(FUENTE.slice(ini, fin), /\$\{REGLA_VOZ\}[\s\S]*\$\{REGLA_FACTURA\}/)
  assert.match(FUENTE.slice(ini, fin), /\$\{REGLA_GESTIONES\}/)
})

test('regla de factura: confirma, pide solo lo que falta y envía el día de salida', () => {
  for (const k of [/razón social/, /NIF\/CIF\/VAT/, /dirección fiscal completa/, /email de envío/, /día de salida/, /NO le pidas lo que ya haya dado/])
    assert.match(REGLA_FACTURA, k)
})

test('una petición de factura NO es hueco de la guía (no hay aviso ni se guarda como hecho)', () => {
  assert.equal(tipoHueco({ needs_human: true, apoyada_en_fuente: false, categoria: 'otro', sentimiento: 'neutro', motivo: MOTIVO_FACTURA }), 'ninguno')
  // El camino de decidir.ts: la factura salta el control de calidad y tiene su propio motivo.
  assert.match(FUENTE, /peticionFactura\s*\n?\s*\?\s*'OK'/)
  assert.match(FUENTE, /\|\| peticionFactura\n/)
  assert.match(FUENTE, /\? MOTIVO_FACTURA/)
})
