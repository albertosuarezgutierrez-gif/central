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
  // (idea 4: a un contacto la pregunta es otra, ver abajo; al tomador, la de siempre.)
  const pedir = src.slice(src.indexOf('async function pedirEnlace'), src.indexOf('function avisoRotacionActual'))
  assert.ok(pedir.indexOf('await releer()') > 0 && pedir.indexOf('await releer()') < pedir.indexOf('const pregunta = avisoRotacionActual()'))
  assert.match(pedir, /const pregunta = avisoRotacionActual\(\)\n\s*if \(pregunta && !window\.confirm\(pregunta\)\) return null/)
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
  assert.equal(l.tomadorJuridica, false) // asegura no lo dijo: no se inventa una empresa.
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

const VICTOR = { clienteId: 'v', nombre: 'Victor', relacion: 'Dueño', via: 'representacion' as const, email: 'v@x.es' }

test('🪤 confirmar a un contacto de EMPRESA: a quién, como contacto de la empresa, y que no podrá aceptarlo', () => {
  assert.match(confirmarCorreoContacto(VICTOR, { tomadorJuridica: true, rotacion: null }), /v@x\.es.*persona de contacto de la empresa \(no como tomador\): no podrá aceptarlo ni firmarlo\. ¿Enviar\?$/)
})

test('🪤 confirmar a un contacto de PERSONA FÍSICA: «persona autorizada por el tomador», nunca «de la empresa»', () => {
  const t = confirmarCorreoContacto({ ...VICTOR, via: 'autorizacion' }, { tomadorJuridica: false, rotacion: null })
  assert.match(t, /como persona autorizada por el tomador/)
  assert.doesNotMatch(t, /empresa/)
})

test('🪤 confirmar a un contacto avisa de que el enlace que ya tenga el TOMADOR deja de valer', () => {
  const t = confirmarCorreoContacto(VICTOR, { tomadorJuridica: true, rotacion: 'El cliente ya tiene un enlace del 20/10; generar uno nuevo invalida el anterior. ¿Seguir?' })
  assert.match(t, /El tomador ya tiene un enlace del 20\/10; generar uno nuevo invalida el anterior\. ¿Enviar\?$/)
  assert.doesNotMatch(t, /¿Seguir\?/)
})

test('🪤 el tipo del tomador para el texto lo dice asegura (`tomadorJuridica: true` explícito)', () => {
  const j = { estado: 'ok', destinatarios: { estado: 'contactos', elegibles: [{ clienteId: 'v', nombre: 'Victor', relacion: 'Dueño', via: 'representacion' }], noElegibles: [] }, emails: { v: 'v@x.es' }, tomadorJuridica: true }
  const l = leerDestinatarios(200, j)
  assert.equal(l?.estado === 'contactos' && l.tomadorJuridica, true)
  const l2 = leerDestinatarios(200, { ...j, tomadorJuridica: 'si' })
  assert.equal(l2?.estado === 'contactos' && l2.tomadorJuridica, false)
})

test('el correo a un contacto pide confirmación (con el aviso de rotación, releído) y manda el destinatario elegido, nada más', () => {
  const src = readFileSync(new URL('./EnviarAlCliente.tsx', import.meta.url), 'utf8')
  const f = src.slice(src.indexOf('async function porCorreoAContacto'), src.indexOf('async function yaMandado'))
  assert.ok(f.indexOf('await releer()') > 0 && f.indexOf('await releer()') < f.indexOf('window.confirm('))
  assert.match(f, /if \(!window\.confirm\(confirmarCorreoContacto\(elegido, \{ tomadorJuridica: destinos\?\.estado === 'contactos' && destinos\.tomadorJuridica, rotacion: avisoRotacionActual\(\) \}\)\)\) return/)
  assert.match(src, /accion: 'avisar', canal: 'email', destinatarioClienteId: elegido\.clienteId/)
})

// ─── WhatsApp a una persona de contacto (21/10/2026, idea 4) ─────────────────────────────────────────────────────────
// Para verlo en rojo: en `leerDestinatariosWhatsapp` copia `telefono` al elegible → falla «ningún teléfono»; en
// `EnviarAlCliente.tsx` quita `destinatarioClienteId: contacto.clienteId` → falla la del envío; o quita la confirmación.
test('🪤 el selector del WhatsApp: elegibles SIN teléfono (aunque viniera), no elegibles con su porqué, y «no se pudo leer» = null', async () => {
  const { leerDestinatariosWhatsapp, etiquetaTomadorWhatsapp } = await import('./enviar-cliente.ts')
  const j = {
    estado: 'ok', tomadorJuridica: true, movilTomador: 'con_movil', emails: {},
    destinatarios: { estado: 'contactos', elegibles: [{ clienteId: 'v', nombre: 'Victor', relacion: 'Dueño', via: 'representacion', telefono: '600000000' }], noElegibles: [{ clienteId: 'b', nombre: 'Berta', relacion: 'Accionista', motivo: 'sin_movil' }] },
  }
  const l = leerDestinatariosWhatsapp(200, j)
  assert.deepEqual(l?.elegibles, [{ clienteId: 'v', nombre: 'Victor', relacion: 'Dueño', via: 'representacion' }])
  assert.doesNotMatch(JSON.stringify(l), /600000000/)
  assert.equal(l?.noElegibles[0]?.motivo, 'sin_movil')
  assert.equal(l?.tomadorJuridica, true)
  assert.equal(l?.movilTomador, 'con_movil')
  assert.equal(leerDestinatariosWhatsapp(502, j), null)
  assert.equal(leerDestinatariosWhatsapp(200, { estado: 'error' }), null)
  assert.equal(leerDestinatariosWhatsapp(200, { ...j, movilTomador: 'raro' })?.movilTomador, 'no_se_sabe')
  assert.match(etiquetaTomadorWhatsapp('sin_movil'), /sin móvil válido/)
})

test('🪤 la confirmación del WhatsApp a un contacto dice a quién, como qué, que solo lo VE, que lo manda Alberto y la rotación', async () => {
  const { confirmarWhatsappContacto } = await import('./enviar-cliente.ts')
  const c = { clienteId: 'v', nombre: 'Victor', relacion: 'Dueño', via: 'representacion' as const }
  const t = confirmarWhatsappContacto(c, { tomadorJuridica: true, rotacion: 'El cliente ya tiene un enlace: dejará de abrir. ¿Seguir?' })
  assert.match(t, /Victor \(Dueño\)/)
  assert.match(t, /persona de contacto de la empresa/)
  assert.match(t, /no podrá aceptarlo ni firmarlo/)
  assert.match(t, /Lo mandas tú/)
  assert.match(t, /El enlace enviado antes \(a quien fuera\) deja de valer/)
  assert.doesNotMatch(t, /El tomador ya tiene/)
  assert.match(confirmarWhatsappContacto({ ...c, via: 'autorizacion' }, { tomadorJuridica: false, rotacion: null }), /persona autorizada por el tomador/)
})

test('🪤 el WhatsApp a un contacto pide confirmación (releída la rotación) y manda SU id con canal whatsapp; al tomador, sin id', () => {
  const src = readFileSync(new URL('./EnviarAlCliente.tsx', import.meta.url), 'utf8')
  const f = src.slice(src.indexOf('async function pedirEnlace'), src.indexOf('function avisoRotacionActual'))
  assert.ok(f.indexOf('await releer()') > 0 && f.indexOf('await releer()') < f.indexOf('confirmarWhatsappContacto('))
  assert.match(f, /if \(!window\.confirm\(confirmarWhatsappContacto\(contacto, \{ tomadorJuridica: destinosWa\?\.tomadorJuridica === true, rotacion: avisoRotacionActual\(\) \}\)\)\) return null/)
  assert.match(f, /\? \{ accion: 'avisar', canal: 'whatsapp_enlace', destinatarioClienteId: contacto\.clienteId \}\s*: \{ accion: 'avisar', canal: 'whatsapp_enlace' \}/)
  // La lectura del selector pide el canal WhatsApp; el teléfono no se pinta en ningún sitio.
  assert.match(src, /destinatarios\?clienteId=\$\{encodeURIComponent\(clienteId\)\}&canal=whatsapp/)
  assert.doesNotMatch(src, /\.telefono|\.movil\b/)
})

test('🪤 «Copiar enlace» con un contacto elegido pide el enlace CON ese contacto (marca de tercero), no el del tomador', () => {
  const src = readFileSync(new URL('./EnviarAlCliente.tsx', import.meta.url), 'utf8')
  const copiar = src.slice(src.indexOf('async function copiar()'), src.indexOf('async function whatsapp()'))
  assert.match(copiar, /pedirEnlace\(contactoWa\)/)
})
