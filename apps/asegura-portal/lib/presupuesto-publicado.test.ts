import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { abiertoAlCliente } from './presupuesto-publicado.ts'

const base = { enviadoAt: null, enlaceGenerado: false, porWhatsapp: false, vistaDeCorredor: false }

test('un BORRADOR (ni enviado ni enlazado) no lo abre el cliente', () => {
  assert.equal(abiertoAlCliente(base), false)
})

test('enviado: lo abre', () => {
  assert.equal(abiertoAlCliente({ ...base, enviadoAt: new Date() }), true)
})

test('enlazado por WhatsApp sin confirmar el envío: lo abre (evento enlace_generado)', () => {
  assert.equal(abiertoAlCliente({ ...base, enlaceGenerado: true }), true)
})

test('entró con el código del WhatsApp de ESTE presupuesto: lo abre', () => {
  assert.equal(abiertoAlCliente({ ...base, porWhatsapp: true }), true)
})

test('la vista de corredor ve también los borradores', () => {
  assert.equal(abiertoAlCliente({ ...base, vistaDeCorredor: true }), true)
})

const LIB = readFileSync(join(import.meta.dirname, 'presupuesto.ts'), 'utf8')
const IA = readFileSync(join(import.meta.dirname, '../app/api/presupuesto/ia/route.ts'), 'utf8')

test('presupuestoDeSesion corta el borrador con no_encontrado', () => {
  const cuerpo = LIB.slice(LIB.indexOf('export async function presupuestoDeSesion'))
  assert.match(cuerpo.slice(0, cuerpo.indexOf('const hoy = new Date()')), /if \(!abiertoAlCliente\(\{[^}]*\}\)\) return \{ estado: 'no_encontrado' \}/)
})

test('/api/presupuesto/ia rechaza un presupuesto que el cliente aún no puede abrir', () => {
  const i = IA.indexOf('presupuestoAbiertoAlCliente(presupuestoId)')
  assert.ok(i > 0, 'la ruta de la IA no comprueba que el presupuesto esté enviado')
  assert.ok(i < IA.indexOf('pedirResumenIA('), 'la comprobación va ANTES de gastar IA')
})
