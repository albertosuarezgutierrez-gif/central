// Con el interruptor APAGADO no se genera ni se lee nada: el ejecutor ni se llama.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { senalesPatrimonioActivas, soloConInterruptor } from './patrimonio-senales-gate.ts'

test('apagado: no llama al ejecutor y dice «apagado»', async () => {
  let llamadas = 0
  const r = await soloConInterruptor(async () => { llamadas++; return { estado: 'ok' as const } }, false)
  assert.deepEqual(r, { estado: 'apagado' })
  assert.equal(llamadas, 0)
})

test('encendido: llama al ejecutor una vez', async () => {
  let llamadas = 0
  const r = await soloConInterruptor(async () => { llamadas++; return { estado: 'ok' as const } }, true)
  assert.deepEqual(r, { estado: 'ok' })
  assert.equal(llamadas, 1)
})

test('por defecto (sin env, o con un valor que no es «1») está apagado', () => {
  const antes = process.env.PATRIMONIO_SENALES_ACTIVAS
  try {
    delete process.env.PATRIMONIO_SENALES_ACTIVAS
    assert.equal(senalesPatrimonioActivas(), false)
    for (const v of ['0', 'true', 'on', '']) {
      process.env.PATRIMONIO_SENALES_ACTIVAS = v
      assert.equal(senalesPatrimonioActivas(), false, v)
    }
    process.env.PATRIMONIO_SENALES_ACTIVAS = '1'
    assert.equal(senalesPatrimonioActivas(), true)
  } finally {
    if (antes === undefined) delete process.env.PATRIMONIO_SENALES_ACTIVAS
    else process.env.PATRIMONIO_SENALES_ACTIVAS = antes
  }
})
