// Guardián del canal de leads WEB de la correduría (`apps/plataforma/lib/leads-web.ts`).
// Puro: sin red. Lo que fija:
//   - un formulario vale con nombre + (teléfono o email) + consentimiento; el honeypot
//     relleno es `bot` y NO es un error de datos;
//   - la respuesta del puerto se lee en TRES estados (nueva · existente · no registrado)
//     y un 409 forzable NUNCA se convierte en un alta forzada;
//   - el aviso de Telegram escapa lo tecleado, enlaza a la ficha y, sin ficha, lo DICE.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPO_HONEYPOT,
  MOTIVO_BOT,
  TIPOS_SEGURO_LEAD,
  interpretarAltaLead,
  notasAlta,
  revisarLeadWeb,
  textoHistorialContacto,
  textoTelegramLead,
  urlFichaCliente,
} from '../apps/plataforma/lib/leads-web.ts'
import { rateLimit } from '../apps/plataforma/lib/rate-limit.ts'

const OK = { nombre: ' Ana ', apellidos: 'López  Pérez', telefono: '600 12 34 56', email: 'ANA@X.ES', tipoSeguro: 'auto', comentario: ' Golf 2019 ', consentimiento: true }

test('formulario válido: normaliza nombre, teléfono y email; comentario recortado', () => {
  const r = revisarLeadWeb(OK)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.lead, { nombre: 'Ana', apellidos: 'López Pérez', telefono: '600123456', email: 'ana@x.es', tipoSeguro: 'auto', comentario: 'Golf 2019' })
})

test('nombre obligatorio; teléfono O email; consentimiento === true; tipo de la lista', () => {
  const sinNombre = revisarLeadWeb({ ...OK, nombre: '' })
  assert.equal(sinNombre.ok, false)
  if (!sinNombre.ok) assert.equal(sinNombre.campo, 'nombre')
  const sinContacto = revisarLeadWeb({ ...OK, telefono: '', email: '' })
  assert.equal(sinContacto.ok, false)
  const soloEmail = revisarLeadWeb({ ...OK, telefono: '' })
  assert.equal(soloEmail.ok, true)
  const telMal = revisarLeadWeb({ ...OK, telefono: '123' })
  assert.equal(telMal.ok, false)
  if (!telMal.ok) assert.equal(telMal.campo, 'telefono')
  const sinConsent = revisarLeadWeb({ ...OK, consentimiento: 'true' })
  assert.equal(sinConsent.ok, false)
  if (!sinConsent.ok) assert.equal(sinConsent.campo, 'consentimiento')
  const tipoMal = revisarLeadWeb({ ...OK, tipoSeguro: 'barco' })
  assert.equal(tipoMal.ok, false)
  if (!tipoMal.ok) assert.equal(tipoMal.campo, 'tipoSeguro')
  const largo = revisarLeadWeb({ ...OK, comentario: 'x'.repeat(1001) })
  assert.equal(largo.ok, false)
  assert.equal(revisarLeadWeb(null).ok, false)
  assert.equal(revisarLeadWeb([]).ok, false)
  assert.ok(TIPOS_SEGURO_LEAD.includes('hogar'))
})

test('🚨 honeypot relleno = bot, y se distingue de un formulario mal rellenado', () => {
  const r = revisarLeadWeb({ ...OK, [CAMPO_HONEYPOT]: 'http://spam' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.motivo, MOTIVO_BOT)
  const vacio = revisarLeadWeb({ ...OK, [CAMPO_HONEYPOT]: '' })
  assert.equal(vacio.ok, true, 'el honeypot vacío (lo que manda un navegador) no es un bot')
})

test('notas del alta e historial del contacto llevan qué quiere y cómo llamarle (sin DNI)', () => {
  const r = revisarLeadWeb(OK)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(notasAlta(r.lead), 'Quiere: auto. Golf 2019')
  assert.equal(textoHistorialContacto(r.lead), 'Contacto por formulario web (Ana López Pérez): quiere auto. Golf 2019 · Tel. 600123456 · Email ana@x.es')
})

test('🚨 tres estados: nueva · existente (409 forzable NO se fuerza) · no registrado', () => {
  assert.deepEqual(interpretarAltaLead({ estado: 'ok', id: 'c1', contacto: null, contactos: null }), { estado: 'nueva', id: 'c1' })
  const existente = interpretarAltaLead({ estado: 'conflicto', forzable: true, coincidencias: [{ id: 'c9', nombre: 'Ana López', por: 'telefono', tipo: 'cliente' }] })
  assert.deepEqual(existente, { estado: 'existente', id: 'c9', nombre: 'Ana López' })
  const dni = interpretarAltaLead({ estado: 'conflicto', forzable: false, coincidencias: [{ id: 'c9', nombre: 'Ana López', por: 'dni', tipo: 'cliente' }] })
  assert.equal(dni.estado, 'rechazado')
  assert.equal(interpretarAltaLead({ estado: 'invalido', motivo: 'Email no válido.', campo: 'email' }).estado, 'rechazado')
  assert.equal(interpretarAltaLead({ estado: 'sin_configurar' }).estado, 'no_registrado')
  assert.equal(interpretarAltaLead({ estado: 'error', motivo: 'red' }).estado, 'no_registrado')
  const okSinId = interpretarAltaLead({ estado: 'ok', id: null, contacto: null, contactos: null })
  assert.equal(okSinId.estado, 'no_registrado', 'un ok sin id no es una ficha: no hay a qué enlazar')
})

test('el Telegram escapa el HTML, enlaza a la ficha y sin ficha lo dice en vez de callarse', () => {
  const base = { nombre: 'Ana <b>x</b>', tipoSeguro: 'auto' as const, telefono: '600123456', email: 'ana@x.es', comentario: 'a & b' }
  const nueva = textoTelegramLead({ ...base, ficha: { id: 'c1', nueva: true, nombre: 'Ana' }, base: 'https://p.test/' })
  assert.ok(nueva.includes('Ana &lt;b&gt;x&lt;/b&gt;'), 'el nombre va escapado')
  assert.ok(nueva.includes('a &amp; b'))
  assert.ok(nueva.includes('https://p.test/correduria/cliente/c1'))
  assert.ok(nueva.includes('Ficha nueva'))
  assert.ok(nueva.includes('600123456') && nueva.includes('ana@x.es'))
  const existente = textoTelegramLead({ ...base, ficha: { id: 'c9', nueva: false, nombre: 'Ana López' }, base: 'https://p.test' })
  assert.ok(existente.includes('Ya estaba en la cartera'))
  assert.ok(existente.includes('/correduria/cliente/c9'))
  const sinFicha = textoTelegramLead({ ...base, ficha: null, motivo: 'red' })
  assert.ok(sinFicha.includes('NO se ha podido registrar'))
  assert.ok(sinFicha.includes('(red)'))
  assert.ok(!sinFicha.includes('/correduria/cliente/'), 'sin ficha no hay enlace que enseñar')
  assert.equal(urlFichaCliente('c1', 'https://p.test/'), 'https://p.test/correduria/cliente/c1')
})

test('rate limit: ventana fija por clave, y se reinicia al expirar', () => {
  const t0 = 1_000_000
  for (let i = 0; i < 6; i++) assert.equal(rateLimit('t:ip', 6, 3_600_000, t0 + i).allowed, true)
  const bloqueado = rateLimit('t:ip', 6, 3_600_000, t0 + 10)
  assert.equal(bloqueado.allowed, false)
  assert.ok((bloqueado.retryAfter ?? 0) > 0)
  assert.equal(rateLimit('t:otra', 6, 3_600_000, t0 + 10).allowed, true, 'otra clave no comparte cupo')
  assert.equal(rateLimit('t:ip', 6, 3_600_000, t0 + 3_600_001).allowed, true, 'pasada la ventana vuelve a admitir')
})
