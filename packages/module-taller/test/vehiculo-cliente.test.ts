// Cepos de vehiculo-cliente.ts. Vistos fallar (07/11/2026), uno por aserción, y restaurados:
// (1) aceptar móvil vacío en validarMovilCliente → rojo «sin móvil no se guarda».
// (2) quitar la comprobación de fecha inexistente → rojo «30 de febrero».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MENSAJE_MOVIL_OBLIGATORIO, VENCIMIENTO_SEGURO_MARGEN_DIAS, cambioVencimientoSeguro, fechaInputDe, validarMovilCliente,
  validarVencimientoSeguro,
} from '../src/index.ts'

// Fechas RELATIVAS a un `hoy` inyectado (nunca contra el reloj real).
const HOY = new Date(Date.UTC(2026, 10, 7, 9, 30))
const dia = (desplazamiento: number) => new Date(Date.UTC(2026, 10, 7 + desplazamiento)).toISOString().slice(0, 10)

test('móvil: sin móvil no se guarda, con el mensaje claro', () => {
  for (const v of ['', '   ', null, undefined]) {
    const r = validarMovilCliente(v)
    assert.equal(r.ok, false)
    assert.equal(!r.ok && r.motivo, MENSAJE_MOVIL_OBLIGATORIO)
  }
})
test('móvil: inválido se rechaza con otro mensaje', () => {
  for (const v of ['123', '500111222', '60011122', 'abc']) {
    const r = validarMovilCliente(v)
    assert.equal(r.ok, false, v)
    assert.notEqual(!r.ok && r.motivo, MENSAJE_MOVIL_OBLIGATORIO)
  }
})
test('móvil: válido se normaliza (espacios, +34, 0034)', () => {
  assert.deepEqual(validarMovilCliente(' 600 11 12 22 '), { ok: true, movil: '600111222' })
  assert.deepEqual(validarMovilCliente('+34 699-111-222'), { ok: true, movil: '699111222' })
  assert.deepEqual(validarMovilCliente('0034711222333'), { ok: true, movil: '711222333' })
})

test('vencimiento: vacío = «no se toca» (null), nunca un valor por defecto', () => {
  assert.deepEqual(validarVencimientoSeguro('', HOY), { ok: true, fecha: null })
  assert.deepEqual(validarVencimientoSeguro(null, HOY), { ok: true, fecha: null })
})
test('vencimiento: formato y fecha inexistente (30 de febrero)', () => {
  assert.equal(validarVencimientoSeguro('07/11/2026', HOY).ok, false)
  assert.equal(validarVencimientoSeguro('2027-02-30', HOY).ok, false)
  assert.equal(validarVencimientoSeguro('2027-13-01', HOY).ok, false)
})
test('vencimiento: dentro de ± margen vale; fuera, no', () => {
  const M = VENCIMIENTO_SEGURO_MARGEN_DIAS
  for (const d of [0, 1, -1, M, -M]) {
    const r = validarVencimientoSeguro(dia(d), HOY)
    assert.ok(r.ok && r.fecha && r.fecha.toISOString().startsWith(dia(d)), `${d}`)
  }
  assert.equal(validarVencimientoSeguro(dia(M + 1), HOY).ok, false)
  assert.equal(validarVencimientoSeguro(dia(-M - 1), HOY).ok, false)
  assert.equal(validarVencimientoSeguro('2207-11-07', HOY).ok, false)
})

test('cambio: sin fecha nueva o igual a la que constaba → no se escribe nada (no se pisa quién la puso)', () => {
  const f = new Date(Date.UTC(2027, 2, 1))
  const o = { usuarioId: 'u1', origen: 'recepcion' as const, ahora: HOY }
  assert.equal(cambioVencimientoSeguro(f, null, o), null)
  assert.equal(cambioVencimientoSeguro(null, null, o), null)
  assert.equal(cambioVencimientoSeguro(f, new Date(Date.UTC(2027, 2, 1)), o), null)
})
test('cambio: fecha nueva o corregida → valor + quién + cuándo + origen', () => {
  const nueva = new Date(Date.UTC(2027, 2, 2))
  assert.deepEqual(cambioVencimientoSeguro(null, nueva, { usuarioId: 'u1', origen: 'entrega', ahora: HOY }),
    { seguroHasta: nueva, seguroHastaPor: 'u1', seguroHastaEn: HOY, seguroHastaOrigen: 'entrega' })
  assert.equal(cambioVencimientoSeguro(new Date(Date.UTC(2027, 2, 1)), nueva, { usuarioId: 'u1', origen: 'recepcion', ahora: HOY })?.seguroHastaOrigen, 'recepcion')
})
test('fechaInputDe: precarga del input date; null → vacío', () => {
  assert.equal(fechaInputDe(new Date(Date.UTC(2027, 2, 1))), '2027-03-01')
  assert.equal(fechaInputDe(null), '')
})
