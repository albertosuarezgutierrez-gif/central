import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DIAS_ENTRE_REVISIONES,
  DIAS_HORIZONTE_REVISION,
  tocaRevisionAnual,
  type EntradaRevision,
} from './revision-anual.ts'

const HOY = new Date('2026-10-01T09:00:00Z')
const dias = (n: number) => new Date(HOY.getTime() + n * 86_400_000)

function entrada(p: Partial<EntradaRevision> = {}): EntradaRevision {
  return { consentimientoComercial: true, ultimaRevisionEn: null, vencimientos: [dias(40)], ...p }
}

test('🚨 sin consentimiento AFIRMATIVO no se escribe: null NO es un sí', () => {
  // `null` es «nunca marcó la casilla» o «la marcó sobre un texto viejo». Las
  // dos son la diferencia entre un aviso pedido y un mailing (art. 21 LSSI).
  assert.deepEqual(tocaRevisionAnual(entrada({ consentimientoComercial: null }), HOY), { toca: false, motivo: 'sin_consentimiento' })
  assert.deepEqual(tocaRevisionAnual(entrada({ consentimientoComercial: false }), HOY), { toca: false, motivo: 'sin_consentimiento' })
})

test('🚨 una al año: la de hace menos de DIAS_ENTRE_REVISIONES no se repite', () => {
  assert.deepEqual(tocaRevisionAnual(entrada({ ultimaRevisionEn: dias(-10) }), HOY), { toca: false, motivo: 'reciente' })
  assert.deepEqual(
    tocaRevisionAnual(entrada({ ultimaRevisionEn: dias(-(DIAS_ENTRE_REVISIONES - 1)) }), HOY),
    { toca: false, motivo: 'reciente' },
  )
  assert.equal(tocaRevisionAnual(entrada({ ultimaRevisionEn: dias(-DIAS_ENTRE_REVISIONES) }), HOY).toca, true)
  assert.ok(DIAS_ENTRE_REVISIONES < 365, 'con 365 exactos, un cron mensual corre la revisión un mes cada año')
})

test('🚨 sin un vencimiento en el horizonte no hay nada que revisar', () => {
  assert.deepEqual(tocaRevisionAnual(entrada({ vencimientos: [] }), HOY), { toca: false, motivo: 'sin_vencimiento_proximo' })
  assert.deepEqual(
    tocaRevisionAnual(entrada({ vencimientos: [dias(DIAS_HORIZONTE_REVISION + 1), dias(-1)] }), HOY),
    { toca: false, motivo: 'sin_vencimiento_proximo' },
  )
  // Un vencimiento de AYER no es próximo: ya pasó, y hablar de él es hablar tarde.
})

test('cuando toca, devuelve los próximos ORDENADOS y solo los del horizonte', () => {
  const d = tocaRevisionAnual(entrada({ vencimientos: [dias(80), dias(5), dias(200), dias(DIAS_HORIZONTE_REVISION)] }), HOY)
  assert.equal(d.toca, true)
  if (d.toca) assert.deepEqual(d.proximos.map((x) => x.toISOString().slice(0, 10)), ['2026-10-06', '2026-12-20', '2026-12-30'])
})

test('el orden de los motivos: sin consentimiento manda sobre todo lo demás', () => {
  assert.equal(
    tocaRevisionAnual(entrada({ consentimientoComercial: null, ultimaRevisionEn: dias(-1), vencimientos: [] }), HOY).motivo,
    'sin_consentimiento',
  )
  assert.equal(tocaRevisionAnual(entrada({ ultimaRevisionEn: dias(-1), vencimientos: [] }), HOY).motivo, 'reciente')
})
