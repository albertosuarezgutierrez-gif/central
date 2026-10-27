import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { REGLA_FACTURA_ENLACE, MOTIVO_FACTURA } from './factura.ts'
import { tipoHueco } from './reglas.ts'

// Enlace al formulario de factura (27/10/2026). La política de envío NO cambia: una petición de factura pasa SIEMPRE
// por Alberto. El enlace lo añade el CÓDIGO (el modelo no escribe URLs).
const ORQ = readFileSync(new URL('./orquestador.ts', import.meta.url), 'utf8')
const DEC = readFileSync(new URL('./decidir.ts', import.meta.url), 'utf8')

test('la solicitud solo se crea si el huésped PIDE factura (no por un NIF suelto)', () => {
  assert.match(ORQ, /if \(esPeticionFactura\(pregunta\)\) \{\s*\n\s*const sol = await asegurarSolicitud\(ctx\.reservationId, 'agente'\)/)
})

test('el enlace se añade con el código y el mensaje NUNCA sale solo', () => {
  const i = ORQ.indexOf('if (ctx.enlaceFactura && dec.reply) {')
  assert.ok(i > 0)
  const bloque = ORQ.slice(i, ORQ.indexOf('}', i))
  assert.match(bloque, /dec\.reply = conEnlace\(dec\.reply, ctx\.lang, ctx\.enlaceFactura\)/)
  assert.match(bloque, /dec\.needs_human = true/)
  // Va ANTES de la decisión de auto-envío.
  assert.ok(i < ORQ.indexOf('decidirAutoEnvio(dec, pregunta, horarioOficial)'))
})

test('la regla del enlace va al prompt solo si hay enlace, y prohíbe escribir URLs', () => {
  assert.match(DEC, /\$\{REGLA_FACTURA\}\$\{ctx\.enlaceFactura \? ` \$\{REGLA_FACTURA_ENLACE\}` : ''\}/)
  assert.match(REGLA_FACTURA_ENLACE, /NO escribas tú ningún enlace ni URL/)
})

test('los motivos añadidos no convierten la factura en «hueco de la guía»', () => {
  for (const extra of [
    'lleva el enlace al formulario de datos fiscales; al rellenarlo te llegará el borrador de la factura',
    'NO he podido crear el enlace al formulario de factura (reserva no encontrada en incomes): el borrador pide los datos a mano; o créalo en /sivra/facturas.',
  ]) {
    assert.equal(tipoHueco({ needs_human: true, apoyada_en_fuente: false, categoria: 'otro', sentimiento: 'neutro', motivo: `${MOTIVO_FACTURA} · ${extra}` }), 'ninguno')
    assert.ok(ORQ.includes(extra.split(' (')[0].slice(0, 40)), extra)
  }
})
