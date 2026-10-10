import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostPortalCliente, interpretarEnlaceDatos, LINEA_TOPE_LEADS_WEB, mensajeWhatsappLead, ramoEnlaceDatos, textoTelegramLead, TIPOS_SEGURO_LEAD, type AvisoLead } from './leads-web.ts'

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

// ─── Enlace al formulario de datos (06/10/2026) ──────────────────────────────

const URL_OK = `https://clientes.grupoasegura.es/datos/${'a'.repeat(43)}`

const MOVIL = '612 34 56 78'
const HOST = 'clientes.grupoasegura.es'

test('enlace: solo ficha NUEVA, ramo auto/moto y un móvil con WhatsApp', () => {
  const nueva = { estado: 'nueva', id: 'x' } as const
  assert.equal(ramoEnlaceDatos('auto', nueva, MOVIL), 'auto')
  assert.equal(ramoEnlaceDatos('moto', nueva, '+34 712 345 678'), 'moto')
  for (const t of ['hogar', 'flota', 'patinete-electrico', 'otros'] as const) assert.equal(ramoEnlaceDatos(t, nueva, MOVIL), null, t)
  // Ficha que ya existía: NUNCA (la página enseñaría su DNI a quien tecleó su email).
  assert.equal(ramoEnlaceDatos('auto', { estado: 'existente', id: 'x', nombre: 'Ana' }, MOVIL), null)
  assert.equal(ramoEnlaceDatos('auto', { estado: 'no_registrado', motivo: 'red' }, MOVIL), null)
  assert.equal(ramoEnlaceDatos('moto', { estado: 'rechazado', motivo: 'x' }, MOVIL), null)
})

test('enlace: sin móvil (fijo, vacío, sin teléfono) no se crea nada: no le llegaría nunca', () => {
  const nueva = { estado: 'nueva', id: 'x' } as const
  for (const tel of ['954123456', '', null, '123']) assert.equal(ramoEnlaceDatos('auto', nueva, tel), null, String(tel))
})

test('respuesta del puerto: 201 con URL del portal = enlace; todo lo demás, sin enlace (y el tope se distingue)', () => {
  assert.deepEqual(interpretarEnlaceDatos(201, { estado: 'ok', url: URL_OK }, HOST), { estado: 'ok', url: URL_OK })
  assert.deepEqual(interpretarEnlaceDatos(429, { estado: 'tope' }, HOST), { estado: 'tope' })
  for (const [st, j] of [
    [201, { estado: 'ok', url: null }], // ya había una viva: su token no se puede volver a dar
    [201, { estado: 'ok', url: 'http://clientes.grupoasegura.es/datos/' + 'a'.repeat(43) }],
    [201, { estado: 'ok', url: 'https://malo.example/otra/' + 'a'.repeat(43) }],
    [201, { estado: 'ok', url: URL_OK + '"><b>x' }],
    [502, { estado: 'error', motivo: 'red' }],
    [409, { estado: 'no_apta' }],
    [503, null],
  ] as const) assert.deepEqual(interpretarEnlaceDatos(st, j, HOST), { estado: 'sin_enlace' }, JSON.stringify(j))
})

test('host ajeno con la ruta y el token correctos: se rechaza (solo el host exacto del portal)', () => {
  const token = 'b'.repeat(43)
  for (const url of [
    `https://evil.example/datos/${token}`,
    `https://clientes.grupoasegura.es.evil.example/datos/${token}`,
    `https://user@clientes.grupoasegura.es/datos/${token}`,
    `https://grupoasegura.es/datos/${token}`,
  ]) assert.deepEqual(interpretarEnlaceDatos(201, { estado: 'ok', url }, HOST), { estado: 'sin_enlace' }, url)
  // El host lo marca la configuración del portal, no la respuesta.
  assert.deepEqual(interpretarEnlaceDatos(201, { estado: 'ok', url: `https://portal.test/datos/${token}` }, 'portal.test').estado, 'ok')
  assert.equal(hostPortalCliente(undefined), HOST)
  assert.equal(hostPortalCliente('https://Portal.Test/'), 'portal.test')
  assert.equal(hostPortalCliente('no es url'), HOST)
})

test('WhatsApp con enlace: texto acordado, marca exacta, sin pedir las fotos por aquí primero', () => {
  const m = mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'auto', urlDatos: URL_OK })
  assert.equal(
    m,
    `Hola Luis, soy Alberto, de Grupo ASegura, tu persona de contacto. He visto tu solicitud de seguro de auto. Para prepararte la propuesta, rellena este formulario (2 minutos, puedes subir foto del permiso de circulación y del carné): ${URL_OK}. Si lo prefieres, mándamelas por aquí. Gracias.`,
  )
  assert.ok(mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'moto', urlDatos: URL_OK }).includes('seguro de moto. Para prepararte la propuesta, rellena este formulario'))
})

test('WhatsApp sin enlace (null o ausente): el texto de siempre, idéntico', () => {
  for (const t of ['auto', 'moto'] as const) {
    const antes = mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: t })
    assert.equal(mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: t, urlDatos: null }), antes)
    assert.ok(antes.includes('¿me puedes enviar una foto del permiso de circulación'))
    assert.ok(!antes.includes('formulario'))
  }
  // Otro ramo con URL (no debería darse): la URL no se cuela.
  assert.ok(!mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'hogar', urlDatos: URL_OK }).includes('/datos/'))
})

test('aviso: el enlace viaja dentro del WhatsApp; el tope se dice en una línea', () => {
  const con = textoTelegramLead({ ...base, urlDatos: URL_OK })
  assert.ok(con.includes(encodeURIComponent(URL_OK)))
  assert.ok(!con.includes(LINEA_TOPE_LEADS_WEB))
  const tope = textoTelegramLead({ ...base, topeLeadsWeb: true })
  assert.ok(tope.includes(LINEA_TOPE_LEADS_WEB))
  assert.ok(tope.includes(encodeURIComponent('¿me puedes enviar una foto del permiso de circulación')))
  assert.equal(LINEA_TOPE_LEADS_WEB, '⚠️ tope diario de leads web alcanzado: formulario no generado')
})
