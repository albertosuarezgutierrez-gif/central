import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposDeInterviniente, capaInterviniente, figurasDeFichasVistas, figuraChip, figuraEnPropias, figurasEnPolizas, rolesPropiosPorPoliza, nivelMasAlto, rolesLegibles } from './intervinientes.ts'

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

test('rolesPropiosPorPoliza: conductor habitual del coche de su sociedad', () => {
  const r = rolesPropiosPorPoliza(
    [
      { polizaId: 'coche-empresa', clienteId: 'c-admin', rol: 'conductor_habitual' },
      { polizaId: 'coche-empresa', clienteId: 'c-otro', rol: 'propietario' },
    ],
    ['c-admin'],
  )
  assert.deepEqual(r.get('coche-empresa'), ['conductor_habitual'])
  assert.equal(figuraChip(r.get('coche-empresa') ?? []), 'Conductor habitual')
})

// ── Fichas vistas ENTERAS (28/09/2026): la furgoneta de GLOBAL 2 ──────────────
const GLOBAL2 = 'c-global2'
const CONDUCTOR = 'c-conductor'

test('quien ve GLOBAL 2 entera ve la furgoneta donde GLOBAL 2 es propietaria y el tomador es el conductor', () => {
  const r = figurasDeFichasVistas({
    filas: [
      { polizaId: 'furgo', clienteId: GLOBAL2, rol: 'propietario' },
      { polizaId: 'furgo', clienteId: GLOBAL2, rol: 'asegurado' },
      { polizaId: 'furgo', clienteId: CONDUCTOR, rol: 'conductor_habitual' },
    ],
    polizas: [{ id: 'furgo', clienteId: CONDUCTOR }],
    fichasVistas: [GLOBAL2],
    tomadoresYaServidos: [GLOBAL2],
  })
  assert.deepEqual([...r.keys()], [GLOBAL2])
  assert.deepEqual(r.get(GLOBAL2)?.get('furgo'), ['propietario', 'asegurado'])
})

test('solo cuentan filas de las fichas vistas: el papel de otro no abre nada', () => {
  const r = figurasDeFichasVistas({
    filas: [{ polizaId: 'furgo', clienteId: CONDUCTOR, rol: 'conductor_habitual' }],
    polizas: [{ id: 'furgo', clienteId: 'c-otro' }],
    fichasVistas: [GLOBAL2],
    tomadoresYaServidos: [],
  })
  assert.equal(r.size, 0)
})

test('si el tomador ya se sirve (propio o autorizado), no se repite', () => {
  const r = figurasDeFichasVistas({
    filas: [{ polizaId: 'furgo', clienteId: GLOBAL2, rol: 'propietario' }],
    polizas: [{ id: 'furgo', clienteId: CONDUCTOR }],
    fichasVistas: [GLOBAL2],
    tomadoresYaServidos: [CONDUCTOR],
  })
  assert.equal(r.size, 0)
})

test('sin póliza candidata (no viva / fusionada) no hay nada', () => {
  const r = figurasDeFichasVistas({
    filas: [{ polizaId: 'furgo', clienteId: GLOBAL2, rol: 'propietario' }],
    polizas: [],
    fichasVistas: [GLOBAL2],
    tomadoresYaServidos: [],
  })
  assert.equal(r.size, 0)
})

test('dos fichas vistas en la misma póliza: cuelga de UNA (la primera), sin duplicar', () => {
  const r = figurasDeFichasVistas({
    filas: [
      { polizaId: 'furgo', clienteId: 'c-b', rol: 'asegurado' },
      { polizaId: 'furgo', clienteId: GLOBAL2, rol: 'propietario' },
    ],
    polizas: [{ id: 'furgo', clienteId: CONDUCTOR }],
    fichasVistas: [GLOBAL2, 'c-b'],
    tomadoresYaServidos: [],
  })
  assert.deepEqual([...r.keys()], [GLOBAL2])
  assert.deepEqual(r.get(GLOBAL2)?.get('furgo'), ['propietario'])
})

test('capaInterviniente apaga lo de la persona del tomador sobre cualquier nivel', () => {
  const c = capaInterviniente(camposDeInterviniente('completo'))
  assert.equal(c.iban, false)
  assert.equal(c.dniTomador, false)
  assert.equal(c.documentos, false)
  assert.equal(c.crearPeticiones, false)
  assert.equal(c.autorizarTerceros, false)
})
