// Cepo de la decisión «qué se avisa por push a una identidad» (`obligaciones-debidas.ts`): vínculo, baja
// confirmada incluida y puente caído = saltar (nunca «sin bajas»).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { obligacionesDebidasDeIdentidad } from './obligaciones-debidas.ts'

const P1 = 'p1'
const P2 = 'p2'
const o = (polizaId: string | null, tipo = 'poliza') => ({ tipo, polizaId })
const sinFirmas = { anulaciones: [], enRevision: [], firmadas: [] }
// Solo los campos que lee `polizasConBajaEnMarcha`.
const firmada = (polizaId: string, estado: string) => ({ polizaId, estado })

test('🪤 sin filtro de vínculo: la póliza de un cliente NO vinculado a esta identidad no se avisa', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(P2)],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map([[P1, 'c1'], [P2, 'c-ajeno']]),
    leerFirmas: async () => sinFirmas,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [o(P1)] })
})

test('póliza no viva (fuera del mapa) no se avisa; recordatorio propio sin póliza sí', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(null, 'itv')],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map(),
    leerFirmas: async () => sinFirmas,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [o(null, 'itv')] })
})

test('🪤 conConfirmadas: una baja YA confirmada también excluye la póliza', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(P2)],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map([[P1, 'c1'], [P2, 'c1']]),
    leerFirmas: async () => ({ ...sinFirmas, firmadas: [firmada(P1, 'confirmada')] }) as never,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [o(P2)] })
})

test('baja en revisión / por firmar también excluye; un recordatorio propio de esa póliza sigue', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(P1, 'itv'), o(P2)],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map([[P1, 'c1'], [P2, 'c1']]),
    leerFirmas: async () => ({ ...sinFirmas, anulaciones: [{ polizaId: P1 }], enRevision: [{ polizaId: P2 }] }) as never,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [o(P1, 'itv')] })
})

test('🪤 puente caído (null) = identidad SALTADA, no «sin bajas»', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1)],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map([[P1, 'c1']]),
    leerFirmas: async () => null,
  })
  assert.deepEqual(r, { estado: 'saltada', motivo: 'puente_no_disponible' })
})

test('sin obligaciones de póliza que comprobar no se pregunta al puente (y un puente caído no salta nada)', async () => {
  let llamadas = 0
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(null, 'itv')],
    clientesVinculados: new Set(),
    clientePorPoliza: new Map(),
    leerFirmas: async () => { llamadas++; return null },
  })
  assert.equal(llamadas, 0)
  assert.deepEqual(r, { estado: 'ok', debidas: [o(null, 'itv')] })
})

test('cableado: el cron decide con el helper, salta la identidad, aísla cada identidad con try/catch y no sella si se salta', () => {
  const cron = readFileSync(new URL('../app/api/cron/avisos-push/route.ts', import.meta.url), 'utf8')
  assert.match(cron, /obligacionesDebidasDeIdentidad\(/)
  assert.match(cron, /estado === 'saltada'/)
  assert.match(cron, /catch \(e\)/)
  assert.doesNotMatch(cron, /\?\? null\)\.length > 0/, 'ya no se trata el fallo del puente como «sin bajas»')
  assert.doesNotMatch(cron, /polizasConBajaEnMarcha|sinObligacionesDePolizasConBaja/, 'esa decisión vive solo en el helper')
})
