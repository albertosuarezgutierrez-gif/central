import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearEsquemaOpcional, TTL_ESQUEMA_MS, type ElementoEsquema } from './esquema-opcional.ts'

function montar(respuesta: () => boolean | Error) {
  let t = 1_000_000
  let llamadas = 0
  const e = crearEsquemaOpcional({
    ahora: () => t,
    consultar: async (_: ElementoEsquema) => { llamadas++; const r = respuesta(); if (r instanceof Error) throw r; return r },
  })
  return { e, avanzar: (ms: number) => { t += ms }, llamadas: () => llamadas }
}

test('existe → true y se cachea dentro del TTL', async () => {
  const m = montar(() => true)
  assert.equal(await m.e.existeColumna('codeoscopic_consumo', 'huella'), true)
  assert.equal(await m.e.existeColumna('codeoscopic_consumo', 'huella'), true)
  assert.equal(m.llamadas(), 1)
})

test('no existe → false; al aplicar el SQL se activa solo pasado el TTL', async () => {
  let hay = false
  const m = montar(() => hay)
  assert.equal(await m.e.existeTabla('tarificacion_trabajo_pasos'), false)
  hay = true
  assert.equal(await m.e.existeTabla('tarificacion_trabajo_pasos'), false) // aún cacheado
  m.avanzar(TTL_ESQUEMA_MS + 1)
  assert.equal(await m.e.existeTabla('tarificacion_trabajo_pasos'), true)
})

test('si la comprobación falla se asume «no existe» y se reintenta pronto', async () => {
  let fallar = true
  const m = montar(() => (fallar ? new Error('bd caída') : true))
  assert.equal(await m.e.existeColumna('tarificacion_trabajos', 'bot_version'), false)
  fallar = false
  m.avanzar(31_000)
  assert.equal(await m.e.existeColumna('tarificacion_trabajos', 'bot_version'), true)
})

test('cada elemento tiene su propia entrada de caché', async () => {
  const m = montar(() => true)
  await m.e.existeColumna('a', 'x'); await m.e.existeColumna('a', 'y'); await m.e.existeTabla('a')
  assert.equal(m.llamadas(), 3)
})
