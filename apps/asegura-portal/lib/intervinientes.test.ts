import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposDeInterviniente, figuraChip, figuraEnPropias, figurasEnPolizas, rolesPropiosPorPoliza, nivelMasAlto, rolesLegibles } from './intervinientes.ts'

const NIEVES = 'c-nieves'
const VICTOR = 'c-victor'

const base = {
  propiosIds: [NIEVES],
  nivelPorCliente: new Map([[NIEVES, 'completo' as const]]),
  yaVisibles: new Set<string>(),
}

test('Nieves, propietaria del Toyota de Víctor, ve ESA póliza y solo esa', () => {
  const r = figurasEnPolizas({
    ...base,
    filas: [{ polizaId: 'toyota', clienteId: NIEVES, rol: 'propietario' }],
    // La otra de Víctor (su hogar) llega como candidata solo si ella figura; aquí ni figura.
    polizas: [{ id: 'toyota', clienteId: VICTOR }, { id: 'hogar-victor', clienteId: VICTOR }],
  })
  assert.deepEqual([...r.keys()], ['toyota'])
  assert.deepEqual(r.get('toyota'), { tomadorId: VICTOR, nivel: 'completo', roles: ['propietario'] })
})

test('una fila de interviniente de OTRO cliente no abre nada, aunque la consulta la colara', () => {
  const r = figurasEnPolizas({
    ...base,
    filas: [{ polizaId: 'toyota', clienteId: 'c-otro', rol: 'propietario' }, { polizaId: 'x', clienteId: null, rol: 'contacto' }],
    polizas: [{ id: 'toyota', clienteId: VICTOR }, { id: 'x', clienteId: VICTOR }],
  })
  assert.equal(r.size, 0)
})

test('si el tomador es una ficha propia, no es de aquí: ya está en «propias»', () => {
  const r = figurasEnPolizas({
    ...base,
    filas: [{ polizaId: 'suya', clienteId: NIEVES, rol: 'conductor_habitual' }],
    polizas: [{ id: 'suya', clienteId: NIEVES }],
  })
  assert.equal(r.size, 0)
})

test('sin póliza candidata (no viva o fusionada) no se abre nada', () => {
  const r = figurasEnPolizas({ ...base, filas: [{ polizaId: 'volcado', clienteId: NIEVES, rol: 'propietario' }], polizas: [] })
  assert.equal(r.size, 0)
})

test('lo que ya se ve por una autorización o por ser dueño no se duplica', () => {
  const r = figurasEnPolizas({
    ...base,
    yaVisibles: new Set(['toyota']),
    filas: [{ polizaId: 'toyota', clienteId: NIEVES, rol: 'propietario' }],
    polizas: [{ id: 'toyota', clienteId: VICTOR }],
  })
  assert.equal(r.size, 0)
})

test('varios papeles y varias fichas propias: roles juntos y el nivel MÁS ALTO', () => {
  const r = figurasEnPolizas({
    propiosIds: [NIEVES, 'c-nieves-2'],
    nivelPorCliente: new Map([
      [NIEVES, 'tarjeta' as const],
      ['c-nieves-2', 'gestionar' as const],
    ]),
    yaVisibles: new Set(),
    filas: [
      { polizaId: 'toyota', clienteId: NIEVES, rol: 'conductor_ocasional' },
      { polizaId: 'toyota', clienteId: 'c-nieves-2', rol: 'propietario' },
      { polizaId: 'toyota', clienteId: NIEVES, rol: 'conductor_ocasional' },
    ],
    polizas: [{ id: 'toyota', clienteId: VICTOR }],
  })
  assert.deepEqual(r.get('toyota'), { tomadorId: VICTOR, nivel: 'gestionar', roles: ['propietario', 'conductor_ocasional'] })
})

test('nivelMasAlto: vacío cae al más bajo', () => {
  assert.equal(nivelMasAlto([]), 'tarjeta')
  assert.equal(nivelMasAlto(['completo', 'administrar', 'tarjeta']), 'administrar')
})

test('un interviniente nunca hereda IBAN, DNI, documentos ni actuar por el tomador', () => {
  for (const n of ['tarjeta', 'completo', 'gestionar', 'administrar'] as const) {
    const c = camposDeInterviniente(n)
    assert.equal(c.iban, false, n)
    assert.equal(c.dniTomador, false, n)
    assert.equal(c.documentos, false, n)
    assert.equal(c.crearPeticiones, false, n)
    assert.equal(c.autorizarTerceros, false, n)
    assert.equal(c.abrirParte, true, n)
  }
  // Lo del contrato sí sigue al nivel: en `completo` ve prima, recibos y siniestros como el tomador.
  const c = camposDeInterviniente('completo')
  assert.equal(c.prima && c.recibos && c.siniestros, true)
})

test('rolesLegibles', () => {
  assert.equal(rolesLegibles(['propietario']), 'propietario')
  assert.equal(rolesLegibles(['conductor_ocasional', 'propietario']), 'propietario y conductor ocasional')
  assert.equal(rolesLegibles(['contacto', 'asegurado', 'propietario']), 'propietario, asegurado y persona de contacto')
})

test('figuraEnPropias: tomador siempre, más sus papeles; nunca los de otra persona', () => {
  const f = figuraEnPropias({
    polizaIds: ['toyota', 'hogar'],
    propiosIds: [VICTOR],
    filas: [
      { polizaId: 'toyota', clienteId: NIEVES, rol: 'propietario' },
      { polizaId: 'toyota', clienteId: VICTOR, rol: 'conductor_habitual' },
      { polizaId: 'ajena', clienteId: VICTOR, rol: 'conductor_ocasional' },
    ],
  })
  assert.deepEqual(f.get('toyota'), ['tomador', 'conductor_habitual'])
  assert.deepEqual(f.get('hogar'), ['tomador'])
  assert.equal(f.has('ajena'), false)
})

test('figuraChip', () => {
  assert.equal(figuraChip(['conductor_habitual', 'tomador']), 'Tomador y conductor habitual')
  assert.equal(figuraChip(['propietario']), 'Propietario')
  assert.equal(figuraChip([]), '')
})

test('rolesPropiosPorPoliza: caso Esquiansa, conductor habitual del BMW de su sociedad', () => {
  const r = rolesPropiosPorPoliza(
    [
      { polizaId: 'bmw', clienteId: 'c-juanma', rol: 'conductor_habitual' },
      { polizaId: 'bmw', clienteId: 'c-otro', rol: 'propietario' },
    ],
    ['c-juanma'],
  )
  assert.deepEqual(r.get('bmw'), ['conductor_habitual'])
  assert.equal(figuraChip(r.get('bmw') ?? []), 'Conductor habitual')
})
