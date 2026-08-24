import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoPilotTrack } from './pilot-track.ts'

test('día normal (sin rojos ni watchdog) → null: el vigía no da la lata', () => {
  assert.equal(avisoPilotTrack([], []), null)
})

test('el watchdog solo (datos viejos) ya genera aviso, sin necesitar un rojo', () => {
  const aviso = avisoPilotTrack([], ['Snapshot viejo (3d) — ¿corrió rates/snapshot?'])!
  assert.match(aviso, /Snapshot viejo/)
  assert.match(aviso, /1 aviso\(s\) de datos/)
})

test('los avisos de DATOS van antes que los rojos: sin datos fiables el rojo puede ser mentira', () => {
  const aviso = avisoPilotTrack(
    [{ nombre: 'House Sevillana', diagnosis: 'Sin reservas nuevas en 9 días.' }],
    ['Mercado viejo (8d) — refresca market_rates (ingest).'],
  )!
  assert.ok(aviso.indexOf('Mercado viejo') < aviso.indexOf('House Sevillana'))
})

test('los rojos nombran piso y diagnóstico, y dejan claro que NO se tocan precios', () => {
  const aviso = avisoPilotTrack([{ nombre: 'Luxury Busto', diagnosis: 'Caros vs mercado.' }], [])!
  assert.match(aviso, /Luxury Busto: Caros vs mercado\./)
  assert.match(aviso, /solo propone, no toca precios/)
})
