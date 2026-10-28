import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostPortalCliente, interpretarEnlaceDatos, LINEA_ENLACE_FICHA_EXISTENTE, LINEA_TOPE_LEADS_WEB, mensajeWhatsappLead, RAMO_OPORTUNIDAD_DE_LEAD, ramoEnlaceDatos, textoTelegramLead, TIPOS_SEGURO_LEAD, type AvisoLead } from './leads-web.ts'

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

test('enlace (25/10/2026): TODO ramo, ficha nueva o existente (esta, a ciegas), y un móvil con WhatsApp', () => {
  const nueva = { estado: 'nueva', id: 'x' } as const
  assert.deepEqual(ramoEnlaceDatos('auto', nueva, MOVIL), { ramo: 'auto', existente: false })
  assert.deepEqual(ramoEnlaceDatos('moto', nueva, '+34 712 345 678'), { ramo: 'moto', existente: false })
  assert.deepEqual(ramoEnlaceDatos('hogar', nueva, MOVIL), { ramo: 'hogar', existente: false })
  assert.deepEqual(ramoEnlaceDatos('flota', nueva, MOVIL), { ramo: 'flotas', existente: false })
  assert.deepEqual(ramoEnlaceDatos('seguro-perro', nueva, MOVIL), { ramo: 'mascotas', existente: false })
  assert.deepEqual(ramoEnlaceDatos('patinete-electrico', nueva, MOVIL), { ramo: 'patinete', existente: false })
  // Ficha que ya existía: SÍ (venta cruzada), marcada para que asegura lo genere a ciegas.
  assert.deepEqual(ramoEnlaceDatos('hogar', { estado: 'existente', id: 'x', nombre: 'Ana' }, MOVIL), { ramo: 'hogar', existente: true })
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
  // Sin enlace, el resto de ramos también conserva su texto de siempre.
  assert.ok(!mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'hogar' }).includes('/datos/'))
})

test('WhatsApp con enlace en TODO ramo: el enlace va dentro, con el riesgo nombrado y sin inventar nada del cliente', () => {
  for (const t of TIPOS_SEGURO_LEAD) {
    const m = mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: t, urlDatos: URL_OK })
    assert.ok(m.includes(URL_OK), t)
    assert.ok(m.includes('rellena este formulario'), t)
  }
  assert.equal(
    mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'hogar', urlDatos: URL_OK }),
    `Hola Luis, soy Alberto, de Grupo ASegura, tu persona de contacto. He visto tu solicitud de seguro de hogar. Para prepararte la propuesta, rellena este formulario (2 minutos: la dirección, si es tuya o alquilada, si hay hipoteca y tu seguro actual si lo tienes; puedes subir tu póliza): ${URL_OK}. Si lo prefieres, dime cuándo te viene bien que te llame. Gracias.`,
  )
  // Que el lead pida hogar no dice nada del banco: no se afirma certificado ni hipoteca.
  assert.doesNotMatch(mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'hogar', urlDatos: URL_OK }), /certificado|tu hipoteca|tu banco/i)
  assert.match(mensajeWhatsappLead({ nombre: 'Luis', tipoSeguro: 'comunidades', urlDatos: URL_OK }), /solicitud de seguro para tu comunidad\. Para prepararte la propuesta, rellena este formulario \(2 minutos\):/)
  assert.equal(Object.keys(RAMO_OPORTUNIDAD_DE_LEAD).length, TIPOS_SEGURO_LEAD.length)
})

test('aviso de una ficha que YA EXISTÍA con enlace: pide comprobar el teléfono antes de mandarlo', () => {
  const ex = { ...base, tipoSeguro: 'hogar' as const, ficha: { id: 'f1', nueva: false, nombre: 'Ana Pérez' }, urlDatos: URL_OK }
  const t = textoTelegramLead(ex)
  assert.ok(t.includes(LINEA_ENLACE_FICHA_EXISTENTE))
  assert.ok(t.includes(encodeURIComponent(URL_OK)))
  assert.ok(!textoTelegramLead({ ...ex, urlDatos: null }).includes(LINEA_ENLACE_FICHA_EXISTENTE))
  assert.ok(!textoTelegramLead({ ...base, ficha: { id: 'n', nueva: true, nombre: 'Ana' }, urlDatos: URL_OK }).includes(LINEA_ENLACE_FICHA_EXISTENTE), 'ficha nueva: sin la línea')
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

// ─── Prueba del consentimiento y atribución (17/10/2026) ────────────────────
import {
  cuerpoAltaLead,
  FINALIDAD_LEAD,
  lineaConsentimientoContacto,
  revisarAtribucion,
  revisarLeadWeb,
  truncarIp,
} from './leads-web.ts'

const formulario = {
  nombre: 'Ana',
  telefono: '612345678',
  tipoSeguro: 'hogar',
  consentimiento: true,
  consentimiento_version: 'privacidad-2026-10-17',
  comunicaciones_comerciales: false,
  atribucion: { utm_source: 'google', gclid: 'Cj0K_a-1', landing: '/seguros/hogar?x=1', email: 'ana@x.es', referrer: 'https://www.google.com/search?q=ana' },
}

test('lead SIN consentimiento sigue rechazándose (también con versión y comerciales)', () => {
  for (const c of [undefined, false, 'true', 1, 'on']) {
    const r = revisarLeadWeb({ ...formulario, consentimiento: c, comunicaciones_comerciales: true })
    assert.equal(r.ok, false, `consentimiento=${String(c)} no puede pasar`)
    if (!r.ok) assert.equal(r.campo, 'consentimiento')
  }
})

test('la casilla de comerciales NO sustituye al consentimiento obligatorio', () => {
  const r = revisarLeadWeb({ ...formulario, consentimiento: undefined, comunicaciones_comerciales: true })
  assert.equal(r.ok, false)
})

test('versión y fecha del SERVIDOR se pasan al puerto, con finalidad, comerciales e IP /24', () => {
  const r = revisarLeadWeb(formulario)
  assert.ok(r.ok)
  const ahora = new Date('2026-10-17T10:11:12.000Z')
  const body = cuerpoAltaLead(r.lead, { ahora, ip: '203.0.113.77' })
  assert.equal(body.fuente, 'web')
  assert.deepEqual(body.consentimiento, {
    version: 'privacidad-2026-10-17',
    at: '2026-10-17T10:11:12.000Z',
    finalidad: FINALIDAD_LEAD,
    comunicaciones_comerciales: false,
    ip_truncada: '203.0.113.0',
  })
  assert.deepEqual(body.atribucion, { utm_source: 'google', gclid: 'Cj0K_a-1', landing: '/seguros/hogar', referrer: 'https://www.google.com' })
  assert.ok(!JSON.stringify(body).includes('203.0.113.77'), 'la IP completa no viaja')
})

test('una fecha que mande el navegador se ignora: manda la del servidor', () => {
  const r = revisarLeadWeb({ ...formulario, consentimiento_at: '2001-01-01T00:00:00.000Z' })
  assert.ok(r.ok)
  const body = cuerpoAltaLead(r.lead, { ahora: new Date('2026-10-17T00:00:00.000Z'), ip: null })
  assert.equal((body.consentimiento as { at: string }).at, '2026-10-17T00:00:00.000Z')
})

test('web vieja (sin versión ni casilla) → null = no informado, y el lead pasa', () => {
  const r = revisarLeadWeb({ nombre: 'Ana', telefono: '612345678', tipoSeguro: 'hogar', consentimiento: true })
  assert.ok(r.ok)
  assert.equal(r.lead.consentimientoVersion, null)
  assert.equal(r.lead.comunicacionesComerciales, null)
  assert.equal(r.lead.atribucion, null)
  assert.match(lineaConsentimientoContacto(r.lead, new Date('2026-10-17T00:00:00.000Z')), /versión no informada.*comerciales: no informado/)
})

test('versión con forma rara no se guarda', () => {
  const r = revisarLeadWeb({ ...formulario, consentimiento_version: 'privacidad-2026-10-17<script>' })
  assert.ok(r.ok)
  assert.equal(r.lead.consentimientoVersion, null)
})

test('atribución: clave no permitida fuera, PII y largos saneados', () => {
  assert.deepEqual(
    revisarAtribucion({ utm_source: 'a'.repeat(300), utm_medium: 'x@y.es', utm_term: '600 111 222', nif: '1Z', fbclid: 'IwAR<1>' }),
    { utm_source: 'a'.repeat(100) },
  )
  assert.equal(revisarAtribucion({ utm_source: 'a'.repeat(5000) }), null)
  assert.equal(revisarAtribucion('utm_source=x'), null)
})

test('truncarIp: /24 y /48; basura → null', () => {
  assert.equal(truncarIp('81.45.200.13'), '81.45.200.0')
  assert.equal(truncarIp('2001:db8:85a3:1:2:3:4:5'), '2001:db8:85a3::')
  assert.equal(truncarIp('2001:db8::1'), '2001:db8:0::')
  assert.equal(truncarIp('999.1.1.1'), null)
  assert.equal(truncarIp('unknown'), null)
  assert.equal(truncarIp(null), null)
})

test('28/10/2026: el lead web «patinete-electrico» abre oportunidad de ramo PROPIO `patinete`, no «otros»', async () => {
  const { RAMOS_OPORTUNIDAD } = await import('@central/module-seguros')
  assert.equal(RAMO_OPORTUNIDAD_DE_LEAD['patinete-electrico'], 'patinete')
  // Todo destino es un ramo de oportunidad real (el puerto rechaza el resto con 422).
  for (const t of TIPOS_SEGURO_LEAD) assert.ok((RAMOS_OPORTUNIDAD as readonly string[]).includes(RAMO_OPORTUNIDAD_DE_LEAD[t]), t)
  // Solo «otros» cae en «otros»: un ramo web con ramo propio que vuelva a degradarse se ve aquí.
  assert.deepEqual(TIPOS_SEGURO_LEAD.filter((t) => RAMO_OPORTUNIDAD_DE_LEAD[t] === 'otros'), ['otros'])
})
