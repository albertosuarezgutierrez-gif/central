import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hayPendiente, pendienteInicio, type PolizaPendiente } from './inicio-pendientes.ts'

const HOY = '2026-10-26'
const pol = (x: Partial<PolizaPendiente>): PolizaPendiente => ({
  id: 'p1', etiqueta: 'Hogar · Mapfre', propia: true, enVigor: true, vence: null, devueltos: 0, proximoRecibo: null, siniestrosAbiertos: 0, ...x,
})

test('vencimientos: solo en vigor, con fecha, de hoy a 60 días, del más cercano al más lejano', () => {
  const r = pendienteInicio({
    hoy: HOY,
    polizas: [
      pol({ id: 'a', vence: '2026-12-20' }), // 55 días
      pol({ id: 'b', vence: '2026-10-27' }), // mañana
      pol({ id: 'c', vence: '2027-03-01' }), // fuera de ventana
      pol({ id: 'd', vence: '2026-10-01' }), // pasada: no «renovó»
      pol({ id: 'e', vence: '2026-11-01', enVigor: false }),
      pol({ id: 'f', vence: null }),
    ],
  })
  assert.deepEqual(r.vencimientos.map((v) => v.clave), ['vence:b', 'vence:a'])
  assert.equal(r.vencimientos[0].detalle, 'Vence mañana')
  assert.equal(r.vencimientos[1].detalle, 'Vence el 20/12/2026')
})

test('vencimientos: las aportadas que vencen en la ventana entran, con su rótulo y su ficha', () => {
  const r = pendienteInicio({
    hoy: HOY,
    polizas: [pol({ id: 'a', vence: '2026-12-20' })],
    declaradas: [{ id: 'x', etiqueta: 'Hogar · Otra', enVigor: true, vence: '2026-11-15' }, { id: 'y', etiqueta: 'Coche', enVigor: false, vence: '2026-11-15' }],
  })
  assert.deepEqual(r.vencimientos.map((v) => v.clave), ['vence-aportada:x', 'vence:a'])
  assert.equal(r.vencimientos[0].href, '/boveda/anadida/x')
})

test('recibos: devuelto = urgente y primero; al cobro solo si cae en 30 días; el de una póliza AJENA no es suyo', () => {
  const r = pendienteInicio({
    hoy: HOY,
    polizas: [
      pol({ id: 'a', proximoRecibo: '2026-11-10' }),
      pol({ id: 'b', devueltos: 2 }),
      pol({ id: 'c', proximoRecibo: '2027-02-01' }),
      pol({ id: 'd', propia: false, devueltos: 1, proximoRecibo: '2026-11-02' }),
    ],
  })
  assert.deepEqual(r.recibos.map((x) => x.clave), ['devuelto:b', 'cobro:a'])
  assert.equal(r.recibos[0].urgente, true)
  assert.equal(r.recibos[1].urgente, false)
})

test('siniestros abiertos: de cualquier póliza que vea', () => {
  const r = pendienteInicio({ hoy: HOY, polizas: [pol({ id: 'a', siniestrosAbiertos: 1 }), pol({ id: 'b', propia: false, siniestrosAbiertos: 3 })] })
  assert.deepEqual(r.siniestros.map((s) => s.clave), ['siniestro:a', 'siniestro:b'])
  assert.match(r.siniestros[1].titulo, /^3 siniestros abiertos/)
})

test('🚨 una fuente ilegible se DECLARA y nunca se lee como «nada pendiente»', () => {
  const todo = pendienteInicio({ hoy: HOY, polizas: null })
  assert.deepEqual(todo.sinComprobar, ['vencimientos', 'recibos', 'siniestros'])
  assert.equal(hayPendiente(todo), false)
  const parcial = pendienteInicio({ hoy: HOY, polizas: [pol({ devueltos: null, siniestrosAbiertos: null })] })
  assert.deepEqual([...parcial.sinComprobar].sort(), ['recibos', 'siniestros'])
  // Siniestros de una AJENA sin leer = «no visible en tu nivel», no un fallo nuestro.
  assert.deepEqual(pendienteInicio({ hoy: HOY, polizas: [pol({ propia: false, siniestrosAbiertos: null })] }).sinComprobar, [])
  // Las aportadas ilegibles también se declaran (vencimientos).
  assert.deepEqual(pendienteInicio({ hoy: HOY, polizas: [], declaradas: null }).sinComprobar, ['vencimientos'])
  // El recibo de una póliza ajena no se mira: no cuenta como «sin comprobar» el que no es suyo.
  assert.deepEqual(pendienteInicio({ hoy: HOY, polizas: [pol({ propia: false, devueltos: null })] }).sinComprobar, [])
})

test('sin nada pendiente y todo leído: vacío limpio (la pantalla pinta el estado amable)', () => {
  const r = pendienteInicio({ hoy: HOY, polizas: [pol({}), pol({ id: 'z', vence: '2027-09-01' })] })
  assert.equal(hayPendiente(r), false)
  assert.deepEqual(r.sinComprobar, [])
})
