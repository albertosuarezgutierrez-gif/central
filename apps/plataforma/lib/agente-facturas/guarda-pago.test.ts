import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decidirGuardaPago, fechaCorta, textoYaPagada } from './guarda-pago.ts'

const fuente = readFileSync(new URL('./pagos.ts', import.meta.url), 'utf8')
const cuerpo = (nombre: string) => {
  const i = fuente.indexOf(`function ${nombre}(`)
  assert.ok(i >= 0, `no encuentro ${nombre}`)
  const j = fuente.indexOf('\n}\n', i)
  return fuente.slice(i, j)
}

test('hay cargo que casa → no se paga', () => {
  assert.equal(decidirGuardaPago('nueva', true), 'ya_pagada')
})
test('consultado y sin cargo → se puede pagar', () => {
  assert.equal(decidirGuardaPago('pendiente_revision', false), 'pagar')
})
test('FAIL-CLOSED: consulta fallida (null) nunca es «pagar»', () => {
  assert.equal(decidirGuardaPago('nueva', null), 'sin_comprobar')
})
test('estado pagada → ya pagada aunque la consulta falle', () => {
  assert.equal(decidirGuardaPago('pagada', null), 'ya_pagada')
  assert.equal(decidirGuardaPago('pagada', false), 'ya_pagada')
})
test('fechaCorta dd/mm, y null si no hay fecha legible', () => {
  assert.equal(fechaCorta('2026-11-02'), '02/11')
  assert.equal(fechaCorta('2026-11-02T10:00:00Z'), '02/11')
  assert.equal(fechaCorta(null), null)
  assert.equal(fechaCorta('basura'), null)
})
test('textoYaPagada incluye la fecha del cargo', () => {
  const d = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const f = fechaCorta(d)
  assert.match(textoYaPagada(f), new RegExp(`ya pagada · conciliada con el cargo del ${f}`))
  assert.match(textoYaPagada(null), /ya pagada/)
})

// Cepos sobre el FUENTE (pagos.ts no se puede importar sin BD)
test('aprobarPago: la guarda va ANTES de iniciar pago y de generar el SEPA', () => {
  const c = cuerpo('aprobarPago')
  const g = c.indexOf('conciliarFactura(')
  assert.ok(g > 0, 'aprobarPago debe llamar a conciliarFactura')
  assert.ok(g < c.indexOf('iniciarPago('), 'guarda antes de iniciarPago')
  assert.ok(g < c.indexOf('generarSepaXml('), 'guarda antes del SEPA')
})
test('aprobarPago: veredicto ya_pagada y sin_comprobar cortan con ok:false', () => {
  const c = cuerpo('aprobarPago')
  assert.match(c, /veredicto === 'ya_pagada'\) \{\s*return \{ ok: false, yaPagada: true/)
  assert.match(c, /veredicto === 'sin_comprobar'\) \{\s*return \{ ok: false/)
})
test('aprobarPago: el catch de la consulta deja casado en null (no false)', () => {
  assert.match(cuerpo('aprobarPago'), /catch \{ casado = null \}/)
})
test('notificarFactura: concilia ANTES de construir botones y el fallo no ofrece Pagar', () => {
  const c = cuerpo('notificarFactura')
  assert.ok(c.indexOf('conciliarFactura(') > 0)
  assert.ok(c.indexOf('conciliarFactura(') < c.indexOf('pago_aprobar:'))
  assert.match(c, /catch \{\s*bancoNoComprobado = true/)
  assert.match(c, /sola \|\| bancoNoComprobado/)
})
test('conciliarConBanco y conciliarFactura comparten el MISMO casado', () => {
  assert.match(cuerpo('conciliarConBanco'), /casarFacturasConBanco\(/)
  assert.match(cuerpo('conciliarFactura'), /casarFacturasConBanco\(/)
})
