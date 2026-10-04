import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callbackIva, callbackDup, interpretarIva, interpretarDup, esProveedorExtranjero, ofrecerSinIvaExtranjero, filaAQuitar, planDup, respuestaDup, MOTIVO_DESCARTE_DUP } from './anomalia-callbacks.ts'

const ID = '123e4567-e89b-12d3-a456-426614174000'
const ID2 = '223e4567-e89b-12d3-a456-426614174000'

test('callbacks caben en 64 bytes y hacen ida y vuelta', () => {
  const c = callbackIva('sin', ID)
  assert.ok(Buffer.byteLength(c) <= 64)
  const [head, id] = c.split(':')
  assert.equal(head, 'fiva_sin')
  assert.deepEqual(interpretarIva('sin', [id]), { accion: 'sin', id: ID })
  assert.deepEqual(interpretarDup('del', [ID]), { accion: 'del', id: ID })
  assert.ok(Buffer.byteLength(callbackDup('ok', ID)) <= 64)
})

test('rechaza ids y acciones no válidos', () => {
  assert.throws(() => callbackIva('sin', 'abc'))
  assert.equal(interpretarIva('sin', ["1'; DROP"]), null)
  assert.equal(interpretarIva('borrar', [ID]), null)
  assert.equal(interpretarDup('x', [ID]), null)
})

test('proveedor extranjero solo con señal positiva', () => {
  assert.equal(esProveedorExtranjero({ nif_proveedor: 'IE6388047V' }), true)
  assert.equal(esProveedorExtranjero({ nif_proveedor: 'ESB12345678' }), false)
  assert.equal(esProveedorExtranjero({ nif_proveedor: 'B12345678' }), false)
  assert.equal(esProveedorExtranjero({ nif_proveedor: 'ES12345678Z' }), false)
  assert.equal(esProveedorExtranjero({ proveedor: 'Vercel Inc.' }), true)
  assert.equal(esProveedorExtranjero({ proveedor: 'Ferretería López' }), false)
  assert.equal(esProveedorExtranjero({}), false)
})

test('solo se ofrece con iva null; un 0 es dato', () => {
  assert.equal(ofrecerSinIvaExtranjero(null, { proveedor: 'Vercel' }), true)
  assert.equal(ofrecerSinIvaExtranjero(0, { proveedor: 'Vercel' }), false)
  assert.equal(ofrecerSinIvaExtranjero(21, { proveedor: 'Vercel' }), false)
  assert.equal(ofrecerSinIvaExtranjero(null, { proveedor: 'Bar Pepe' }), false)
})

test('se quita la fila más nueva', () => {
  const vieja = { id: ID, created_at: '2026-09-01T10:00:00Z' }
  const nueva = { id: ID2, created_at: '2026-09-02T10:00:00Z' }
  assert.equal(filaAQuitar(vieja, nueva), ID2)
  assert.equal(filaAQuitar(nueva, vieja), ID2)
  assert.equal(filaAQuitar({ ...vieja, created_at: nueva.created_at }, nueva), ID2) // empate: id mayor
})

// ── Plan de los botones de duplicado ─────────────────────────────────────────────────────────
const IDD = '00000000-0000-4000-8000-000000000001'

test('gdup_del SIN migración → no_disponible (nunca DELETE como sustituto)', () => {
  const p = planDup({ accion: 'del', id: IDD }, false)
  assert.equal(p.tipo, 'no_disponible')
  assert.match(respuestaDup(p, 0), /No he tocado nada/)
})

test('gdup_del CON migración → descartar con motivo', () => {
  assert.deepEqual(planDup({ accion: 'del', id: IDD }, true), { tipo: 'descartar', id: IDD, motivo: MOTIVO_DESCARTE_DUP })
})

test('gdup_ok → marca no_duplicado, con o sin migración', () => {
  assert.equal(planDup({ accion: 'ok', id: IDD }, false).tipo, 'marcar_no_duplicado')
  assert.equal(planDup({ accion: 'ok', id: IDD }, true).tipo, 'marcar_no_duplicado')
})

test('respuesta: 0 filas en un descarte = ya estaba quitado (no se afirma que se quitó)', () => {
  const p = planDup({ accion: 'del', id: IDD }, true)
  assert.match(respuestaDup(p, 1), /quitado/)
  assert.match(respuestaDup(p, 0), /Ya estaba quitado/)
})
