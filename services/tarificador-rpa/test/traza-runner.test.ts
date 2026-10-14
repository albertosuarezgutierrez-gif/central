// Cepo (14/10/2026): `tarificacion_trabajo_pasos` estuvo VACÍA porque Moto/Auto/Mapfre no llaman a `ctx.paso`.
// El runner cubre la traza de un adaptador que no instrumenta pasos (`login` + `formulario`), con el código FINAL del
// intento, y congela la traza al cerrar el intento (un `ctx.paso` tardío tras un timeout no se añade).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { crearTraza, validarTraza } from '@central/module-tarificacion'
import { crearTrazaIntento } from '../src/traza-intento.ts'

const reloj = (t0 = 1_000_000) => { let t = t0; return { ahora: () => t, avanza: (ms: number) => { t += ms } } }

test('el runner usa la traza del intento (cableado)', () => {
  const f = readFileSync(new URL('../src/runner.ts', import.meta.url), 'utf8')
  assert.match(f, /paso: ti\.paso/)
  assert.match(f, /ti\.marcarLogin\(\)/)
  assert.match(f, /ti\.cubrir\(\{ ok: false, codigo: c\.tipo \}\)/)
  assert.match(f, /ti\.cerrar\(\)/)
})

test('la traza anotada (ok y fallo, con código fijo y fin) es válida para asegura', () => {
  const t = crearTraza(() => 'portal')
  t.anotar('formulario', Date.now() - 1500)
  t.anotar('formulario', Date.now() - 10, { e: new Error('x') })
  t.anotar('login', Date.now() - 100, { e: null, codigo: 'datos' }, Date.now() - 50)
  assert.equal(validarTraza(t.pasos()).ok, true)
  assert.equal(t.pasos()[2].errorCodigo, 'datos')
  assert.equal(t.pasos()[2].duracionMs, 50)
})

test('(a) el paso grueso lleva el código FINAL del intento, no el del error crudo', () => {
  const r = reloj()
  const base = crearTraza(() => 'portal', r.ahora) // el error crudo se clasificaría «portal»
  const ti = crearTrazaIntento(base, r.ahora)
  r.avanza(500); ti.marcarLogin(); r.avanza(1500)
  ti.cubrir({ ok: false, codigo: 'credenciales' }) // el runner lo reclasificó
  const p = base.pasos()
  assert.deepEqual(p.map((x) => [x.paso, x.ok, x.errorCodigo]), [['login', true, null], ['formulario', false, 'credenciales']])
})

test('(b) un ctx.paso tardío tras cerrar el intento no se añade, y el reintento no se contamina', async () => {
  const r = reloj()
  const base = crearTraza(() => 'portal', r.ahora)
  const ti1 = crearTrazaIntento(base, r.ahora)
  let suelta!: () => void
  const lento = ti1.paso('tarificar', () => new Promise<void>((res) => { suelta = res })) // el adaptador sigue tras el timeout
  r.avanza(1000)
  ti1.cerrar()
  ti1.cubrir({ ok: false, codigo: 'infra' })
  const tras = base.pasos().length
  assert.equal(tras, 1) // solo el grueso (el paso en vuelo no contaba como anotado)
  suelta(); await lento
  assert.equal(base.pasos().length, tras) // el tardío no entra
  const ti2 = crearTrazaIntento(base, r.ahora)
  r.avanza(100)
  ti2.cubrir({ ok: true })
  assert.equal(base.pasos().length, tras + 1) // el reintento SÍ se cubre (no ve los pasos del primero como suyos)
})

test('(c) adaptador sin pasos: login + formulario; sin login superado y fallo: login; con pasos propios no se añade nada', async () => {
  let r = reloj()
  let b = crearTraza(() => 'x', r.ahora)
  let ti = crearTrazaIntento(b, r.ahora)
  r.avanza(2000); ti.marcarLogin(); r.avanza(3000); ti.cubrir({ ok: true })
  assert.deepEqual(b.pasos().map((x) => [x.paso, x.duracionMs]), [['login', 2000], ['formulario', 3000]])
  assert.equal(validarTraza(b.pasos()).ok, true)

  r = reloj(); b = crearTraza(() => 'x', r.ahora); ti = crearTrazaIntento(b, r.ahora)
  r.avanza(800); ti.cubrir({ ok: false, codigo: 'credenciales' })
  assert.deepEqual(b.pasos().map((x) => [x.paso, x.errorCodigo]), [['login', 'credenciales']])

  r = reloj(); b = crearTraza(() => 'x', r.ahora); ti = crearTrazaIntento(b, r.ahora)
  await ti.paso('navegacion', async () => { r.avanza(10) })
  ti.cubrir({ ok: true })
  assert.deepEqual(b.pasos().map((x) => x.paso), ['navegacion'])
})
