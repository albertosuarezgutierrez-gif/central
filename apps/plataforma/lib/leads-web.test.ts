import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeWhatsappLead, textoTelegramLead, type AvisoLead } from './leads-web.ts'

const base: AvisoLead = {
  nombre: 'MARÍA josé',
  apellidos: 'Pérez',
  tipoSeguro: 'auto',
  telefono: '612 34 56 78',
  email: 'maria@example.com',
  comentario: null,
  ficha: null,
}

test('mensaje de auto: marca, nombre de pila y documentación', () => {
  const m = mensajeWhatsappLead({ nombre: 'MARÍA josé Pérez', tipoSeguro: 'auto' })
  assert.match(m, /^Hola María,/)
  assert.ok(!m.includes('Pérez') && !m.includes('José'))
  assert.ok(m.includes('soy Alberto, de Grupo ASegura'))
  assert.ok(m.includes('tu persona de contacto'))
  assert.ok(m.includes('permiso de circulación'))
  assert.ok(m.includes('carné de conducir (por delante y por detrás)'))
  assert.ok(m.includes('código postal'))
})

test('moto pide lo mismo que auto', () => {
  assert.ok(mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'moto' }).includes('permiso de circulación'))
})

test('mensaje genérico: otro ramo y sin ramo, sin documentación de vehículo', () => {
  for (const t of ['hogar', null, undefined] as const) {
    const m = mensajeWhatsappLead({ nombre: 'ana', tipoSeguro: t })
    assert.match(m, /^Hola Ana,/)
    assert.ok(m.includes('Grupo ASegura'))
    assert.ok(m.includes('te viene bien que te llame'))
    assert.ok(!m.includes('permiso de circulación'))
  }
  assert.ok(mensajeWhatsappLead({ nombre: 'x', tipoSeguro: 'hogar' }).includes('hogar'))
})

test('aviso: línea de WhatsApp justo tras el teléfono, con href escapado', () => {
  const l = textoTelegramLead(base).split('\n')
  const i = l.findIndex((x) => x.startsWith('📞'))
  assert.ok(i > 0)
  assert.match(l[i + 1], /^📲 <a href="https:\/\/wa\.me\/34612345678\?text=[^"]+">Escribir por WhatsApp<\/a>$/)
  assert.ok(l[i + 1].includes(encodeURIComponent('permiso de circulación')))
})

test('aviso: sin línea de WhatsApp con fijo, vacío o sin teléfono', () => {
  for (const telefono of ['954123456', '', null]) {
    const t = textoTelegramLead({ ...base, telefono })
    assert.ok(!t.includes('Escribir por WhatsApp'), String(telefono))
    assert.ok(!t.includes('wa.me'))
  }
})
