import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// «Traer ya» (13/10/2026): reabrir una oportunidad APARCADA mueve a HOY la próxima acción que dejó el
// aparcado (la del día de la vuelta). Sin esto, `dejarRetomar` la dejaba a meses vista y la oportunidad
// «traída» no salía en «Hoy». Lee el FUENTE: lo que vigila es SQL crudo, donde tsc no mira.
const src = readFileSync(new URL('./oportunidad-seguimiento.ts', import.meta.url), 'utf8')
const i = src.indexOf('export async function cambiarEstadoOportunidad')
const cuerpo = src.slice(i, src.indexOf('\nexport async function', i + 10))

test('reabrir una aparcada mueve a hoy la acción del día de la vuelta', () => {
  assert.ok(i >= 0, 'falta cambiarEstadoOportunidad')
  const m = /if \(peticion\.accion === 'reabrir'[^\n]*t\.antes\.aparcadaHasta\)[\s\S]*?\n {4}\}/.exec(cuerpo)
  assert.ok(m, 'reabrir una aparcada no toca su próxima acción')
  assert.match(m[0], /t\.antes\.estado !== 'perdida'/, 'solo al traer una APARCADA, no al reabrir una perdida')
  assert.match(m[0], /update gestiones set fecha_limite = \(\$\{hoyMadridIso\(\)\}::date/, 'la acción no pasa a hoy (Madrid)')
  assert.match(m[0], /correduria_id = \$\{correduriaId\}::uuid/, 'falta el filtro de correduría')
  assert.match(m[0], /origen_trigger = 'central:seguimiento'/, 'solo las tareas de seguimiento')
  assert.match(m[0], /= \$\{t\.antes\.aparcadaHasta\}::date/, 'solo la del día de la vuelta, no cualquier tarea futura')
})
