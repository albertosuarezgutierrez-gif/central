import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { esPeticionFactura, esTramiteFiscal, contieneIdFiscal, MOTIVO_FACTURA, REGLA_GESTIONES, REGLA_VOZ, REGLA_FACTURA, textosDesdePeticion, reglaFacturaEstado } from './factura.ts'
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

test('regla de factura: confirma, pide solo lo que falta y no promete fecha', () => {
  for (const k of [/razón social/, /NIF\/CIF\/VAT/, /dirección fiscal completa/, /email de envío/, /en cuanto la revise/, /NO le prometas fecha/, /NO le pidas lo que ya haya dado/])
    assert.match(REGLA_FACTURA, k)
})

test('una petición de factura NO es hueco de la guía (no hay aviso ni se guarda como hecho)', () => {
  assert.equal(tipoHueco({ needs_human: true, apoyada_en_fuente: false, categoria: 'otro', sentimiento: 'neutro', motivo: MOTIVO_FACTURA }), 'ninguno')
  // El camino de decidir.ts: la factura salta el control de calidad y tiene su propio motivo.
  assert.match(FUENTE, /peticionFactura\s*\n?\s*\?\s*'OK'/)
  assert.match(FUENTE, /\|\| peticionFactura\n/)
  assert.match(FUENTE, /\? MOTIVO_FACTURA/)
})

test('esTramiteFiscal: datos fiscales sueltos en un mensaje aparte', () => {
  for (const t of [
    'B23892946, Calle Mayor 3, 28001 Madrid, juan@x.com',
    'mi NIF es 12345678Z',
    'NIE X1234567L',
    'VAT: PT123456789',
    'IT12345678901',
    'DE123456789',
  ]) assert.equal(esTramiteFiscal(t), true, t)
  assert.equal(contieneIdFiscal('12345678Z'), true)
})

test('esTramiteFiscal: un email suelto sin hilo de factura NO basta', () => {
  for (const t of ['escríbeme a juan@x.com', 'mi correo es a@b.es', 'Llegamos a las 12345 horas', 'ESTUPENDO gracias'])
    assert.equal(esTramiteFiscal(t), false, t)
})

test('esTramiteFiscal: hilo previo de factura + email/dato personal suelto = trámite fiscal', () => {
  assert.equal(esTramiteFiscal('juan@x.com', ['Necesito una factura a nombre de mi empresa']), true)
  assert.equal(esTramiteFiscal('juan@x.com', ['hola', 'qué wifi hay']), false)
  assert.equal(esTramiteFiscal('juan@x.com', [null, undefined]), false)
})

test('factura de la luz / electricity bill NO es petición de factura', () => {
  for (const t of ['¿La factura de la luz está incluida?', 'Is the electricity bill included?', 'las facturas de agua y gas van aparte?', 'water bill included?'])
    assert.equal(esPeticionFactura(t), false, t)
  assert.equal(esPeticionFactura('La factura de la luz está incluida? Y necesito una factura de mi estancia'), true)
})

test('decidir.ts usa esTramiteFiscal con los mensajes previos del huésped', () => {
  assert.match(FUENTE, /esTramiteFiscal\(pregunta, ctx\.historial\.filter\(h => h\.from === 'guest'\)/)
})

// ── 29/10/2026: datos de factura desde el chat + promesa honesta ─────────────────────────────────────────────────

test('textosDesdePeticion: solo desde la primera petición de factura (el DNI del registro previo no entra)', () => {
  assert.deepEqual(textosDesdePeticion(['Mi DNI 12345678Z para el registro', 'Necesito factura a Laie SL', 'NIF B08549784']), ['Necesito factura a Laie SL', 'NIF B08549784'])
  assert.deepEqual(textosDesdePeticion(['Mi DNI 12345678Z', 'gracias']), [])
})

test('reglaFacturaEstado: completa «tomo nota, en cuanto la revise» sin fecha ni datos/enlaces; incompleta pide solo lo que falta', () => {
  const c = reglaFacturaEstado({ completa: true, email: 'info@laie.es', cc: ['lcalles@laie.es'] }, false)
  assert.match(c, /tomo nota/)
  assert.match(c, /en cuanto la revise/)
  assert.match(c, /NO le prometas fecha/)
  assert.doesNotMatch(c, /día de (su )?salida|24 horas|automátic|sola/)
  assert.match(c, /info@laie\.es \(con copia a lcalles@laie\.es\)/)
  assert.match(c, /NO le pidas ninguno ni le pongas enlaces/)
  const i = reglaFacturaEstado({ completa: false, faltan: ['NIF/CIF/VAT'] }, true)
  assert.match(i, /FALTAN: NIF\/CIF\/VAT/)
  assert.match(i, /NO le prometas fecha/)
  assert.doesNotMatch(i, /día de (su )?salida/)
})

test('REGLA_FACTURA no promete fecha ni envío automático (nada sale sin el ✅ de Alberto)', () => {
  assert.match(REGLA_FACTURA, /NO le prometas fecha ni plazo/)
  assert.doesNotMatch(REGLA_FACTURA, /día de salida|le llega sola/)
})

test('orquestador: con datos completos NO hay enlace y el mensaje sigue pasando por Alberto', () => {
  const ORQ = readFileSync(new URL('./orquestador.ts', import.meta.url), 'utf8')
  assert.match(ORQ, /if \(!estadoFactura\?\.completa\) ctx\.enlaceFactura = solFactura\.url/)
  const i = ORQ.indexOf('if (ctx.facturaEstado?.completa && dec.reply) {')
  assert.ok(i > 0 && i < ORQ.indexOf('decidirAutoEnvio(dec, pregunta, horarioOficial)'))
  assert.match(ORQ.slice(i, ORQ.indexOf('}', i)), /dec\.needs_human = true/)
  const DEC = readFileSync(new URL('./decidir.ts', import.meta.url), 'utf8')
  assert.match(DEC, /\$\{ctx\.facturaEstado \? ` \$\{reglaFacturaEstado\(ctx\.facturaEstado, !!ctx\.enlaceFactura\)\}` : ''\}/)
})
