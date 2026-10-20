import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarExpedientes } from './expedientes.ts'

const FILA = {
  id: 'o1', clienteId: 'c1', cliente: 'Ana', ramo: 'auto', clase: 'rescate', estadoVisible: 'abierta', estado: 'en_negociacion',
  delVolcado: false, aparcadaHasta: null, aparcadaMotivo: null,
  proximaAccion: { tareaId: 't1', texto: 'Llamar', tipo: 'llamada', fecha: '2026-10-13' },
  prima: 0, fechaFinVigencia: null, notas: 'año que viene', creada: '2026-10-01T00:00:00.000Z',
  rescate: { tipo: 'recibo', recibo: { reciboId: 'r1', idRecibo: '123', importe: 41.5, efecto: '2026-10-01', suspensionDesde: '2026-10-31', hito: 'inicial', situacion: 'devuelto' } },
}

test('ok: la fila se lee; una prima 0 es «no se sabe» (null), nunca 0,00€', () => {
  const r = interpretarExpedientes(200, { estado: 'ok', hoy: '2026-10-13', expedientes: [FILA], recuento: { abierta: 1, esperando_cliente: 0, aparcada: 0 }, truncado: false, descartadas: 0 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.expedientes.length, 1)
  assert.equal(r.expedientes[0].prima, null)
  assert.equal(r.expedientes[0].rescate?.recibo?.importe, 41.5)
  assert.deepEqual(r.recuento, { abierta: 1, esperando_cliente: 0, aparcada: 0 })
})

test('una clase o estado que esta versión no conoce se CUENTA como descartada, no se pinta', () => {
  const r = interpretarExpedientes(200, { estado: 'ok', expedientes: [{ ...FILA, clase: 'otro' }, { ...FILA, estadoVisible: 'ganada' }], descartadas: 1 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.expedientes.length, 0)
  assert.equal(r.descartadas, 3)
  assert.equal(r.recuento, null, 'sin recuento del puerto no se supone 0')
})

test('no se ha podido mirar ≠ lista vacía', () => {
  assert.deepEqual(interpretarExpedientes(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.equal(interpretarExpedientes(500, { estado: 'error', causa: 'conexion' }).estado, 'error')
  assert.equal(interpretarExpedientes(200, { estado: 'ok' }).estado, 'error')
  assert.deepEqual(interpretarExpedientes(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('tareas sueltas y pérdidas: sin campo = «no se pudo leer» (null), nunca []', () => {
  const r = interpretarExpedientes(200, { estado: 'ok', expedientes: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.tareasSueltas, null)
  assert.equal(r.perdidasPorRevisar, null)
  assert.equal(r.perdidasConExpediente, null)
})

test('tareas sueltas y pérdidas se leen; [] con ok sí es «no hay»', () => {
  const r = interpretarExpedientes(200, {
    estado: 'ok', expedientes: [],
    tareasSueltas: [{ tareaId: 't9', clienteId: null, cliente: null, polizaId: null, siniestroId: null, tipo: 'llamada', estado: 'pendiente', texto: null, fecha: '2026-08-26', origen: 'loo-916:agenda-beta' }],
    tareasSueltasTruncado: false,
    perdidasPorRevisar: [], perdidasConExpediente: 2,
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.tareasSueltas?.length, 1)
  assert.equal(r.tareasSueltas?.[0].texto, '')
  assert.equal(r.tareasSueltas?.[0].clienteId, null)
  assert.deepEqual(r.perdidasPorRevisar, [])
  assert.equal(r.perdidasConExpediente, 2)
})

test('una tarea suelta malformada no se pinta y la lista se marca incompleta; una pérdida malformada → no se sabe', () => {
  const r = interpretarExpedientes(200, {
    estado: 'ok', expedientes: [], tareasSueltas: [{ tareaId: 't1' }], perdidasPorRevisar: [{ id: 'e1' }],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.tareasSueltas, [])
  assert.equal(r.tareasSueltasTruncado, true)
  assert.equal(r.perdidasPorRevisar, null)
})

test('contacto por fila: dato, «no consta» (campos null) y «no se sabe» (null) no se confunden', () => {
  const CONTACTO = { telefono: '600111222', email: 'ana@example.com' }
  const r = interpretarExpedientes(200, {
    estado: 'ok',
    expedientes: [{ ...FILA, contacto: CONTACTO }, { ...FILA, id: 'o2', contacto: { telefono: '', email: null } }, { ...FILA, id: 'o3' }],
    tareasSueltas: [{ tareaId: 't1', tipo: 'llamada', estado: 'pendiente', clienteId: 'c1', contacto: CONTACTO }, { tareaId: 't2', tipo: 'tarea', estado: 'pendiente', contacto: null }],
    perdidasPorRevisar: [{ id: 'e1', tipo: 'baja', clienteId: 'c1', contacto: CONTACTO }, { id: 'e2', tipo: 'baja', clienteId: 'c2', contacto: 'x' }],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.expedientes.map((e) => e.contacto), [CONTACTO, { telefono: null, email: null }, null], 'asegura antigua sin contacto = null, no «no tiene»')
  assert.deepEqual(r.tareasSueltas?.map((t) => t.contacto), [CONTACTO, null])
  assert.deepEqual(r.perdidasPorRevisar?.map((p) => p.contacto), [CONTACTO, null])
})

test('«En la compañía» (20/10/2026): se lee la solicitud; sin campo = null (asegura antiguo); un enlace no https se cae', () => {
  const leer = (solicitudCompania: unknown) => {
    const r = interpretarExpedientes(200, { estado: 'ok', hoy: '2026-10-20', expedientes: [{ ...FILA, solicitudCompania }], truncado: false, descartadas: 0 })
    assert.equal(r.estado, 'ok')
    return r.estado === 'ok' ? r.expedientes[0].solicitudCompania : undefined
  }
  assert.deepEqual(leer({ numero: '170000001', compania: 'occident', estado: 'PTE', url: 'https://portaloccident.gco.global/x', at: null }),
    { numero: '170000001', compania: 'occident', estado: 'PTE', url: 'https://portaloccident.gco.global/x', at: null })
  assert.equal(leer(undefined), null)
  assert.equal(leer({ numero: '170000001', compania: 'occident', estado: null, url: 'javascript:alert(1)' })?.url, null)
  assert.equal(leer({ numero: '', compania: 'occident' }), null)
})
