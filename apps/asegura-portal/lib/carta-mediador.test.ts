import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarCodigoCarta, interpretarFirmaCarta, interpretarPreparada } from './carta-mediador.ts'

test('🪤 solo un 200 con fecha es «firmada»: un 401, un 5xx o un corte NO', () => {
  assert.equal(interpretarFirmaCarta(200, { estado: 'firmada', firmadaEl: '2026-09-23' }).estado, 'firmada')
  assert.equal(interpretarFirmaCarta(200, { estado: 'firmada' }).estado, 'error')
  assert.equal(interpretarFirmaCarta(401, { error: 'No autorizado' }).estado, 'error')
  assert.equal(interpretarFirmaCarta(503, { estado: 'firmada', firmadaEl: '2026-09-23' }).estado, 'error')
})

test('🪤 con otra ficha no se prepara ni se firma, y se dice por qué', () => {
  const p = interpretarPreparada(409, { estado: 'otra_ficha' })
  assert.equal(p?.estado, 'no_disponible')
  assert.match((p as { motivo: string }).motivo, /otra persona/)
  assert.equal(interpretarPreparada(500, {}), null)
  assert.equal(interpretarPreparada(200, { estado: 'ok', carta: 'x', cartaHash: 'no', consentimiento: 'c' }), null)
  assert.deepEqual(interpretarPreparada(409, { estado: 'ya_firmada', enviada: true }), { estado: 'ya_firmada', enviada: true })
})

test('el código: «enviado» exige correo; un fallo de envío no es culpa del cliente', () => {
  assert.equal(interpretarCodigoCarta(200, { estado: 'codigo_enviado', email: 'a***@x.es', minutos: 10 }).estado, 'codigo_enviado')
  assert.equal(interpretarCodigoCarta(200, { estado: 'codigo_enviado' }).estado, 'error')
  assert.equal(interpretarCodigoCarta(502, { estado: 'fallo_envio' }).estado, 'error')
  assert.equal(interpretarCodigoCarta(422, { estado: 'sin_email' }).estado, 'no_disponible')
})

test('🪤 la vista de corredor no pide código ni firma: el veto va antes', () => {
  const src = readFileSync(new URL('../app/api/presupuesto/carta/route.ts', import.meta.url), 'utf8')
  const veto = src.indexOf('if (identidad.corredor)')
  assert.ok(veto > 0 && veto < src.indexOf('pedirCodigoCarta(identidad.id') && veto < src.indexOf('firmarCarta(identidad.id'))
  assert.doesNotMatch(src, /b\.identidadId|clienteId/)
})
