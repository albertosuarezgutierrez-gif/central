import { test } from 'node:test'
import assert from 'node:assert'
import {
  parseGuestAppUrl, htmlATexto, normalizarSecciones, esSeccionDeAcceso,
  seccionesVigentes, seccionesATexto, type SeccionGuia,
} from './guest-app.ts'

// ── parseGuestAppUrl ────────────────────────────────────────────────────────
test('extrae token y bookingId del enlace de la guest app', () => {
  assert.deepEqual(
    parseGuestAppUrl('https://guest.smoobu.com/?t=abc123&b=152291091'),
    { token: 'abc123', bookingId: '152291091' },
  )
})

test('acepta los nombres largos de parámetro', () => {
  assert.deepEqual(
    parseGuestAppUrl('https://guest.smoobu.com/?token=abc123&bookingId=99'),
    { token: 'abc123', bookingId: '99' },
  )
})

test('devuelve null si falta el token o la reserva', () => {
  assert.equal(parseGuestAppUrl('https://guest.smoobu.com/?b=1'), null)
  assert.equal(parseGuestAppUrl(''), null)
  assert.equal(parseGuestAppUrl('no-es-una-url'), null)
})

// ── htmlATexto ──────────────────────────────────────────────────────────────
test('convierte enlaces a "texto (url)" para no perder la URL', () => {
  const html = '<p>Reserva tu consigna: <b><a href="https://ejemplo.com/x" target="_blank">HERE&nbsp;</a></b></p>'
  assert.equal(htmlATexto(html), 'Reserva tu consigna: HERE (https://ejemplo.com/x)')
})

test('respeta los saltos de párrafo y de línea', () => {
  assert.equal(htmlATexto('<p>uno</p><p>dos<br>tres</p>'), 'uno\ndos\ntres')
})

test('descodifica las entidades más comunes y colapsa espacios', () => {
  assert.equal(htmlATexto('<p>Nº&nbsp;7 &amp;  ss</p>'), 'Nº 7 & ss')
})

test('un enlace sin texto visible deja solo la url', () => {
  assert.equal(htmlATexto('<a href="https://ejemplo.com/v"></a>'), 'https://ejemplo.com/v')
})

// ── normalizarSecciones ─────────────────────────────────────────────────────
// Forma REAL de la respuesta de /api-guest/bookings/{id}/contents (capturada del Dúplex el
// 20/08/2026). Los valores sensibles van cambiados; la estructura es la de producción.
const CRUDO = [
  { id: 15593, title: 'KEYS - DUPLEX', content: '<p>STREET JAVIER LASSO DE LA VEGA Nº 7</p><p>IMPORTANT: RESTRICTED AREA DO NOT USE GOOGLE MAPS OR GPS</p><p><a href="https://ejemplo.com/video">EXPLANATORY VIDEO</a></p>', displayTimePeriods: [2, 4], active: true },
  { id: 15587, title: 'WIFI (DUPLEX)', content: '<p>WIFI: red-de-prueba&nbsp; Password:CLAVE-DE-PRUEBA</p>', displayTimePeriods: [2, 4], active: true },
  { id: 16802, title: 'MEJORES BARES', content: '<p>¿DONDE COMER?</p>', displayTimePeriods: [2, 4, 8], active: true },
  { id: 99999, title: 'SECCIÓN APAGADA', content: '<p>nada</p>', displayTimePeriods: [2], active: false },
]

test('normaliza id, título, texto y periodos, y descarta las inactivas', () => {
  const s = normalizarSecciones(CRUDO)
  assert.equal(s.length, 3)
  assert.equal(s[0].id, '15593')
  assert.equal(s[0].titulo, 'KEYS - DUPLEX')
  assert.match(s[0].texto, /RESTRICTED AREA DO NOT USE GOOGLE MAPS/)
  assert.match(s[0].texto, /EXPLANATORY VIDEO \(https:\/\/ejemplo\.com\/video\)/)
  assert.deepEqual(s[0].periodos, [2, 4])
})

test('aguanta basura sin reventar', () => {
  assert.deepEqual(normalizarSecciones(null), [])
  assert.deepEqual(normalizarSecciones([{ title: '', content: '' }]), [])
})

// ── esSeccionDeAcceso ───────────────────────────────────────────────────────
test('marca como acceso las secciones de llaves y códigos', () => {
  assert.equal(esSeccionDeAcceso('KEYS - DUPLEX', 'lockbox 1234'), true)
  assert.equal(esSeccionDeAcceso('LLAVES', 'la caja está en el portal'), true)
  assert.equal(esSeccionDeAcceso('CÓMO ENTRAR', 'el código del portal es 4471'), true)
})

test('marca como acceso cualquier sección con contraseña, aunque el título no lo diga', () => {
  assert.equal(esSeccionDeAcceso('WIFI (DUPLEX)', 'WIFI: red Password:ABCD1234'), true)
})

test('no marca como acceso lo que es información pública del barrio', () => {
  assert.equal(esSeccionDeAcceso('MEJORES BARES', '¿Dónde comer? En la Alfalfa'), false)
  assert.equal(esSeccionDeAcceso('WHERE TO DISPOSE OF THE GARBAGE?', 'Calle Martín Villa'), false)
  assert.equal(esSeccionDeAcceso('RULES', 'No fumar. Check out 11am.'), false)
})

// ── seccionesVigentes ───────────────────────────────────────────────────────
const S = (titulo: string, periodos: number[], esAcceso: boolean): SeccionGuia =>
  ({ id: titulo, titulo, texto: `texto de ${titulo}`, periodos, esAcceso })

const KEYS = S('KEYS', [2, 4], true)
const BARES = S('BARES', [2, 4, 8], false)
const RULES = S('RULES', [2, 4], false)

test('a 3 meses de la llegada oculta el acceso pero deja el resto', () => {
  const r = seccionesVigentes([KEYS, BARES, RULES], { hoy: '2026-05-20', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.deepEqual(r.secciones.map(s => s.titulo), ['BARES', 'RULES'])
  assert.equal(r.accesoOculto, true)
})

test('dentro de la ventana de 7 días ya enseña el acceso', () => {
  const r = seccionesVigentes([KEYS, BARES, RULES], { hoy: '2026-08-15', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.deepEqual(r.secciones.map(s => s.titulo), ['KEYS', 'BARES', 'RULES'])
  assert.equal(r.accesoOculto, false)
})

test('el día 7 justo entra en la ventana', () => {
  const r = seccionesVigentes([KEYS], { hoy: '2026-08-13', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.equal(r.secciones.length, 1)
})

test('durante la estancia sigue enseñando el acceso', () => {
  const r = seccionesVigentes([KEYS, BARES], { hoy: '2026-08-21', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.deepEqual(r.secciones.map(s => s.titulo), ['KEYS', 'BARES'])
})

test('después del check-out cae el acceso y quedan solo las secciones marcadas para después', () => {
  const r = seccionesVigentes([KEYS, BARES, RULES], { hoy: '2026-08-25', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.deepEqual(r.secciones.map(s => s.titulo), ['BARES'])
  assert.equal(r.accesoOculto, false)
})

test('sin periodos declarados la sección se considera siempre vigente', () => {
  const r = seccionesVigentes([S('SIN PERIODOS', [], false)], { hoy: '2026-08-25', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.equal(r.secciones.length, 1)
})

// ── seccionesATexto ─────────────────────────────────────────────────────────
test('renderiza cada sección con su título como cabecera', () => {
  const txt = seccionesATexto([
    { id: '1', titulo: 'KEYS', texto: 'la caja está en el portal', periodos: [], esAcceso: true },
    { id: '2', titulo: 'RULES', texto: 'no fumar', periodos: [], esAcceso: false },
  ])
  assert.equal(txt, '## KEYS\nla caja está en el portal\n\n## RULES\nno fumar')
})

test('sin secciones devuelve cadena vacía', () => {
  assert.equal(seccionesATexto([]), '')
})
