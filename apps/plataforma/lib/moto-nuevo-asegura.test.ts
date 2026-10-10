// El cuerpo que `cotizarMotoNuevaAsegura` manda al puerto de asegura en una VARIANTE (29/09/2026,
// entrega 2: moto con figuras distintas). Mismo contrato que auto: `oportunidadId`, `figuras`
// (rol → clienteId), `nota`, y `correcciones.propietario` / `correcciones.conductor`.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

import { cotizarMotoNuevaAsegura } from './moto-nuevo-asegura.ts'

test('🪤 variante de moto: `figuras` y `correcciones.conductor` llegan al puerto tal cual', async () => {
  process.env.ASEGURA_OPERADOR_SECRET = 'test-secreto'
  process.env.ASEGURA_URL = 'https://asegura.test'
  let url = ''
  let cuerpo: Record<string, unknown> = {}
  const f = mock.method(globalThis, 'fetch', async (u: string, init: RequestInit) => {
    url = String(u)
    cuerpo = JSON.parse(String(init.body))
    return new Response(JSON.stringify({ estado: 'error', mensaje: 'x' }), { status: 500 })
  })
  try {
    await cotizarMotoNuevaAsegura({
      clienteId: 'tomador-uuid',
      oportunidadId: 'op-uuid',
      figuras: { propietario: 'prop-uuid', conductor_habitual: 'cond-uuid' },
      nota: '  hijo conduce  ',
      correcciones: { conductor: { estadoCivil: 'S', fechaCarnet: '2015-01-01' }, propietario: { estadoCivil: 'C' } },
    })
  } finally {
    f.mock.restore()
  }
  assert.equal(url, 'https://asegura.test/api/operador/codeoscopic/moto-nuevo')
  assert.equal(cuerpo.confirmado, true)
  assert.equal(cuerpo.oportunidadId, 'op-uuid')
  assert.deepEqual(cuerpo.figuras, { propietario: 'prop-uuid', conductor_habitual: 'cond-uuid' })
  assert.equal(cuerpo.nota, 'hijo conduce')
  const correcciones = cuerpo.correcciones as Record<string, unknown>
  assert.deepEqual(correcciones.conductor, { estadoCivil: 'S', fechaCarnet: '2015-01-01' })
  assert.deepEqual(correcciones.propietario, { estadoCivil: 'C' })
})

test('sin oportunidad, `figuras` no viaja (no hay riesgo del que colgarlas)', async () => {
  process.env.ASEGURA_OPERADOR_SECRET = 'test-secreto'
  let cuerpo: Record<string, unknown> = {}
  const f = mock.method(globalThis, 'fetch', async (_u: string, init: RequestInit) => {
    cuerpo = JSON.parse(String(init.body))
    return new Response('{}', { status: 500 })
  })
  try {
    await cotizarMotoNuevaAsegura({ clienteId: 't', figuras: { propietario: 'p' } })
  } finally {
    f.mock.restore()
  }
  assert.equal('figuras' in cuerpo, false)
})
