import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueOportunidades, interpretarOportunidadesAviso, oportunidadesPorAvisar } from './oportunidades-aviso.ts'

const op = (o: Record<string, unknown> = {}) => ({
  id: '00000000-0000-0000-0000-000000000001', cliente: 'Ana *López*', ramo: 'auto', aseguradora: 'Línea Directa',
  vence: '2026-11-13', dias: 45, fueCliente: false, ...o,
})

test('el puerto: fallo ≠ lista vacía, y las filas cojas se caen', () => {
  assert.deepEqual(interpretarOportunidadesAviso(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.equal(interpretarOportunidadesAviso(200, { estado: 'error' }).estado, 'error')
  assert.equal(interpretarOportunidadesAviso(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  const r = interpretarOportunidadesAviso(200, { estado: 'ok', oportunidades: [op(), { id: 'x' }, op({ vence: 'mañana' })] })
  assert.equal(r.estado === 'ok' && r.oportunidades.length, 1)
})

test('un aviso por oportunidad y ciclo', () => {
  const a = op()
  const b = op({ id: 'b', vence: '2026-10-10', dias: 11 })
  assert.deepEqual(oportunidadesPorAvisar([a, b], new Set([`${a.id}|${a.vence}`])).map((o) => o.id), ['b'])
  // El mismo id con otro vencimiento (el ciclo siguiente) vuelve a sonar.
  assert.equal(oportunidadesPorAvisar([a], new Set([`${a.id}|2025-11-13`])).length, 1)
})

test('el bloque: cliente, ramo, compañía actual y vencimiento; nada nuevo → calla; fallo → lo dice', () => {
  const ok = { estado: 'ok' as const, oportunidades: [op()], truncado: false }
  const b = bloqueOportunidades(ok, [op(), op({ id: 'c', cliente: 'Luis', aseguradora: null, fueCliente: true })]) ?? ''
  assert.match(b, /45 días/)
  assert.match(b, /Ana López — .* en Línea Directa, vence el 13\/11\/2026 \(45 d\)/)
  assert.doesNotMatch(b, /\*López\*/)
  assert.match(b, /Luis — .*compañía no consta.*sin mandar precio/)
  assert.equal(bloqueOportunidades(ok, []), null)
  assert.match(bloqueOportunidades({ estado: 'error', motivo: 'red' }, []) ?? '', /NO significa que no haya/)
  assert.equal(bloqueOportunidades({ estado: 'sin_configurar' }, []), null)
})
