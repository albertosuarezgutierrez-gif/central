// Cepo de la decisión «qué se avisa por push a una identidad» (`obligaciones-debidas.ts`): vínculo, baja
// confirmada incluida y puente caído = retener las de póliza (nunca «sin bajas») sin perder los recordatorios propios.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { obligacionesDebidasDeIdentidad, sinVencimientoAportadaDuplicado } from './obligaciones-debidas.ts'

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
  assert.deepEqual(r, { estado: 'ok', debidas: [o(P1)], retenidas: 0 })
})

test('póliza no viva (fuera del mapa) no se avisa; recordatorio propio sin póliza sí', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(null, 'itv')],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map(),
    leerFirmas: async () => sinFirmas,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [o(null, 'itv')], retenidas: 0 })
})

test('🪤 conConfirmadas: una baja YA confirmada también excluye la póliza', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(P2)],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map([[P1, 'c1'], [P2, 'c1']]),
    leerFirmas: async () => ({ ...sinFirmas, firmadas: [firmada(P1, 'confirmada')] }) as never,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [o(P2)], retenidas: 0 })
})

test('baja en revisión / por firmar también excluye; un recordatorio propio de esa póliza sigue', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(P1, 'itv'), o(P2)],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map([[P1, 'c1'], [P2, 'c1']]),
    leerFirmas: async () => ({ ...sinFirmas, anulaciones: [{ polizaId: P1 }], enRevision: [{ polizaId: P2 }] }) as never,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [o(P1, 'itv')], retenidas: 0 })
})

test('🪤 puente caído (null): NO se avisan las de póliza (cualquier tipo), quedan retenidas', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(P1, 'itv')],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map([[P1, 'c1']]),
    leerFirmas: async () => null,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [], retenidas: 2 })
})

test('🪤 puente caído (null): los recordatorios propios (sin póliza) SE SIGUEN avisando', async () => {
  const r = await obligacionesDebidasDeIdentidad({
    obligaciones: [o(P1), o(null, 'itv'), o(null, 'caldera')],
    clientesVinculados: new Set(['c1']),
    clientePorPoliza: new Map([[P1, 'c1']]),
    leerFirmas: async () => null,
  })
  assert.deepEqual(r, { estado: 'ok', debidas: [o(null, 'itv'), o(null, 'caldera')], retenidas: 1 })
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
  assert.deepEqual(r, { estado: 'ok', debidas: [o(null, 'itv')], retenidas: 0 })
})

test('cableado: el cron decide con el helper, cuenta las retenidas por puente caído, aísla cada identidad con try/catch y no sella lo retenido', () => {
  const cron = readFileSync(new URL('../app/api/cron/avisos-push/route.ts', import.meta.url), 'utf8')
  assert.match(cron, /obligacionesDebidasDeIdentidad\(/)
  assert.match(cron, /r\.retenidas > 0/)
  assert.doesNotMatch(cron, /estado === 'saltada'/, 'una identidad ya no se salta entera')
  assert.match(cron, /catch \(e\)/)
  assert.doesNotMatch(cron, /\?\? null\)\.length > 0/, 'ya no se trata el fallo del puente como «sin bajas»')
  assert.doesNotMatch(cron, /polizasConBajaEnMarcha|sinObligacionesDePolizasConBaja/, 'esa decisión vive solo en el helper')
})

// ─── Un solo push por vencimiento de póliza APORTADA (13/10/2026) ────────────
const od = (tipo: string, polizaDeclaradaId: string | null) => ({ tipo, polizaDeclaradaId })

test('🪤 vencimiento de aportada con `vencimiento_aportada` activo: este cron NO lo manda (ya sale por avisos-cima)', () => {
  const obligaciones = [od('poliza', 'd1'), od('recibo', 'd1'), od('poliza', null), od('itv', null)]
  const r = sinVencimientoAportadaDuplicado(obligaciones, { silenciados: new Set(), captacionPedida: new Set() })
  assert.deepEqual(r, [od('recibo', 'd1'), od('poliza', null), od('itv', null)])
})

test('con `vencimiento_aportada` silenciado, o la captación ya pedida, el vencimiento sí sale por aquí', () => {
  const obligaciones = [od('poliza', 'd1'), od('poliza', 'd2')]
  assert.deepEqual(sinVencimientoAportadaDuplicado(obligaciones, { silenciados: new Set(['vencimiento_aportada']), captacionPedida: new Set() }), obligaciones)
  assert.deepEqual(sinVencimientoAportadaDuplicado(obligaciones, { silenciados: new Set(['siniestro']), captacionPedida: new Set(['d2']) }), [od('poliza', 'd2')])
})

test('🪤 cableado: avisos-push filtra las aportadas ANTES de decidir y lee polizaDeclaradaId', () => {
  const ruta = readFileSync(new URL('../app/api/cron/avisos-push/route.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.match(ruta, /polizaDeclaradaId: true/)
  assert.match(ruta, /obligacionesDebidasDeIdentidad\(\{\s*obligaciones: sinDuplicado,/)
  assert.match(ruta, /portalAvisoSilenciado\.findMany\(\{ where: \{ identidadId \}/)
})
