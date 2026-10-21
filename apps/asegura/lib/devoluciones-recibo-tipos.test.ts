import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Incidente 29/09/2026: `coalesce(d.importe, r.prima_total)` mezclaba numeric (recibo_devolucion.importe)
// con text (poliza_recibos.prima_total) y Postgres lo rechazaba: el seguimiento de devoluciones no corría.
const src = readFileSync(new URL('./devoluciones-recibo.ts', import.meta.url), 'utf8')

test('el coalesce de importe iguala tipos: numeric -> text, nunca numeric con text', () => {
  assert.ok(!/coalesce\(\s*d\.importe\s*,/i.test(src), 'coalesce(d.importe, …) mezcla numeric y text')
  assert.match(src, /coalesce\(d\.importe::text,\s*r\.prima_total\)/)
})

test('importeEiacNum no convierte «» ni texto raro en 0', () => {
  const fn = src.slice(src.indexOf('function importeEiacNum'), src.indexOf('// ── Tarea por hito'))
  assert.ok(!/Number\(v\)/.test(fn), 'Number("") === 0 inventaría un importe')
  assert.match(fn, /importeEiac\(v\)/)
})
