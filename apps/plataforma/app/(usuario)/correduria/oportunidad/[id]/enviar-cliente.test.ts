// 🪤 «Enviar al cliente» (21/10/2026). Para verlo en rojo: en `correoDelTomador` trata `emailIlegible` como «sin correo»
// → falla «ilegible = no se sabe»; o en `leerEnlaceAviso` acepta cualquier URL → falla «solo wa.me».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cabeceraDestinatarios, confirmarCorreoContacto, correoDelTomador, etiquetaDescartado, leerDestinatarios, leerEnlaceAviso } from './enviar-cliente.ts'

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

// 🪤 Persona de contacto (21/10/2026). Para verlo en rojo: en `leerDestinatarios` acepta un elegible sin correo en `emails`
// → falla «sin dirección no se elige»; o devuelve `{ estado:'nadie' }` cuando el puerto falla → falla «no se pudo leer».
test('🪤 destinatarios: solo los elegibles con correo al selector; los demás, aparte y con su porqué', () => {
  const j = {
    estado: 'ok',
    destinatarios: {
      estado: 'contactos',
      elegibles: [{ clienteId: 'v', nombre: 'Victor', relacion: 'Dueño', via: 'representacion' }, { clienteId: 'z', nombre: 'Zoe', relacion: 'Administración', via: 'representacion' }],
      noElegibles: [{ clienteId: 'b', nombre: 'Berta', relacion: 'Accionista', motivo: 'relacion_no_habilita' }, { clienteId: 'q', motivo: 'inventado' }],
    },
    emails: { v: 'v@x.es' },
  }
  const l = leerDestinatarios(200, j)
  assert.equal(l?.estado, 'contactos')
  if (l?.estado !== 'contactos') return
  assert.deepEqual(l.elegibles.map((e) => e.clienteId), ['v']) // Zoe sin correo a la vista: no se elige a ciegas.
  assert.deepEqual(l.noElegibles.map((e) => e.clienteId), ['b']) // un motivo desconocido no se pinta.
  assert.match(cabeceraDestinatarios(l), /personas de contacto con correo: Victor \(Dueño\)/)
  assert.match(etiquetaDescartado(l.noElegibles[0]!), /Berta \(Accionista\): no es dueño, administrador ni representante, ni tiene permiso para ver sus pólizas/)
  assert.match(confirmarCorreoContacto(l.elegibles[0]!), /v@x\.es.*persona de contacto de la empresa \(no como tomador\)/)
  // Si ninguno tiene correo a la vista, es «nadie».
  assert.equal(leerDestinatarios(200, { ...j, emails: {} })?.estado, 'nadie')
})

test('🪤 destinatarios: un fallo del puerto es «no se pudo leer», nunca «nadie»', () => {
  assert.equal(leerDestinatarios(502, { estado: 'error' }), null)
  assert.equal(leerDestinatarios(200, { estado: 'ok' }), null)
  assert.equal(leerDestinatarios(200, { estado: 'ok', destinatarios: { estado: 'contactos' } }), null)
  assert.match(cabeceraDestinatarios(null), /no se han podido leer/)
  assert.deepEqual(leerDestinatarios(200, { estado: 'ok', destinatarios: { estado: 'tomador_baja' } }), { estado: 'tomador_baja' })
})

test('el correo a un contacto pide confirmación y manda el destinatario elegido, nada más', () => {
  const src = readFileSync(new URL('./EnviarAlCliente.tsx', import.meta.url), 'utf8')
  assert.match(src, /if \(!window\.confirm\(confirmarCorreoContacto\(elegido\)\)\) return/)
  assert.match(src, /accion: 'avisar', canal: 'email', destinatarioClienteId: elegido\.clienteId/)
})
