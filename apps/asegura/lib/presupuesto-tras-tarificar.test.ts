import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { prepararPresupuestoTrasTarificar, type DepsPrepararTrasTarificar } from './presupuesto-tras-tarificar.ts'

const ids = { correduriaId: 'c1', tarificacionId: 't1' }
const ok = { estado: 'ok' } as never
const sinPrecios = { estado: 'error', motivo: 'sin_precios', detalle: '' } as never

function deps(p: Partial<DepsPrepararTrasTarificar>, llamadas: string[] = []): DepsPrepararTrasTarificar {
  return {
    existe: async () => false,
    preparar: async () => { llamadas.push('preparar'); return ok },
    registrar: (d) => { llamadas.push(`error:${d}`) },
    ...p,
  }
}

test('prepara el presupuesto con la tarificación y el actor', async () => {
  let visto: unknown
  const r = await prepararPresupuestoTrasTarificar(ids, 'Alberto', deps({ preparar: async (c, e) => { visto = [c, e]; return ok } }))
  assert.equal(r, true)
  assert.deepEqual(visto, ['c1', { tarificacionId: 't1', actor: 'Alberto' }])
})

test('idempotente: si ya hay presupuesto vivo no vuelve a preparar', async () => {
  const llamadas: string[] = []
  const r = await prepararPresupuestoTrasTarificar(ids, 'x', deps({ existe: async () => true }, llamadas))
  assert.equal(r, false)
  assert.deepEqual(llamadas, [])
})

test('un fallo al preparar NO lanza: se registra y sigue', async () => {
  const llamadas: string[] = []
  const r = await prepararPresupuestoTrasTarificar(ids, 'x', deps({ preparar: async () => { throw new Error('bd caída') } }, llamadas))
  assert.equal(r, false)
  assert.deepEqual(llamadas, ['error:presupuesto/auto-tras-tarificar'])
})

test('un fallo al comprobar si existe tampoco lanza', async () => {
  const llamadas: string[] = []
  const r = await prepararPresupuestoTrasTarificar(ids, 'x', deps({ existe: async () => { throw new Error('x') } }, llamadas))
  assert.equal(r, false)
  assert.deepEqual(llamadas, ['error:presupuesto/auto-tras-tarificar'])
})

test('sin precios válidos no se crea nada y no es un error', async () => {
  const llamadas: string[] = []
  const r = await prepararPresupuestoTrasTarificar(ids, 'x', deps({ preparar: async () => sinPrecios }, llamadas))
  assert.equal(r, false)
  assert.deepEqual(llamadas, [])
})

test('guardián: las rutas «nuevo» lo enganchan tras guardar la tarificación, dentro de after()', () => {
  for (const ruta of ['auto', 'moto', 'hogar', 'vida', 'decesos', 'salud']) {
    const src = readFileSync(join(import.meta.dirname, `../app/api/operador/codeoscopic/${ruta}-nuevo/route.ts`), 'utf8')
    assert.match(src, /after\(\(\) => completarCoberturasTarificacion\(aCompletar\)\.then\(\(\) => prepararPresupuestoTrasTarificar\(aCompletar, solicitadoPor\)\)\.then\(\(\) => undefined\)\)/, ruta)
  }
})
