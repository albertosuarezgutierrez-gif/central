import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeWhatsappLead, textoTelegramLead, TIPOS_SEGURO_LEAD, type AvisoLead } from './leads-web.ts'

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

test('saludo: nombre de pila con la regla compartida; si duda, sin nombre', () => {
  const saluda = (nombre: string) => mensajeWhatsappLead({ nombre, tipoSeguro: 'hogar' }).split(',')[0]
  assert.equal(saluda('MARÍA josé'), 'Hola María')
  assert.equal(saluda('Pérez García, María'), 'Hola') // coma: cortar daría el apellido
  assert.equal(saluda('M. José'), 'Hola') // inicial
  assert.equal(saluda('Talleres Ruiz SL'), 'Hola') // empresa
  assert.equal(saluda(''), 'Hola')
  assert.equal(saluda('   '), 'Hola')
  assert.match(mensajeWhatsappLead({ nombre: '', tipoSeguro: 'auto' }), /^Hola, soy Alberto, de Grupo ASegura/)
})

test('flota pide la documentación de vehículo', () => {
  const m = mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'flota' })
  assert.ok(m.includes('Grupo ASegura'))
  assert.ok(m.includes('permiso de circulación'))
  assert.ok(m.includes('por delante y por detrás'))
  assert.ok(m.includes('código postal'))
})

test('patinete eléctrico: sin permiso de circulación; marca/modelo, nacimiento y CP', () => {
  const m = mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'patinete-electrico' })
  assert.ok(m.includes('Grupo ASegura'))
  assert.ok(!m.includes('permiso de circulación') && !m.includes('carné'))
  assert.ok(m.includes('marca y el modelo'))
  assert.ok(m.includes('fecha de nacimiento'))
  assert.ok(m.includes('código postal'))
})

test('genérico: ninguna etiqueta queda como «seguro (seguro…»', () => {
  for (const t of TIPOS_SEGURO_LEAD) {
    const m = mensajeWhatsappLead({ nombre: 'Ana', tipoSeguro: t })
    assert.ok(!/seguro \(/i.test(m), t)
    assert.ok(!/seguro de seguro|seguro otro|seguro de otro/i.test(m), t)
  }
  const perro = mensajeWhatsappLead({ nombre: 'Ana', tipoSeguro: 'seguro-perro' })
  assert.ok(perro.includes('He visto tu solicitud: seguro de perro.'))
  assert.ok(mensajeWhatsappLead({ nombre: 'Ana', tipoSeguro: 'otros' }).includes('He visto tu solicitud: otro seguro.'))
})
