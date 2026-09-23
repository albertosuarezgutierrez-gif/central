import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POLITICA, borradorReciboDevuelto, caducaEn, decisionValida } from './aprobaciones.ts'

const hoy = new Date('2026-09-23T10:00:00Z')
const base = { ramo: 'auto', compania: 'MAPFRE', numeroPoliza: '3021700291186', importe: 225.97, vencimiento: '2026-09-10', hoy }

test('mandar un correo a un cliente pide OK: la política no lo deja ir solo', () => {
  assert.equal(POLITICA.enviar_correo_cliente, 'aprobar')
})

test('en plazo: dice hasta cuándo se puede pagar sin perder cobertura, con importe español', () => {
  const b = borradorReciboDevuelto(base)!
  assert.equal(b.urgente, false)
  assert.match(b.texto, /225,97€/)
  assert.match(b.texto, /antes del 10\/10\/2026/)
  assert.match(b.texto, /terminada en 1186/)
  assert.doesNotMatch(b.texto, /3021700291186/, 'nunca el número de póliza entero')
})

test('pasado el mes: en suspenso desde la fecha y vuelve a las 24 h; pasado medio año no se propone nada', () => {
  const b = borradorReciboDevuelto({ ...base, vencimiento: '2026-07-01' })!
  assert.equal(b.urgente, true)
  assert.match(b.texto, /en suspenso desde el 31\/07\/2026/)
  assert.match(b.asunto, /suspenso/)
  assert.equal(borradorReciboDevuelto({ ...base, vencimiento: '2026-01-01' }), null)
})

test('sin importe ni fecha no inventa cifras ni plazos', () => {
  const b = borradorReciboDevuelto({ ...base, importe: null, vencimiento: null })!
  assert.doesNotMatch(b.texto, /€|\d{2}\/\d{2}\/\d{4}/)
})

test('la decisión: aprobar exige asunto y texto; el asunto no puede partir cabeceras', () => {
  assert.deepEqual(decisionValida({ decision: 'rechazar' }), { decision: 'rechazar' })
  assert.equal(decisionValida({ decision: 'aprobar', asunto: '', texto: 'x' }), null)
  assert.equal(decisionValida({ decision: 'borrar' }), null)
  const d = decisionValida({ decision: 'aprobar', asunto: 'Hola\r\nBcc: x@y', texto: 'cuerpo' })
  assert.ok(d && d.decision === 'aprobar' && !/[\r\n]/.test(d.asunto))
})

test('caduca a los 7 días', () => {
  assert.equal(caducaEn(hoy).toISOString(), '2026-09-30T10:00:00.000Z')
})
