import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDelModulo, fichasModulos, planDeEscritura, puedeActivar, textoHistorialModulo, type FilaModuloCliente } from './portal-modulos-operador.ts'

const fila = (o: Partial<FilaModuloCliente>): FilaModuloCliente => ({ id: 'f1', identidadId: 'i1', modulo: 'alquileres', estado: 'activo', ...o })

test('patrimonio (alquileres) exige póliza en vigor; flota no', () => {
  assert.equal(puedeActivar('alquileres', { identidades: 1, polizasEnVigor: 0 }).puede, false)
  assert.equal(puedeActivar('alquileres', { identidades: 1, polizasEnVigor: 2 }).puede, true)
  assert.equal(puedeActivar('flota', { identidades: 1, polizasEnVigor: 0 }).puede, true)
})

test('null = no se ha podido mirar: no se ofrece activar y no se confunde con 0', () => {
  const a = puedeActivar('alquileres', { identidades: 1, polizasEnVigor: null })
  assert.ok(!a.puede && /No se han podido comprobar/.test(a.motivo))
  const b = puedeActivar('flota', { identidades: null, polizasEnVigor: 3 })
  assert.ok(!b.puede && /No se ha podido comprobar/.test(b.motivo))
})

test('sin identidad en el portal no hay dónde colgar la fila', () => {
  const d = puedeActivar('flota', { identidades: 0, polizasEnVigor: 3 })
  assert.ok(!d.puede && /aún no ha entrado/.test(d.motivo))
})

test('estado agregado: activo > solicitado > inactivo; las retiradas no cuentan', () => {
  assert.equal(estadoDelModulo([], 'alquileres'), 'inactivo')
  assert.equal(estadoDelModulo([fila({ estado: 'retirado' })], 'alquileres'), 'inactivo')
  assert.equal(estadoDelModulo([fila({ estado: 'solicitado' })], 'alquileres'), 'solicitado')
  assert.equal(estadoDelModulo([fila({ estado: 'solicitado' }), fila({ id: 'f2', identidadId: 'i2' })], 'alquileres'), 'activo')
  assert.equal(estadoDelModulo([fila({ modulo: 'flota' })], 'alquileres'), 'inactivo')
})

test('plan al activar: crea, promueve la solicitada y no toca la activa', () => {
  const filas = [fila({ id: 'a', identidadId: 'i1', estado: 'solicitado' }), fila({ id: 'b', identidadId: 'i2', estado: 'activo' }), fila({ id: 'c', identidadId: 'i3', estado: 'retirado' })]
  assert.deepEqual(planDeEscritura('activar', 'alquileres', ['i1', 'i2', 'i3', 'i4'], filas), [
    { tipo: 'activar', filaId: 'a' },
    { tipo: 'insertar_activo', identidadId: 'i3' },
    { tipo: 'insertar_activo', identidadId: 'i4' },
  ])
})

test('plan al retirar: toda fila vigente de ESAS identidades, nunca las ajenas ni otro módulo', () => {
  const filas = [fila({ id: 'a', identidadId: 'i1' }), fila({ id: 'b', identidadId: 'i2', estado: 'solicitado' }), fila({ id: 'x', identidadId: 'i9' }), fila({ id: 'y', identidadId: 'i1', modulo: 'flota' })]
  assert.deepEqual(planDeEscritura('retirar', 'alquileres', ['i1', 'i2'], filas), [{ tipo: 'retirar', filaId: 'a' }, { tipo: 'retirar', filaId: 'b' }])
})

test('fichas: catálogo entero en orden; sin filas leídas no se pinta nada', () => {
  assert.equal(fichasModulos(null, { identidades: 1, polizasEnVigor: 1 }), null)
  const f = fichasModulos([fila({})], { identidades: 1, polizasEnVigor: 0 })!
  assert.deepEqual(f.map((x) => x.id), ['flota', 'rrhh', 'alquileres'])
  const alq = f.find((x) => x.id === 'alquileres')!
  assert.deepEqual([alq.estado, alq.puedeActivar, alq.motivoNoActivar, alq.puedeRetirar], ['activo', false, null, true])
  const flota = f.find((x) => x.id === 'flota')!
  assert.deepEqual([flota.estado, flota.puedeActivar, flota.puedeRetirar], ['inactivo', true, false])
  const sinPoliza = fichasModulos([], { identidades: 1, polizasEnVigor: 0 })!.find((x) => x.id === 'alquileres')!
  assert.equal(sinPoliza.puedeActivar, false)
  assert.match(sinPoliza.motivoNoActivar ?? '', /póliza en vigor/)
})

test('historial: dice módulo, acción y quién', () => {
  assert.match(textoHistorialModulo('alquileres', 'activar', 'a@b.es'), /activado: Patrimonio y alquileres \(a@b\.es\)/)
  assert.match(textoHistorialModulo('flota', 'retirar', 'x'), /retirado: Flota/)
})
