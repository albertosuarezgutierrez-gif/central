import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarFormaPago, planificarAviso, componerTexto, hayAviso, claveProveedor, hayCoberturaTotal, claveUtil, clavesDeTitulares, RE_CONCEPTO_TRANSFERENCIA, CLAVES_GENERICAS, type FacturaResumen } from './forma-pago.ts'

const base = { proveedor: 'X', domiciliadoExplicito: null, cargosAutomaticosPrevios: 0, transferenciasPrevias: 0 }

test('plataforma que descuenta (Booking) nunca es pagable', () => {
  assert.equal(clasificarFormaPago({ ...base, proveedor: 'Booking.com B.V.', transferenciasPrevias: 3 }), 'plataforma')
})
test('domiciliación explícita → cargo automático', () => {
  assert.equal(clasificarFormaPago({ ...base, domiciliadoExplicito: true }), 'cargo_automatico')
})
test('PriceLabs/IONOS: histórico de cargos con tarjeta → automático', () => {
  assert.equal(clasificarFormaPago({ ...base, proveedor: 'IONOS', cargosAutomaticosPrevios: 4 }), 'cargo_automatico')
})
test('solo transferencias previas → transferencia (acción manual)', () => {
  assert.equal(clasificarFormaPago({ ...base, transferenciasPrevias: 2 }), 'transferencia')
})
test('null ≠ transferencia: sin ninguna señal → desconocida', () => {
  assert.equal(clasificarFormaPago(base), 'desconocida')
})
test('historial MIXTO → desconocida, no automático', () => {
  assert.equal(clasificarFormaPago({ ...base, cargosAutomaticosPrevios: 3, transferenciasPrevias: 1 }), 'desconocida')
})
test('domiciliado=false solo NO basta para transferencia (Fly.io)', () => {
  assert.equal(clasificarFormaPago({ ...base, proveedor: 'Fly.io', domiciliadoExplicito: false }), 'desconocida')
  assert.equal(clasificarFormaPago({ ...base, domiciliadoExplicito: false, transferenciasPrevias: 1 }), 'transferencia')
})
test('detección de transferencia: todas las variantes del banco', () => {
  for (const c of ['ORDEN DE TRANSFERENCIA A X', 'TRF A FAVOR', 'TRANSFER 123', 'TRANS. INMEDIATA', 'TRANSFERENCIA', 'TRASPASO', 'BIZUM DE']) assert.ok(RE_CONCEPTO_TRANSFERENCIA.test(c), c)
  assert.ok(!RE_CONCEPTO_TRANSFERENCIA.test('COMPRA TARJ. IONOS'))
  assert.ok(!RE_CONCEPTO_TRANSFERENCIA.test('RECIBO DIGI'))
})
test('clave: nombres del titular y genéricas no sirven (caso ALBERTO SUAREZ GUTIERREZ)', () => {
  const ex = clavesDeTitulares(['Alberto Suárez Gutiérrez', 'Punto y Coma SL'])
  assert.equal(claveProveedor('ALBERTO SUAREZ GUTIERREZ'), 'ALBERTO')
  assert.equal(claveUtil('ALBERTO', ex), false)
  assert.equal(claveUtil('PILAR', ex), false)
  assert.equal(claveUtil('GRUPO', ex), false)
  assert.ok(CLAVES_GENERICAS.includes('GRUPO'))
  assert.equal(claveUtil('ANTHROPIC', ex), true)
  assert.equal(claveUtil('ION', ex), false)
})

const f = (id: string, forma: FacturaResumen['forma'], venc: string | null, importe = 10): FacturaResumen =>
  ({ id, proveedor: id, importe, fecha_vencimiento: venc, forma })

test('solo las transferencias entran como pendientes de pagar', () => {
  const p = planificarAviso([f('a', 'transferencia', null), f('b', 'cargo_automatico', '2026-10-06'), f('c', 'desconocida', null), f('d', 'plataforma', '2026-09-01')], '2026-10-05')
  assert.deepEqual(p.manuales.map((x) => x.id), ['a'])
  assert.deepEqual(p.automaticas.map((x) => x.id), ['b', 'd'])
  assert.deepEqual(p.desconocidas.map((x) => x.id), ['c'])
  assert.equal(p.sinCargo.length, 0)
})
test('domiciliada vencida + margen sin cargo y con cobertura → accionable', () => {
  const p = planificarAviso([f('a', 'cargo_automatico', '2026-09-20')], '2026-10-05')
  assert.deepEqual(p.sinCargo.map((x) => x.id), ['a'])
  assert.equal(hayAviso(p), true)
})
test('dentro del margen no se reclama', () => {
  const p = planificarAviso([f('a', 'cargo_automatico', '2026-10-02')], '2026-10-05')
  assert.equal(p.sinCargo.length, 0)
  assert.equal(hayAviso(p), false)
})
test('sin cobertura del extracto no se afirma ausencia', () => {
  const p = planificarAviso([f('a', 'cargo_automatico', '2026-09-20')], '2026-10-05', () => false)
  assert.equal(p.sinCargo.length, 0)
  assert.equal(p.automaticas.length, 1)
})
test('la plataforma vencida nunca se reclama', () => {
  assert.equal(planificarAviso([f('a', 'plataforma', '2026-01-01')], '2026-10-05').sinCargo.length, 0)
})
test('texto: líneas resumen con eur(), sin botones ni «pendientes» para lo automático', () => {
  const p = planificarAviso([f('a', 'transferencia', null, 504.57), f('b', 'cargo_automatico', '2026-10-06', 1000), f('c', 'desconocida', null, 5)], '2026-10-05')
  const t = componerTexto(p)
  assert.match(t, /1 factura\(s\) por pagar por transferencia/)
  assert.match(t, /504,57€/)
  assert.match(t, /1 se cargarán solas por banco\/tarjeta \(1\.000,00€\)/)
  assert.match(t, /1 sin forma de pago conocida \(5,00€\)/)
})
test('solo automáticas dentro de plazo → no hay aviso', () => {
  assert.equal(hayAviso(planificarAviso([f('b', 'cargo_automatico', '2026-10-06')], '2026-10-05')), false)
})
test('con desconocidas SÍ se avisa, listadas aparte y sin entrar en «por transferencia»', () => {
  const p = planificarAviso([f('c', 'desconocida', null, 7)], '2026-10-05')
  assert.equal(hayAviso(p), true)
  const t = componerTexto(p)
  assert.match(t, /decide cómo se paga/)
  assert.match(t, /• c · 7,00€/)
  assert.doesNotMatch(t, /por pagar por transferencia/)
})

test('tarjeta oculta parada + corriente fresca → sin cobertura, no hay aviso de cargo ausente', () => {
  const cuentas = [{ nombre: 'BBVA', ultimo: '2026-10-04' }, { nombre: 'Tarjeta N26', ultimo: '2026-07-31' }]
  assert.equal(hayCoberturaTotal(cuentas, '2026-09-20'), false)
  const p = planificarAviso([f('a', 'cargo_automatico', '2026-09-20')], '2026-10-05', (x) => hayCoberturaTotal(cuentas, x))
  assert.equal(p.sinCargo.length, 0)
  assert.equal(hayAviso(p), false)
  assert.equal(hayCoberturaTotal(null, '2026-09-20'), false)
})
