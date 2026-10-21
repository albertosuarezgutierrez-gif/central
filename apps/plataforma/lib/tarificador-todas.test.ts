import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoPrevioDe, textoFilaEncolada, loteConOk, loteTerminado, ordenEncolado, resumenLote, type FilaLote } from './tarificador-todas.ts'
import { leerEncoladoBot } from './tarificador-moto-formulario.ts'

test('orden: origen del vehículo primero, Generali al final, sin repetidas', () => {
  assert.deepEqual(ordenEncolado(['generali', 'zurich', 'mapfre', 'Allianz', 'mapfre']), ['mapfre', 'allianz', 'zurich', 'generali'])
  assert.deepEqual(ordenEncolado([]), [])
})

test('lote: terminado solo si todas las encoladas son finales; rechazadas no esperan', () => {
  const a: FilaLote = { compania: 'allianz', estado: 'encolada', trabajoId: 'x', duplicado: false, final: true, ok: true }
  const g: FilaLote = { compania: 'generali', estado: 'encolada', trabajoId: 'y', duplicado: false, final: false, ok: false }
  const r: FilaLote = { compania: 'mapfre', estado: 'rechazada', mensaje: 'x' }
  assert.equal(loteTerminado([a, g, r]), false)
  assert.equal(loteTerminado([a, { ...g, final: true }, r]), true)
  assert.equal(loteTerminado([r]), false)
  assert.equal(loteConOk([a, r]), true)
  assert.equal(loteConOk([{ ...a, ok: false }, r]), false)
  assert.equal(resumenLote([a, g, r]), '3 compañías: 2 encoladas, 1 rechazada')
})

test('encolar: un bot en pausa se explica, no se dice «no autorizada»', () => {
  const r = leerEncoladoBot(409, { estado: 'rechazado', motivo: 'bot_pausado: generali/auto está en pausa tras varios fallos seguidos; reanúdalo en /correduria/tarificador' })
  assert.equal(r.ok, false)
  if (!r.ok) { assert.match(r.mensaje, /en pausa/); assert.doesNotMatch(r.mensaje, /no está autorizada/) }
})

test('el bloque de bots monta «Pedir precio a todas» con el mismo endpoint y deja los botones por compañía', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/PrecioBots.tsx', import.meta.url), 'utf8')
  assert.match(src, /Pedir precio a todas/)
  assert.match(src, /<PedirATodas /)
  assert.match(src, /<FilaBot /)
  assert.equal((src.match(/\/api\/correduria\/tarificador\/encolar/g) ?? []).length, 2)
})

test('duplicado atascado: no se dice «en marcha», se manda a Bots atascados', () => {
  const f: FilaLote = { compania: 'allianz', estado: 'encolada', trabajoId: 'x', duplicado: true, final: false, ok: false, estadoPrevio: 'atascado' }
  assert.match(textoFilaEncolada(f as never), /atascado esperando una elección tuya/)
  assert.match(textoFilaEncolada({ ...f, estadoPrevio: 'pendiente' } as never), /ya había un trabajo en marcha/)
  assert.match(textoFilaEncolada({ ...f, duplicado: false, estadoPrevio: null } as never), /^encolado/)
  assert.equal(estadoPrevioDe({ estadoPrevio: 'atascado' }), 'atascado')
  assert.equal(estadoPrevioDe(null), null)
})
