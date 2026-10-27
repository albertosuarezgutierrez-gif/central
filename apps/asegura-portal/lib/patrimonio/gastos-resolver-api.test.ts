import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type { NivelPatrimonio } from '@central/module-patrimonio'

import type { AccesosMapa } from './gastos-api.ts'
import { responderResolverGasto, type PuertosResolverGasto, type ResultadoResolver } from './gastos-resolver-api.ts'

const MIO = '11111111-1111-1111-1111-111111111111'
const LECTURA = '22222222-2222-2222-2222-222222222222'
const AJENO = '33333333-3333-3333-3333-333333333333'
const GASTO = '44444444-4444-4444-4444-444444444444'

function puertos(accesos: AccesosMapa, res: ResultadoResolver = 'ok') {
  const llamadas: unknown[] = []
  const p: PuertosResolverGasto = { accesos: async () => accesos, resolver: async (x) => { llamadas.push(x); return res } }
  return { p, llamadas }
}
const accesos = new Map<string, NivelPatrimonio>([[MIO, 'gestion']]) as AccesosMapa
const cuerpo = (extra: Record<string, unknown> = {}) => ({ titular: MIO, gasto: GASTO, accion: 'confirmar', ...extra })

test('titular ajeno o fuera de los accesos = la misma 404, y no se toca la BD', async () => {
  for (const titular of [AJENO, LECTURA, 5, undefined]) {
    const { p, llamadas } = puertos(accesos)
    const r = await responderResolverGasto(p, cuerpo({ titular }))
    assert.equal(r.status, 404)
    assert.deepEqual(llamadas, [])
  }
})
test('cuerpo estricto: gasto no uuid → 404; acción rara o importe inválido → 400', async () => {
  const { p, llamadas } = puertos(accesos)
  assert.equal((await responderResolverGasto(p, cuerpo({ gasto: 'x' }))).status, 404)
  assert.equal((await responderResolverGasto(p, cuerpo({ accion: 'borrar' }))).status, 400)
  for (const importeCent of [0, -5, 1.5, '12', Number.NaN]) assert.equal((await responderResolverGasto(p, cuerpo({ importeCent }))).status, 400)
  assert.equal((await responderResolverGasto(p, null)).status, 404)
  assert.deepEqual(llamadas, [])
})
test('confirmar y descartar llegan al puerto; descartar ignora el importe', async () => {
  const { p, llamadas } = puertos(accesos)
  assert.equal((await responderResolverGasto(p, cuerpo({ importeCent: 12345 }))).status, 200)
  assert.equal((await responderResolverGasto(p, cuerpo({ accion: 'descartar', importeCent: 99 }))).status, 200)
  assert.deepEqual(llamadas, [
    { clienteId: MIO, gastoId: GASTO, accion: 'confirmar', importeCent: 12345 },
    { clienteId: MIO, gastoId: GASTO, accion: 'descartar', importeCent: null },
  ])
})
test('idempotente: ya resuelto = 409; gasto ajeno = 404; variable sin importe = 400 importe_requerido', async () => {
  assert.equal((await responderResolverGasto(puertos(accesos, 'ya_resuelto').p, cuerpo())).status, 409)
  assert.equal((await responderResolverGasto(puertos(accesos, 'no_encontrado').p, cuerpo())).status, 404)
  const r = await responderResolverGasto(puertos(accesos, 'importe_requerido').p, cuerpo())
  assert.equal(r.status, 400)
  assert.equal((r.body as { motivo?: string }).motivo, 'importe_requerido')
})
test('el adaptador de BD acota por titular y origen, usa el estado «descartado» y no borra', () => {
  const src = readFileSync(new URL('./gastos-resolver-bd.ts', import.meta.url), 'utf8')
  assert.match(src, /titularId: t\.id/)
  assert.match(src, /origen: \{ in: \['plantilla', 'derrama'\] \}/)
  assert.match(src, /estado: 'descartado'/)
  assert.match(src, /estado: 'propuesto' \}/)
  assert.doesNotMatch(src, /\.delete(Many)?\(/)
})
