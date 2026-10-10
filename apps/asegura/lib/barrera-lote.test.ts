import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearBarreraLote, type ResultadoCorreoLote } from './barrera-lote.ts'

test('🪤 el correo del lote sale UNA vez, cuando se han unido todos, y todos reciben el mismo resultado', async () => {
  const envios: string[][] = []
  const b = crearBarreraLote<string>(3, async (p) => { envios.push(p); return 'enviado' })
  const r = await Promise.all([b.unirse('a'), b.unirse('b'), b.unirse('c')])
  assert.deepEqual(r, ['enviado', 'enviado', 'enviado'])
  assert.deepEqual(envios, [['a', 'b', 'c']])
})

test('🪤 si uno se cae antes de unirse, no sale nada: los que esperaban y los que lleguen tarde reciben «cancelado»', async () => {
  let enviado = false
  const b = crearBarreraLote<string>(3, async () => { enviado = true; return 'enviado' })
  const esperando = b.unirse('a')
  b.abortar()
  const tarde = await b.unirse('c')
  assert.equal(await esperando, 'cancelado')
  assert.equal(tarde, 'cancelado')
  assert.equal(enviado, false)
})

test('un envío que lanza cuenta como no salido (nadie se queda esperando)', async () => {
  const b = crearBarreraLote<string>(2, async (): Promise<ResultadoCorreoLote> => { throw new Error('smtp') })
  assert.deepEqual(await Promise.all([b.unirse('a'), b.unirse('b')]), ['rechazado', 'rechazado'])
})

test('🪤 un envío que lanza de forma SÍNCRONA tampoco deja a nadie esperando: todos reciben «rechazado»', async () => {
  const enviarSincrono = ((): Promise<ResultadoCorreoLote> => { throw new Error('smtp') }) as (p: string[]) => Promise<ResultadoCorreoLote>
  const b = crearBarreraLote<string>(2, enviarSincrono)
  const primero = b.unirse('a')
  // El último en unirse dispara el envío: no debe lanzar, y el que ya esperaba debe resolverse.
  const ultimo = b.unirse('b')
  const limite = new Promise<'pendiente'>((r) => setTimeout(() => r('pendiente'), 200))
  assert.deepEqual(await Promise.race([Promise.all([primero, ultimo]), limite]), ['rechazado', 'rechazado'])
})

test('abortar después de salir no cambia nada', async () => {
  const b = crearBarreraLote<string>(1, async () => 'enviado')
  const r = b.unirse('a')
  b.abortar()
  assert.equal(await r, 'enviado')
})
