// 🪤 «Enviar al cliente» (21/10/2026). Para verlo en rojo: en `correoDelTomador` trata `emailIlegible` como «sin correo»
// → falla «ilegible = no se sabe»; o en `leerEnlaceAviso` acepta cualquier URL → falla «solo wa.me».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { correoDelTomador, leerEnlaceAviso } from './enviar-cliente.ts'

test('🪤 correo del tomador en tres estados: ilegible = no se sabe, nunca «no tiene»', () => {
  assert.equal(correoDelTomador({ email: 'a@b.es', emailIlegible: false }), 'con_email')
  assert.equal(correoDelTomador({ email: null, emailIlegible: false }), 'sin_email')
  assert.equal(correoDelTomador({ email: null, emailIlegible: true }), 'no_se_sabe')
  assert.equal(correoDelTomador(null), 'no_se_sabe')
})

test('🪤 el enlace del aviso: solo un wa.me, con el mensaje y el enlace', () => {
  const ok = { estado: 'enlace', mensaje: 'Hola', whatsapp: 'https://wa.me/34600000000?text=Hola', enlace: 'https://x/presupuesto/t', telefono: '34600000000' }
  assert.deepEqual(leerEnlaceAviso(200, ok), { mensaje: 'Hola', whatsapp: ok.whatsapp, enlace: ok.enlace, conTelefono: true })
  assert.equal(leerEnlaceAviso(200, { ...ok, whatsapp: 'https://malo.example/?text=x' }), null)
  assert.equal(leerEnlaceAviso(409, ok), null)
  assert.equal(leerEnlaceAviso(200, { ...ok, telefono: null })?.conTelefono, false)
})

test('nada sale solo: el correo pide confirmación y el WhatsApp abre la ventana en el clic', () => {
  const src = readFileSync(new URL('./EnviarAlCliente.tsx', import.meta.url), 'utf8')
  assert.match(src, /if \(!window\.confirm\(CONFIRMAR_CORREO\)\) return/)
  assert.match(src, /correo === 'con_email' && <button/)
  assert.doesNotMatch(src, /generarToken|generarCodigo/)
  // Antes de rotar se relee el servidor y se pregunta con su fecha.
  assert.match(src, /await releer\(\)\n    const pregunta = avisoRotacionActual\(\)\n    if \(pregunta && !window\.confirm\(pregunta\)\) return null/)
})
