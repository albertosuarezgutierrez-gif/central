import test from 'node:test'
import assert from 'node:assert/strict'
import { contadorCambiosCuenta, interpretarCambiosCuenta } from '../apps/plataforma/lib/cambios-cuenta-asegura.ts'

const fila = { id: 'a', clienteId: 'c', cliente: 'Persona Prueba', mascara: '**** 1332', mascaraActual: null, estado: 'pendiente', pedidaEn: '2026-09-29T10:00' }

test('cola: pendientes cuentan, resueltas no; una fila rara se CUENTA como ilegible', () => {
  const r = interpretarCambiosCuenta(200, { solicitudes: [fila, { ...fila, id: 'b', estado: 'hecha' }, { id: 'x' }] })
  assert.equal(r.estado, 'ok')
  assert.equal(r.estado === 'ok' && r.solicitudes.length, 2)
  assert.equal(contadorCambiosCuenta(r), 2, '1 pendiente + 1 ilegible')
})

test('🪤 no se ha podido leer: el contador es null, nunca 0', () => {
  assert.equal(contadorCambiosCuenta(interpretarCambiosCuenta(502, null)), null)
  assert.equal(contadorCambiosCuenta(interpretarCambiosCuenta(200, { otra: 1 })), null)
})

test('🪤 un acceso recién creado (o sin fecha) pidiendo cambiar la cuenta se avisa; uno antiguo no', async () => {
  const { avisoAcceso } = await import('../apps/plataforma/lib/cambios-cuenta-asegura.ts')
  assert.match(String(avisoAcceso(0)), /menos de un día/)
  assert.match(String(avisoAcceso(3)), /hace 3 días/)
  assert.match(String(avisoAcceso(null)), /No consta/)
  assert.equal(avisoAcceso(200), null)
})
