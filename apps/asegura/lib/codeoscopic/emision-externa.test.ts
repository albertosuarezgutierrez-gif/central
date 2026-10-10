import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describirEmisionExterna, estadoProyectoDe, leerEmisionExterna, resumenEmision } from './emision-externa.ts'

const quote = (vendor = 'Allianz') => ({ id: 'Q1', premium: 212.5, product: { vendor: { name: vendor }, modality: { name: 'MOTO BÁSICO' } } })
const proyecto = (pa: unknown[], extra: Record<string, unknown> = {}) => ({ id: 40967960, effectiveDate: '2026-09-30', policyApplications: pa, ...extra })

test('aprobada con nº de póliza: no se retiene (la acuña el registro)', () => {
  const e = leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'Approved' }, policyNumber: '0123456789', quote: quote() }]))
  assert.equal(e.estado, 'aprobada')
  assert.equal((e as { solicitud: { numeroPoliza: string | null } }).solicitud.numeroPoliza, '0123456789')
  assert.equal(estadoProyectoDe(e), null)
  assert.match(describirEmisionExterna(e), /póliza nº 0123456789/)
})

test('aprobada SIN nº: sigue retenida', () => {
  const e = leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'Approved' }, quote: quote() }]))
  assert.equal(e.estado, 'aprobada')
  assert.equal(estadoProyectoDe(e), 'riesgo_condicionado')
  assert.match(describirEmisionExterna(e), /sin nº de póliza/)
})

test('pendiente: retenida', () => {
  const e = leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'PendingReview' }, quote: quote() }]))
  assert.equal(e.estado, 'pendiente')
  assert.equal(estadoProyectoDe(e), 'riesgo_condicionado')
})

test('status.id «ConditionedRisk» es pendiente, no desconocido (proyecto 40967960)', () => {
  const e = leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'ConditionedRisk', name: 'Riesgo condicionado' }, quote: quote() }]))
  assert.equal(e.estado, 'pendiente')
  assert.equal(estadoProyectoDe(e), 'riesgo_condicionado')
  assert.match(describirEmisionExterna(e), /RETENIDA/)
})

test('rechazada', () => {
  const e = leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'Rejected' }, quote: quote() }]))
  assert.equal(e.estado, 'rechazada')
  assert.equal(estadoProyectoDe(e), 'rechazada')
})

test('sin solicitud: no dice nada y no mueve nada', () => {
  const e = leerEmisionExterna(proyecto([]))
  assert.deepEqual(e, { estado: 'sin_solicitud' })
  assert.equal(estadoProyectoDe(e), null)
})

test('estado desconocido: no se colapsa a emitida ni a rechazada, y no mueve el estado', () => {
  const e = leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'Zzz' }, quote: quote() }]))
  assert.equal(e.estado, 'desconocido')
  assert.equal(estadoProyectoDe(e), null)
})

test('compañía: desde quote.product.vendor.name', () => {
  const e = leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'ConditionedRisk' }, quote: quote('Reale') }]))
  assert.equal(e.estado !== 'sin_solicitud' && e.compania, 'Reale')
  assert.equal(e.estado !== 'sin_solicitud' && e.primaEur, 212.5)
  assert.equal(e.estado !== 'sin_solicitud' && e.modalidad, 'MOTO BÁSICO')
})

test('compañía: quote solo con id se busca en mainQuotes', () => {
  const e = leerEmisionExterna(
    proyecto([{ id: 'PA1', status: { id: 'ConditionedRisk' }, quote: { id: 'Q9' } }], {
      mainQuotes: [{ id: 'Q8', premium: 1, product: { vendor: { name: 'Otra' } } }, { id: 'Q9', premium: 150, product: { vendor: { name: 'Allianz' }, modality: { name: 'X' } } }],
    }),
  )
  assert.equal(e.estado !== 'sin_solicitud' && e.compania, 'Allianz')
  assert.equal(e.estado !== 'sin_solicitud' && e.quoteId, 'Q9')
})

test('compañía: sin poder saberla es null (varios precios confirmados no se eligen a ojo)', () => {
  const conf = (id: string, v: string) => ({ id, premium: 1, actions: [{ id: 'SubmitPolicyApplication' }], product: { vendor: { name: v } } })
  const e = leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'ConditionedRisk' } }], { mainQuotes: [conf('A', 'Allianz'), conf('B', 'Reale')] }))
  assert.equal(e.estado !== 'sin_solicitud' && e.compania, null)
  assert.match(describirEmisionExterna(e), /RETENIDA/)
})

test('resumenEmision: plano, con el literal del vendor y sin el crudo', () => {
  const r = resumenEmision(leerEmisionExterna(proyecto([{ id: 'PA1', status: { id: 'ConditionedRisk', name: 'Riesgo condicionado' }, quote: quote() }])))
  assert.equal(r.estado, 'pendiente')
  assert.equal(r.compania, 'Allianz')
  assert.equal(r.numeroPoliza, null)
  assert.equal(r.solicitudId, 'PA1')
  assert.equal(r.estadoVendor, 'Riesgo condicionado')
  assert.deepEqual(Object.keys(r).sort(), ['compania', 'descripcion', 'estado', 'estadoVendor', 'modalidad', 'numeroPoliza', 'primaEur', 'solicitudId'])
  const s = resumenEmision({ estado: 'sin_solicitud' })
  assert.equal(s.estado, 'sin_solicitud')
  assert.equal(s.compania, null)
})
