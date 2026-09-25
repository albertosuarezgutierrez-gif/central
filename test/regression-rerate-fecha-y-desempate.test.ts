// 25/09/2026. Dos cosas del ReRate que se rompen sin que falle nada:
// 1) La fecha de efecto nueva viaja en `mainQuote.effectiveDate` (spec de
//    producción de Codeoscopic); si se deja de mandar, una cotización caducada
//    vuelve a necesitar otro 0,50€ y la fecha elegida al emitir se ignora.
// 2) La pantalla manda producto y prima de la fila pulsada; sin ellos,
//    `encontrarPrecio` coge el PRIMER precio de la compañía y nivel (Reale da
//    hasta 8) y se confirma un producto distinto del elegido.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('reRate manda la fecha de efecto en mainQuote cuando se le pasa', () => {
  const src = leer('apps/asegura/lib/codeoscopic/emitir.ts')
  assert.match(src, /effectiveDate: fechaEfecto/)
  const ruta = leer('apps/asegura/app/api/operador/codeoscopic/oferta/route.ts')
  assert.match(ruta, /opcionesPorDefecto\(compania, t\.producto\),\s*fechaEfectoCorregida,/)
})

test('la pantalla de emisión manda producto, prima y la fecha elegida', () => {
  const src = leer('apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx')
  assert.match(src, /producto: producto \?\? undefined/)
  assert.match(src, /primaEur: primaEur \?\? undefined/)
  assert.match(src, /fechaEfectoCorregida: fechaNueva/)
  const ruta = leer('apps/asegura/app/api/operador/codeoscopic/oferta/route.ts')
  assert.match(ruta, /encontrarPrecio\(cotizacion, compania, categoria, \{/)
})
