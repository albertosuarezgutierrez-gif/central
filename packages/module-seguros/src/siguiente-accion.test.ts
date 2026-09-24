import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siguienteAccion, type PolizaAccion } from './siguiente-accion.ts'

const hoy = new Date('2026-09-24T10:00:00Z')

function poliza(p: Partial<PolizaAccion> & { recibos?: PolizaAccion['recibos'] }): PolizaAccion {
  return {
    id: 'p1', viva: true, confirmadaCima: true, estado: 'activa', fechaVencimiento: '2027-06-01',
    tipo: 'auto', aseguradora: 'Mapfre',
    recibos: { total: 2, pendientes: 0, devueltos: 0, ultimo: { situacion: 'cobrado', fechaVencimiento: '2026-06-01' } },
    ...p,
  }
}
const base = { declaradas: [], cotizacionesVivas: 0, tieneCanal: true, hoy }
const devuelto = (venc: string): PolizaAccion['recibos'] =>
  ({ total: 1, pendientes: 0, devueltos: 1, ultimo: { situacion: 'devuelto', fechaVencimiento: venc } })

test('🪤 recibo devuelto hace más de un mes: primero, urgente y dice que no tiene cobertura', () => {
  const r = siguienteAccion({ ...base, polizas: [poliza({ fechaVencimiento: '2026-10-10' }), poliza({ id: 'p2', recibos: devuelto('2026-07-01') })] })
  assert.equal(r.estado, 'accion')
  assert.ok(r.estado === 'accion' && r.tipo === 'recibo_sin_cobertura' && r.urgente && r.polizaId === 'p2')
})

test('🪤 un recibo PENDIENTE no es un impago: no dispara la llamada', () => {
  const r = siguienteAccion({ ...base, polizas: [poliza({ recibos: { total: 1, pendientes: 1, devueltos: 0, ultimo: { situacion: 'pendiente', fechaVencimiento: '2026-07-01' } } })] })
  assert.ok(r.estado === 'accion' && r.tipo === 'venta_cruzada')
})

test('devuelto reciente: llamar antes de que se suspenda', () => {
  const r = siguienteAccion({ ...base, polizas: [poliza({ recibos: devuelto('2026-09-15') })] })
  assert.ok(r.estado === 'accion' && r.tipo === 'recibo_devuelto')
})

test('renovación dentro de 60 días: la más cercana, urgente si no llega el preaviso', () => {
  const r = siguienteAccion({ ...base, polizas: [poliza({ fechaVencimiento: '2026-11-15' }), poliza({ id: 'p2', fechaVencimiento: '2026-10-10', tipo: 'hogar' })] })
  assert.ok(r.estado === 'accion' && r.tipo === 'renovacion' && r.polizaId === 'p2' && r.urgente)
})

test('una póliza CANCELADA no se renueva ni se vende', () => {
  const r = siguienteAccion({ ...base, polizas: [poliza({ estado: 'cancelada', fechaVencimiento: '2026-10-10' })] })
  assert.deepEqual(r, { estado: 'nada' })
})

test('declarada de otra compañía que vence: comparativa', () => {
  const r = siguienteAccion({ ...base, polizas: [], declaradas: [{ ramo: 'hogar', compania: 'Allianz', fechaVencimiento: '2026-11-01' }] })
  assert.ok(r.estado === 'accion' && r.tipo === 'comparativa_declarada' && /Allianz/.test(r.titulo))
})

test('🪤 sin acción pero con recibos sin leer: sin_comprobar, nunca «nada»', () => {
  const r = siguienteAccion({ ...base, polizas: [poliza({ tipo: 'hogar', recibos: null })] })
  assert.equal(r.estado, 'sin_comprobar')
})

test('🪤 declaradas sin leer tampoco autorizan a decir «nada»', () => {
  const r = siguienteAccion({ ...base, polizas: [], declaradas: null })
  assert.deepEqual(r, { estado: 'sin_comprobar', falta: ['pólizas declaradas en el portal'] })
})

test('coche sin hogar: venta cruzada; con hogar: nada', () => {
  assert.ok((r => r.estado === 'accion' && r.tipo === 'venta_cruzada')(siguienteAccion({ ...base, polizas: [poliza({})] })))
  assert.deepEqual(siguienteAccion({ ...base, polizas: [poliza({}), poliza({ id: 'p2', tipo: 'hogar' })] }), { estado: 'nada' })
})

test('sin canal con pólizas vivas: pedir teléfono o correo antes que vender', () => {
  const r = siguienteAccion({ ...base, tieneCanal: false, polizas: [poliza({})] })
  assert.ok(r.estado === 'accion' && r.tipo === 'sin_canal')
})
