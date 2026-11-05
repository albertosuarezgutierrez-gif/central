// Guardián de la regla de RENOVACIÓN (Alberto, 05/11/2026): cada POST /insurances de Avant2 cuesta 0,50 € y
// emitir con otra fecha de efecto que la cotizada obliga a re-tarificar. Retarificar una póliza solo se
// hace con el vencimiento confirmado, ≤90 días, y efecto = vencimiento exacto. Si alguien quita el corte
// de `prepararRetarificacion` (o vuelve a «día siguiente»), esto falla. Sin reloj real: es estructural.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, 'apps/asegura', f), 'utf8')

test('prepararRetarificacion corta GRATIS con evaluarEfectoRenovacion antes de preparar el cuerpo', () => {
  const src = leer('lib/retarificar-cartera.ts')
  const ini = src.indexOf('export async function prepararRetarificacion(')
  assert.ok(ini > 0, 'no se encuentra prepararRetarificacion')
  const cuerpo = src.slice(ini, src.indexOf('export type PreparadoRetarificacion', ini))
  const iGate = cuerpo.indexOf('evaluarEfectoRenovacion(')
  assert.ok(iGate > 0, 'se ha quitado el corte de renovación (evaluarEfectoRenovacion)')
  assert.ok(/if \(!ev\.ok\)[\s\S]{0,400}sinGasto\([\s\S]{0,400}422/.test(cuerpo), 'el corte ya no responde 422 sinGasto')
  const iPrepara = cuerpo.indexOf('await prepararAuto(')
  assert.ok(iPrepara > iGate, 'el corte tiene que ir ANTES de preparar el cuerpo del vendor')
  assert.match(cuerpo, /-efecto-forzado/, 'una fecha forzada tiene que quedar registrada en el motivo del libro')
})

test('el efecto por defecto de una póliza que se retarifica es el vencimiento exacto, no el día siguiente', () => {
  for (const f of ['lib/codeoscopic/desde-cartera.ts', 'lib/codeoscopic/desde-cartera-hogar.ts']) {
    assert.ok(!/diaSiguiente\(vencimiento\)/.test(leer(f)), `${f}: vuelve el «día siguiente al vencimiento»`)
  }
})

test('el helper puro mantiene las cuatro causas de corte', () => {
  const h = leer('lib/codeoscopic/efecto-renovacion.ts')
  for (const c of ['sin_vencimiento', 'vencimiento_pasado', 'fuera_de_ventana', 'vencimiento_sospechoso']) {
    assert.ok(h.includes(`causa: '${c}'`), `falta la causa ${c}`)
  }
})
