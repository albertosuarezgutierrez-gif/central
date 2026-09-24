import { test } from 'node:test'
import assert from 'node:assert/strict'

import { correoPresupuesto, mensajePresupuestoWhatsapp } from './mensaje-presupuesto.ts'
import { revisarCopy } from './copy-regulado.ts'

const d = { nombre: 'JOSÉ SUÁREZ SALAS', enlace: 'https://clientes.grupoasegura.es/presupuesto/abc', venceEl: new Date('2026-10-08T10:00:00Z'), email: 'jose@x.es' }

test('🪤 el aviso no lleva precio, compañía ni bien: solo quién, dónde y hasta cuándo', () => {
  for (const t of [mensajePresupuestoWhatsapp(d), correoPresupuesto(d).texto, correoPresupuesto(d).html]) {
    assert.doesNotMatch(t, /€|\d+,\d{2}|mapfre|allianz|occident|reale|generali|matr[ií]cula|p[oó]liza n/i)
    assert.match(t, /clientes\.grupoasegura\.es\/presupuesto\/abc/)
    assert.match(t, /08\/10\/2026/)
  }
})

test('el WhatsApp dice con qué correo entrar; sin nombre saluda sin «null»', () => {
  assert.match(mensajePresupuestoWhatsapp(d), /jose@x\.es/)
  assert.match(mensajePresupuestoWhatsapp(d), /^Hola, JOSÉ\./)
  assert.match(mensajePresupuestoWhatsapp({ ...d, nombre: null }), /^Hola\. /)
  assert.doesNotMatch(mensajePresupuestoWhatsapp({ ...d, nombre: '  ' }), /null|undefined/)
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
