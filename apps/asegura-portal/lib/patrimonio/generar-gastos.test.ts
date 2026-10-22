import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type { Derrama, PlantillaGasto } from '@central/module-patrimonio'

import { generarGastosPropuestos, type GastoGenerado, type PuertosGenerador } from './generar-gastos.ts'

const HOY = '2026-10-22'
const T1 = 'tit-1'
const T2 = 'tit-2'

const plantilla = (extra: Partial<PlantillaGasto> = {}): PlantillaGasto => ({
  id: 'pl-1', titularId: T1, inmuebleId: 'inm-1', concepto: 'Comunidad', categoria: 'COMUNIDAD', periodicidad: 'mensual', diaMes: 5,
  inicio: '2026-01-01', fin: null, importe: 12000, activo: true, ...extra,
})
const derrama = (extra: Partial<Derrama> = {}): Derrama => ({
  id: 'de-1', titularId: T1, inmuebleId: 'inm-1', concepto: 'Fachada', total: 100001, cuotas: 4, primera: '2026-09-01', ...extra,
})

/** BD falsa con el mismo contrato que el índice único (titular_id, clave): el segundo insert es `duplicado`. */
function bdFalsa(plantillas: PlantillaGasto[], derramas: Derrama[]) {
  const filas = new Map<string, GastoGenerado>()
  const p: PuertosGenerador = {
    plantillas: async () => plantillas,
    derramas: async () => derramas,
    clavesDe: async (t) => new Set([...filas.keys()].filter((k) => k.startsWith(`${t}|`)).map((k) => k.slice(t.length + 1))),
    insertar: async (g) => {
      const k = `${g.titularId}|${g.clave}`
      if (filas.has(k)) return 'duplicado'
      filas.set(k, g)
      return 'creado'
    },
  }
  return { p, filas }
}

test('el cron ejecutado DOS veces no duplica (plantillas y derramas)', async () => {
  const { p, filas } = bdFalsa([plantilla()], [derrama()])
  const a = await generarGastosPropuestos(p, HOY)
  assert.ok(a.creados > 0)
  const n = filas.size
  const b = await generarGastosPropuestos(p, HOY)
  assert.equal(b.creados, 0)
  assert.equal(filas.size, n)
  assert.equal(b.errores, 0)
})

test('aunque la lectura de claves no vea las filas (carrera), el índice único tolera el duplicado', async () => {
  const { p, filas } = bdFalsa([plantilla()], [])
  const ciego: PuertosGenerador = { ...p, clavesDe: async () => new Set() }
  await generarGastosPropuestos(ciego, HOY)
  const n = filas.size
  const r = await generarGastosPropuestos(ciego, HOY)
  assert.equal(r.creados, 0)
  assert.equal(r.duplicados, n)
  assert.equal(filas.size, n)
})

test('importe null = variable: el gasto nace propuesto SIN importe, nunca 0', async () => {
  const { p, filas } = bdFalsa([plantilla({ importe: null })], [])
  await generarGastosPropuestos(p, HOY)
  assert.ok(filas.size > 0)
  for (const g of filas.values()) assert.equal(g.importe, null)
})

test('derrama: solo las cuotas vencidas, suman exacto y llevan clave <derrama>:<n>', async () => {
  const { p, filas } = bdFalsa([], [derrama({ primera: '2026-08-01' })])
  await generarGastosPropuestos(p, HOY)
  const gs = [...filas.values()]
  assert.deepEqual(gs.map((g) => g.clave), ['de-1:1', 'de-1:2', 'de-1:3'])
  assert.ok(gs.every((g) => g.origen === 'derrama' && g.categoria === 'COMUNIDAD'))
  // 100001 / 4: el resto de céntimo va a la primera; la 4ª (01/11) espera a su mes.
  assert.deepEqual(gs.map((g) => g.importe), [25001, 25000, 25000])
  assert.ok(!gs.some((g) => g.clave === 'de-1:4'))
})

test('un gasto DESCARTADO (su clave existe) no se regenera', async () => {
  const { p, filas } = bdFalsa([plantilla()], [])
  await generarGastosPropuestos(p, HOY)
  const k = [...filas.keys()][0]
  const antes = filas.size
  // «Descartar» no borra la fila: sigue ocupando la clave.
  const r = await generarGastosPropuestos(p, HOY)
  assert.equal(r.creados, 0)
  assert.equal(filas.size, antes)
  assert.ok(filas.has(k))
})

test('cada gasto cuelga del titular de SU plantilla; titulares distintos no se mezclan', async () => {
  const { p, filas } = bdFalsa([plantilla({ id: 'a', titularId: T1 }), plantilla({ id: 'b', titularId: T2, inmuebleId: null })], [])
  await generarGastosPropuestos(p, HOY)
  for (const g of filas.values()) assert.equal(g.titularId, g.plantillaId === 'a' ? T1 : T2)
  assert.ok([...filas.values()].some((g) => g.plantillaId === 'b' && g.inmuebleId === null))
})

test('una fila que falla no tumba la pasada: se cuenta como error y el resto sigue', async () => {
  const { p, filas } = bdFalsa([plantilla({ id: 'a' }), plantilla({ id: 'b' })], [])
  const rota: PuertosGenerador = { ...p, insertar: async (g) => { if (g.plantillaId === 'a') throw new Error('boom'); return p.insertar(g) } }
  const r = await generarGastosPropuestos(rota, HOY)
  assert.ok(r.errores > 0)
  assert.ok(filas.size > 0)
})

test('el adaptador de BD tolera P2002 y escribe estado propuesto', () => {
  const src = readFileSync(new URL('./generar-gastos-bd.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.match(src, /e\.code === 'P2002'\) return 'duplicado'/)
  assert.match(src, /estado: 'propuesto'/)
  assert.doesNotMatch(src, /totalCent: g\.importe \?\? 0/)
})
