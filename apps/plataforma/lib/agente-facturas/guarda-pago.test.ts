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

// ── aprobarPago: SQB a mano, paso atómico, conciliación 1 cargo = 1 factura ──────
import { ESTADOS_PAGABLES, ERROR_SQB_A_MANO } from './guarda-pago.ts'
const resumenSrc = (() => { const i = fuente.indexOf('export async function resumenSemanal'); return fuente.slice(i, fuente.indexOf('\n}\n', i)) })()
const aprobar = (() => { const i = fuente.indexOf('export async function aprobarPago'); return fuente.slice(i, fuente.indexOf('\n}\n', i)) })()
test('aprobarPago: rechaza SQB antes de cualquier pago', () => {
  assert.match(aprobar, /esProveedorSqb\(\{ proveedor: factura\.proveedor \}\)\) return \{ ok: false, error: ERROR_SQB_A_MANO \}/)
  assert.ok(aprobar.indexOf('esProveedorSqb') < aprobar.indexOf('iniciarPago('))
})
test('ERROR_SQB_A_MANO: texto acordado', () => assert.equal(ERROR_SQB_A_MANO, 'Si Que Brilla se paga a mano por transferencia; no se inicia pago.'))
test('ESTADOS_PAGABLES: los que el código aceptaba', () => assert.deepEqual([...ESTADOS_PAGABLES], ['nueva', 'pendiente_revision', 'aprobada']))
test('aprobarPago: reclama con estado intermedio pago_iniciando', () => assert.match(aprobar, /SET estado = 'pago_iniciando'/))
test('aprobarPago: excluye pago_iniciando del reclamo', () => assert.match(aprobar, /estado <> 'pago_iniciando'/))
test('aprobarPago: error de iniciarPago libera a aprobada', () => assert.match(aprobar, /catch \(e: any\) \{[\s\S]*?SET estado = 'aprobada' WHERE id = \$\{facturaId\}::uuid AND estado = 'pago_iniciando'/))
test('conciliación cierra también facturas en pago_iniciando', () => assert.match(fuente, /'aprobada', 'pago_iniciando', 'pago_iniciado'\]/))
test('aprobarPago: paso a aprobada condicional (estado, pago_id NULL, RETURNING)', () => {
  assert.match(aprobar, /estado = ANY\(\$\{\[\.\.\.ESTADOS_PAGABLES\]\}\) AND estado <> .pago_iniciando. AND pago_id IS NULL/)
  assert.match(aprobar, /RETURNING id::text/)
})
test('aprobarPago: sin fila reclamada no se inicia pago ni SEPA', () => {
  const i = aprobar.indexOf('reclamada.length === 0')
  assert.ok(i >= 0 && i < aprobar.indexOf('iniciarPago(') && i < aprobar.indexOf('generarSepaXml'))
})
test('aprobarPago: ya no hay UPDATE incondicional previo al pago', () => {
  assert.ok(!/UPDATE facturas_proveedor SET estado = 'aprobada' WHERE id = \$\{facturaId\}::uuid`\)\n\n/.test(aprobar))
})
test('resumenSemanal: SQB fuera de las manuales', () => {
  assert.match(resumenSrc, /filter\(f => !esProveedorSqb\(\{ proveedor: f\.proveedor \}\)\)/)
  assert.match(resumenSrc, /planificarAviso\(paraPlan,/)
})
test('marcarConciliadas: cierra por par factura+movimiento', () => {
  const m = cuerpo('marcarConciliadas')
  assert.match(m, /cerrarFacturaConCargo\(cuentaId, par,/)
  assert.ok(!/UPDATE facturas_proveedor/.test(m))
})
test('conciliarFactura pasa el par (con movimiento)', () => assert.match(fuente, /marcarConciliadas\(cuentaId, \[par\], msgPorFactura\)/))
test('casación genérica excluye cargos ya conciliados', () => assert.match(fuente, /mb\.conciliado IS NOT TRUE/))
