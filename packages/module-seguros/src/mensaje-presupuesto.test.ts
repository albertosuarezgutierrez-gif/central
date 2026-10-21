import { test } from 'node:test'
import assert from 'node:assert/strict'

import { correoPresupuesto, mensajePresupuestoWhatsapp } from './mensaje-presupuesto.ts'
import { revisarCopy } from './copy-regulado.ts'

const d = { nombre: 'JOSÉ SUÁREZ SALAS', enlace: 'https://clientes.grupoasegura.es/presupuesto/abc', venceEl: new Date('2026-10-08T10:00:00Z'), email: 'jose@x.es' as string | null, codigo: '305172' }

test('🪤 el aviso no lleva precio, compañía ni bien: solo quién, dónde y hasta cuándo', () => {
  for (const t of [mensajePresupuestoWhatsapp(d), correoPresupuesto(d).texto, correoPresupuesto(d).html]) {
    assert.doesNotMatch(t, /€|\d+,\d{2}|mapfre|allianz|occident|reale|generali|matr[ií]cula|p[oó]liza n/i)
    assert.match(t, /clientes\.grupoasegura\.es\/presupuesto\/abc/)
    assert.match(t, /08\/10\/2026/)
  }
})

test('el WhatsApp dice con qué correo PUEDE entrar; sin nombre saluda sin «null»', () => {
  assert.match(mensajePresupuestoWhatsapp(d), /jose@x\.es/)
  assert.match(mensajePresupuestoWhatsapp(d), /^Hola, JOSÉ\./)
  assert.match(mensajePresupuestoWhatsapp({ ...d, nombre: null }), /^Hola\. /)
  assert.doesNotMatch(mensajePresupuestoWhatsapp({ ...d, nombre: '  ' }), /null|undefined/)
})

test('🪤 el WhatsApp lleva SU código de acceso ANTES del enlace, y la fecha', () => {
  const w = mensajePresupuestoWhatsapp(d)
  assert.match(w, /tu código de acceso es 305172/)
  assert.ok(w.indexOf('305172') < w.indexOf(d.enlace), 'el código se lee antes de pulsar el enlace')
  assert.ok(w.indexOf('jose@x.es') < w.indexOf(d.enlace))
  assert.match(w, /también puedes entrar con tu correo jose@x\.es: te llegará otro código/)
  assert.match(w, /08\/10\/2026/)
  assert.match(w, /Grupo ASegura/)
})

test('🪤 sin correo en la ficha el WhatsApp NO nombra ninguno ni promete un código por correo', () => {
  for (const email of [null, '', '   ']) {
    const w = mensajePresupuestoWhatsapp({ ...d, email })
    assert.match(w, /tu código de acceso es 305172/)
    assert.doesNotMatch(w, /correo|@|null|undefined/)
    assert.deepEqual(revisarCopy(w), [])
  }
})

test('el HTML del correo escapa el enlace', () => {
  assert.match(correoPresupuesto({ ...d, enlace: 'https://x.es/p/"><b>' }).html, /&quot;&gt;&lt;b&gt;/)
})

test('pasa el filtro de copy regulado', () => {
  assert.deepEqual(revisarCopy(mensajePresupuestoWhatsapp(d)), [])
  assert.deepEqual(revisarCopy(correoPresupuesto(d).texto), [])
})

test('🪤 los datos que faltan se CUENTAN, nunca se piden: ni DNI, ni IBAN, ni cuenta en el aviso', () => {
  const c = correoPresupuesto({ ...d, faltanDatos: 3 })
  const w = mensajePresupuestoWhatsapp({ ...d, faltanDatos: 1 })
  assert.match(c.texto, /me faltan 3 datos tuyos/)
  assert.match(c.html, /me faltan 3 datos tuyos/)
  assert.match(w, /me falta un dato tuyo/)
  for (const t of [c.texto, w]) assert.doesNotMatch(t, /\b(DNI|NIE|IBAN|cuenta bancaria|fecha de nacimiento)\b/i)
  assert.doesNotMatch(correoPresupuesto({ ...d, faltanDatos: 0 }).texto, /faltan?/)
  assert.doesNotMatch(correoPresupuesto(d).texto, /faltan?/)
  assert.deepEqual(revisarCopy(c.texto), revisarCopy(correoPresupuesto(d).texto))
})

test('🪤 el correo lleva la marca (logo y botón) y el enlace también en texto por si el botón no abre', () => {
  const h = correoPresupuesto(d).html
  assert.match(h, /logotipo-asegura-correo\.png/)
  assert.match(h, /background:#3364ee[^"]*"[^>]*>Ver mi presupuesto<\/a>/)
  assert.equal(h.match(/clientes\.grupoasegura\.es\/presupuesto\/abc/g)?.length, 3)
})

test('🪤 con enlace directo: el botón entra sin código, el de siempre queda al pie y firmar sigue con código', () => {
  const directo = 'https://clientes.grupoasegura.es/#d=jose%40x.es&e=TOKEN'
  const c = correoPresupuesto({ ...d, enlaceDirecto: directo })
  assert.match(c.html, /href="https:\/\/clientes\.grupoasegura\.es\/#d=jose%40x\.es&amp;e=TOKEN"[^>]*>Ver mi presupuesto/)
  assert.match(c.html, /24 horas[^<]*<br><a href="https:\/\/clientes\.grupoasegura\.es\/presupuesto\/abc"/)
  assert.match(c.html, /fírmala con el código/)
  assert.match(c.texto, /vale una vez, durante 24 horas/)
  assert.ok(c.texto.includes(directo) && c.texto.includes(d.enlace))
  // Sin enlace directo, el de siempre.
  assert.doesNotMatch(correoPresupuesto(d).html, /#d=/)
  assert.deepEqual(revisarCopy(c.texto), [])
})

test('🪤 wa.me con el móvil del TOMADOR si lo hay; sin él, sin número (21/10/2026)', async () => {
  // Para verlo en rojo: en `enlaceWhatsappPresupuesto` ignora `movil` → falla la primera; o pon un número fijo → falla la segunda.
  const { enlaceWhatsappPresupuesto } = await import('./mensaje-presupuesto.ts')
  assert.equal(enlaceWhatsappPresupuesto('Hola y adiós', '34600000000'), 'https://wa.me/34600000000?text=Hola%20y%20adi%C3%B3s')
  assert.equal(enlaceWhatsappPresupuesto('Hola', null), 'https://wa.me/?text=Hola')
  assert.equal(enlaceWhatsappPresupuesto('Hola', '12'), 'https://wa.me/?text=Hola')
})

test('🪤 el correo a una persona de contacto: como contacto de la EMPRESA, con su código, y sin precio ni datos', async () => {
  const { correoPresupuestoTercero } = await import('./mensaje-presupuesto.ts')
  const t = { nombre: 'Víctor Pérez', tomador: 'Talleres Ejemplo SL', tomadorJuridica: true, enlace: 'https://x.es/presupuesto/abc', venceEl: new Date('2026-11-01T10:00:00Z'), codigo: '123456' }
  const c = correoPresupuestoTercero(t)
  assert.match(c.asunto, /Talleres Ejemplo SL/)
  assert.match(c.texto, /^Hola, Víctor:/)
  assert.match(c.texto, /como persona de contacto de Talleres Ejemplo SL/)
  assert.match(c.texto, /Le he preparado a Talleres Ejemplo SL/)
  assert.doesNotMatch(c.texto, /Te he preparado|tu presupuesto|datos tuyos/i)
  for (const x of [c.texto, c.html]) assert.match(x, /123456/)
  assert.doesNotMatch(c.texto, /\b(DNI|NIE|IBAN|cuenta bancaria|€)\b/i)
  assert.deepEqual(revisarCopy(c.texto), [])
  assert.doesNotMatch(correoPresupuestoTercero({ ...t, tomador: null, nombre: null }).texto, /null|undefined/)
  assert.match(correoPresupuestoTercero({ ...t, enlace: 'https://x.es/p/"><b>' }).html, /&quot;&gt;&lt;b&gt;/)
})

test('🪤 el correo a una persona de contacto NO promete que pueda aceptar: el código es solo para verlo', async () => {
  const { correoPresupuestoTercero } = await import('./mensaje-presupuesto.ts')
  const c = correoPresupuestoTercero({ nombre: null, tomador: 'Talleres Ejemplo SL', tomadorJuridica: true, enlace: 'https://x.es/p', venceEl: new Date('2026-11-01T10:00:00Z'), codigo: '123456' })
  for (const x of [c.texto, c.html]) assert.match(x, /solo para ver este presupuesto\. Para aceptarlo tiene que hacerlo Talleres Ejemplo SL/)
  assert.doesNotMatch(c.texto, /acept(a|ar)lo t[uú]|f[ií]rmalo/i)
})

test('🪤 tomador PERSONA FÍSICA: «persona autorizada por <tomador>», nunca «de la empresa»', async () => {
  const { correoPresupuestoTercero } = await import('./mensaje-presupuesto.ts')
  const c = correoPresupuestoTercero({ nombre: 'Ana', tomador: 'José Suárez Salas', tomadorJuridica: false, enlace: 'https://x.es/p', venceEl: new Date('2026-11-01T10:00:00Z'), codigo: '123456' })
  assert.match(c.texto, /como persona autorizada por José Suárez Salas/)
  for (const x of [c.asunto, c.texto, c.html]) assert.doesNotMatch(x, /empresa/i)
  assert.doesNotMatch(correoPresupuestoTercero({ nombre: null, tomador: null, tomadorJuridica: false, enlace: 'https://x.es/p', venceEl: new Date('2026-11-01T10:00:00Z'), codigo: '123456' }).texto, /empresa|null|undefined/i)
})

// 🪤 (21/10/2026, idea 4) El WhatsApp a una persona de contacto. Para verlo en rojo: en `mensajePresupuestoWhatsappTercero`
// cambia «en nombre de» por «de» → falla la primera; quita «pero no aceptarlo» → falla la segunda.
test('🪤 el WhatsApp a una persona de contacto: «en nombre de» la empresa / «persona autorizada por», con su código', async () => {
  const { mensajePresupuestoWhatsappTercero } = await import('./mensaje-presupuesto.ts')
  const t = { nombre: 'Víctor Pérez', tomador: 'Talleres Ejemplo SL', tomadorJuridica: true, enlace: 'https://x.es/presupuesto/abc', venceEl: new Date('2026-11-01T10:00:00Z'), codigo: '123456' }
  const w = mensajePresupuestoWhatsappTercero(t)
  assert.match(w, /^Hola, Víctor\. Soy Alberto, de Grupo ASegura\./)
  assert.match(w, /como persona de contacto, en nombre de Talleres Ejemplo SL/)
  assert.match(w, /Le he preparado a Talleres Ejemplo SL/)
  assert.match(w, /123456/)
  assert.match(w, /https:\/\/x\.es\/presupuesto\/abc/)
  assert.doesNotMatch(w, /Te he preparado|tu código|datos tuyos|también puedes entrar con tu correo/i)
  assert.doesNotMatch(w, /\b(DNI|NIE|IBAN|cuenta bancaria|€)\b/i)
  assert.deepEqual(revisarCopy(w), [])
  const f = mensajePresupuestoWhatsappTercero({ ...t, tomador: 'Ana Ruiz', tomadorJuridica: false })
  assert.match(f, /como persona autorizada por Ana Ruiz/)
  assert.doesNotMatch(f, /persona de contacto/)
  assert.doesNotMatch(mensajePresupuestoWhatsappTercero({ ...t, tomador: null, nombre: null }), /null|undefined/)
})

test('🪤 el WhatsApp a una persona de contacto dice que podrá VERLO pero no aceptarlo', async () => {
  const { mensajePresupuestoWhatsappTercero } = await import('./mensaje-presupuesto.ts')
  const w = mensajePresupuestoWhatsappTercero({ nombre: null, tomador: 'Talleres Ejemplo SL', tomadorJuridica: true, enlace: 'https://x.es/p', venceEl: new Date('2026-11-01T10:00:00Z'), codigo: '123456' })
  assert.match(w, /podrás verlo, pero no aceptarlo/)
  assert.match(w, /aceptarlo tiene que hacerlo Talleres Ejemplo SL/)
  assert.doesNotMatch(w, /para aceptarlo si te convence|Te servirá también para aceptarlo/)
})
