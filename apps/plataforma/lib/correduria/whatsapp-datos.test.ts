import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoTrasWhatsapp, enlaceDeRespuestaSolicitud, motivoSinWhatsapp, prepararWhatsappDatos } from './whatsapp-datos.ts'

const base = { telefono: '612 34 56 78', nombre: 'Mari Angeles Pérez', ramo: 'hogar' as string | null }

test('con enlace: wa.me al móvil normalizado, con el enlace al formulario y saludo por el nombre de pila', () => {
  const r = prepararWhatsappDatos({ ...base, url: 'https://portal.example/datos/tok' })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.ok(r.href.startsWith('https://wa.me/34612345678?text='))
  const texto = decodeURIComponent(r.href.split('?text=')[1])
  assert.equal(texto, r.mensaje)
  assert.match(texto, /^Hola Mari,/)
  assert.match(texto, /https:\/\/portal\.example\/datos\/tok/)
  assert.equal(r.conEnlace, true)
})

test('sin enlace: lista los datos mínimos del catálogo y dice conEnlace=false; un enlace no https se descarta', () => {
  for (const url of [null, 'javascript:alert(1)', 'http://x/datos/a']) {
    const r = prepararWhatsappDatos({ ...base, ramo: 'auto', url })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.conEnlace, false)
    assert.match(r.mensaje, /Matrícula/)
    assert.doesNotMatch(r.mensaje, /javascript:|http:/)
  }
})

test('sin nombre saluda a secas', () => {
  const r = prepararWhatsappDatos({ ...base, nombre: null, url: null })
  assert.ok(r.ok && r.mensaje.startsWith('Hola, soy'))
})

test('sin teléfono, fijo o ramo sin formulario: NO hay wa.me, hay motivo', () => {
  for (const telefono of [null, undefined, '', '   ', '954 12 34 56']) {
    const r = prepararWhatsappDatos({ ...base, telefono, url: null })
    assert.equal(r.ok, false, String(telefono))
    if (!r.ok) assert.ok(r.motivo.length > 0)
  }
  assert.equal(motivoSinWhatsapp('612345678', 'hogar'), null)
  assert.match(motivoSinWhatsapp(null, 'hogar') ?? '', /teléfono/i)
  assert.match(motivoSinWhatsapp('612345678', 'no_es_un_ramo') ?? '', /ramo/i)
  assert.equal(prepararWhatsappDatos({ ...base, ramo: null, url: null }).ok, false)
})

test('🪤 el mensaje no lleva DNI, IBAN ni nº de póliza', () => {
  for (const ramo of ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos']) {
    const r = prepararWhatsappDatos({ ...base, ramo, url: null })
    assert.ok(r.ok)
    if (r.ok) assert.doesNotMatch(r.mensaje, /\bDNI\b|\bNIE\b|IBAN|nº de póliza|\d{8}[A-Z]/i, ramo)
  }
})

// 26/10/2026 (lead de hogar de Beatriz): con un enlace vivo, el botón salía SIN enlace y la pantalla lo daba por bueno.
test('enlace de la respuesta: 200 con url (reemitido) vale; 200 sin url ya NO es «había uno vivo», es un fallo con motivo', () => {
  assert.deepEqual(enlaceDeRespuestaSolicitud(200, { estado: 'ok', reemitida: true, url: 'https://p/datos/t' }), { url: 'https://p/datos/t', motivo: null })
  assert.deepEqual(enlaceDeRespuestaSolicitud(201, { url: 'https://p/datos/t' }), { url: 'https://p/datos/t', motivo: null })
  assert.equal(enlaceDeRespuestaSolicitud(200, { estado: 'ok', url: null }).url, null)
  assert.match(enlaceDeRespuestaSolicitud(200, { estado: 'ok', url: null }).motivo ?? '', /no ha devuelto el enlace/)
  assert.equal(enlaceDeRespuestaSolicitud(409, { motivo: 'La oportunidad está ganada.' }).motivo, 'La oportunidad está ganada.')
  assert.equal(enlaceDeRespuestaSolicitud(503, null).motivo, 'HTTP 503')
  assert.equal(enlaceDeRespuestaSolicitud(0, null).motivo, 'sin conexión')
  assert.equal(enlaceDeRespuestaSolicitud(200, { url: 'http://p/datos/t' }).url, null)
})

test('aviso: sin enlace dice «No se pudo generar el enlace» y nunca «envíalo tú» a secas', () => {
  const malo = avisoTrasWhatsapp({ conEnlace: false, motivoSinEnlace: 'HTTP 503', notaStatus: 200 })
  assert.match(malo, /^No se pudo generar el enlace/)
  assert.match(malo, /HTTP 503/)
  assert.doesNotMatch(malo, /^Revisa el mensaje y envíalo tú/)
  assert.equal(avisoTrasWhatsapp({ conEnlace: true, motivoSinEnlace: null, notaStatus: 200 }), 'Revisa el mensaje y envíalo tú.')
  assert.match(avisoTrasWhatsapp({ conEnlace: true, motivoSinEnlace: null, notaStatus: 502 }), /No se ha anotado en el historial \(HTTP 502\)/)
})
