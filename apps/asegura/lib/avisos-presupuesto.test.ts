import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  LIMITE_OBLIGACIONES,
  MARGEN_CANDIDATA_MS,
  PRESUPUESTO_MS,
  cribaTruncada,
  quedaPresupuesto,
} from './avisos-presupuesto.ts'

/**
 * Se leen los fuentes SIN comentarios a propósito: la primera versión de este
 * cepo casaba `export const maxDuration` estando COMENTADO, o sea seguía verde
 * sobre la ruta que dejaba de declararlo. Un cepo que lee un comentario no
 * vigila el código.
 */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const leer = (p: string) => sinComentarios(readFileSync(new URL(p, import.meta.url), 'utf8'))
const PASADA = leer('./avisos-vencimiento.ts')
const RUTA = leer('../app/api/cron/avisos-vencimiento/route.ts')

test('la criba declara su techo: tocarlo NO es «esto es todo»', () => {
  assert.equal(cribaTruncada(0), false)
  assert.equal(cribaTruncada(LIMITE_OBLIGACIONES - 1), false)
  assert.equal(cribaTruncada(LIMITE_OBLIGACIONES), true)
  // Por encima del tope no puede pasar (lo impide el `take`), pero si pasara
  // tampoco se leería como una lectura completa.
  assert.equal(cribaTruncada(LIMITE_OBLIGACIONES + 1), true)
})

test('🚨 el presupuesto exige el margen ENTERO para una candidata más', () => {
  // Quedarse a medio envío es peor que no empezarlo: el correo sale, el sello
  // no, y la pasada siguiente se lo manda otra vez a la misma persona.
  assert.equal(quedaPresupuesto(0, 1000, 100), true)
  assert.equal(quedaPresupuesto(900, 1000, 100), true)
  assert.equal(quedaPresupuesto(901, 1000, 100), false)
  assert.equal(quedaPresupuesto(2000, 1000, 100), false)
})

test('el presupuesto cabe DENTRO del maxDuration de la ruta', () => {
  const m = /export const maxDuration = (\d+)/.exec(RUTA)
  assert.ok(m, 'la ruta del cron no declara maxDuration: vuelve al techo por defecto')
  const techoMs = Number(m![1]) * 1000
  assert.ok(
    PRESUPUESTO_MS + MARGEN_CANDIDATA_MS <= techoMs,
    `el presupuesto (${PRESUPUESTO_MS}ms) + margen no cabe en el maxDuration (${techoMs}ms): la pasada moriría sin informar`,
  )
})

test('🚨 el `take` de la criba NO es un número suelto, y su techo se declara', () => {
  // Un `take: 500` a pelo recorta en silencio y el resumen presenta el recorte
  // como el total de lo que había que avisar hoy.
  assert.match(PASADA, /take: LIMITE_OBLIGACIONES/, 'la criba vuelve a llevar un número suelto')
  assert.match(PASADA, /cribaTruncada\(filas\.length\)/, 'el techo de la criba no se comprueba')
  assert.match(PASADA, /truncado,/, 'el techo no viaja en el resumen: se recorta y no se dice')
})

test('🚨 el resumen distingue «no tocaba» de «no me dio tiempo»', () => {
  assert.match(PASADA, /pendientes: number/, 'el resumen no puede contar lo que dejó sin intentar')
  assert.match(
    PASADA,
    /resumen\.pendientes = candidatas\.length - i/,
    'al agotarse el presupuesto no se cuentan las candidatas que se quedan fuera',
  )
})

test('el corte por presupuesto NO se aplica al ensayo', () => {
  // `?contar=1` no consulta ni manda: no gasta presupuesto, y cortarlo daría un
  // recuento corto sobre el que se decide si se ENCIENDE el envío real.
  assert.match(PASADA, /if \(!soloContar && !quedaPresupuesto\(/)
})
