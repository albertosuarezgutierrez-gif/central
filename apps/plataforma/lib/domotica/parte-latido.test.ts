import test from 'node:test'
import assert from 'node:assert/strict'
import { codigosTuya, detalleAcceso, firmaCodigos } from './parte-latido.ts'

// Partes REALES de `domotica_acceso_pin.detalle->>'error'` (leídos de producción el 04/09/2026).
const OFFLINE = 'PIN no creado. online: Tuya 2001: device is offline · offline: Tuya 1109: param is illegal ,please check it'
const IOTCORE = 'PIN no creado. online: Tuya 28841002: IoT Core service subscription has expired. — renueva el trial de IoT Core en platform.tuya.com · offline: Tuya 28841002: IoT Core service subscription has expired'

test('extrae los códigos distintos de un parte real', () => {
  assert.deepEqual(codigosTuya([OFFLINE]), ['1109', '2001'])
  assert.deepEqual(codigosTuya([IOTCORE]), ['28841002'])
})

// La firma tiene que ser la MISMA vengan los pisos en el orden que vengan: si no, el pendiente
// conocido dejaría de casar un día cualquiera y volvería a sonar sin que nada haya cambiado.
test('el orden es numérico y estable, no lexicográfico', () => {
  assert.deepEqual(codigosTuya([IOTCORE, OFFLINE]), ['1109', '2001', '28841002'])
  assert.deepEqual(codigosTuya([OFFLINE, IOTCORE]), ['1109', '2001', '28841002'])
})

test('el parte nombra la causa, no solo el recuento', () => {
  const d = detalleAcceso({ cerraduras: 2, creados: 0, borrados: 0, desajustados: 1, errores: [OFFLINE, OFFLINE, OFFLINE] })
  assert.equal(d, '2 cerradura(s) · 0 PIN creado(s) · 0 borrado(s) · 1 con la ventana desactualizada · 3 con ERROR (Tuya 1109, 2001)')
})

test('sin errores no se inventa un bloque de error', () => {
  const d = detalleAcceso({ cerraduras: 2, creados: 1, borrados: 1, desajustados: 0, errores: [] })
  assert.equal(d, '2 cerradura(s) · 1 PIN creado(s) · 1 borrado(s)')
})

// Un error que no trae código de Tuya (BD caída, excepción nuestra) NO puede heredar la firma del
// fallo conocido: si lo hiciera, se silenciaría solo.
test('error sin código reconocible se DECLARA, no se disfraza', () => {
  const d = detalleAcceso({ cerraduras: 2, creados: 0, borrados: 0, desajustados: 0, errores: ['connect ETIMEDOUT'] })
  assert.match(d, /1 con ERROR \(sin código reconocible\)/)
  assert.doesNotMatch(d, /Tuya/)
})

// 🚨 El invariante del que depende el pendiente conocido: un código NUEVO rompe la firma.
test('un código nuevo cambia la firma (no se cuela dentro del marcador)', () => {
  const conocido = firmaCodigos(['1109', '2001'])
  const hoy = detalleAcceso({ cerraduras: 2, creados: 0, borrados: 0, desajustados: 0, errores: [OFFLINE] })
  assert.ok(hoy.includes(conocido), 'el fallo conocido debe casar')
  const nuevo = detalleAcceso({ cerraduras: 2, creados: 0, borrados: 0, desajustados: 0, errores: [OFFLINE, IOTCORE] })
  assert.ok(!nuevo.includes(conocido), 'con un código de más NO puede casar el marcador conocido')
})
