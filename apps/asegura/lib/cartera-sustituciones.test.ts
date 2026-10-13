// Cepo del FUENTE de la consulta de seguimiento de sustituciones (SQL crudo: tsc no lo ve).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./cartera-sustituciones.ts', import.meta.url), 'utf8')

test('el recibo CIMA se distingue por origen = cima y situacion = cobrado', () => {
  assert.match(src, /r\.poliza_id = n\.id and r\.origen::text = 'cima' and r\.situacion::text = 'cobrado'/)
})

test('la vieja en vigor exige id_poliza_entidad y ausencia de baja CIMA, y mantiene la fila', () => {
  assert.match(src, /v\.id_poliza_entidad is not null\s+and v\.baja_cima_at is null and v\.baja_estado_cima is null/)
  assert.match(src, /n\.id_poliza_entidad is null\s+or \(v\.estado::text = any/)
})

test('tres estados: sin nueva o sin estado → null, no false', () => {
  assert.match(src, /case when n\.id is null then null else exists/)
  assert.match(src, /case when v\.estado is null then null/)
})
