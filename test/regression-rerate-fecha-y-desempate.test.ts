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
  // Las opciones del ReRate se componen antes (catálogo por defecto + descuento del corredor):
  // lo que se vigila es que la fecha corregida siga viajando junto a ellas.
  assert.match(ruta, /productOptionsCorredor \?\? opcionesParaReRate\(precio\.productOptions, compania, producto\)/)
  assert.match(ruta, /opcionesRerate,\s*fechaEfectoCorregida,/)
})

test('la pantalla de emisión manda producto, prima y la fecha elegida', () => {
  const src = leer('apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx')
  assert.match(src, /producto: producto \?\? undefined/)
  assert.match(src, /primaEur: primaEur \?\? undefined/)
  // 30/09/2026: la modalidad es la llave del precio (ver `encontrarPrecio`).
  assert.match(src, /modalidad: modalidad \?\? undefined/)
  // 30/09/2026 (tarde): y el id del vendor, que es la IDENTIDAD del precio.
  assert.match(src, /idPrecio: idPrecio \?\? undefined/)
  assert.match(src, /fechaEfectoCorregida: fechaNueva/)
  const ruta = leer('apps/asegura/app/api/operador/codeoscopic/oferta/route.ts')
  assert.match(ruta, /encontrarPrecio\(cotizacion, compania, categoria, \{/)
  assert.match(ruta, /modalidad,\n\s*idPrecio: cadena\(cuerpo\.idPrecio\),\n\s*\}\)/)
  const lib = leer('apps/plataforma/lib/retarificar-asegura.ts')
  assert.match(lib, /modalidad\?: string/)
  assert.match(lib, /idPrecio\?: string/)
  // Cada pantalla que abre el panel de emisión le pasa el id de la fila pulsada.
  for (const f of [
    'apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/retarificador.tsx',
    'apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx',
    'apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx',
    'apps/plataforma/app/(usuario)/correduria/cliente/[id]/hogar-nuevo/Formulario.tsx',
  ]) {
    const usos = leer(f).split('<Emision').length - 1
    const conId = (leer(f).match(/idPrecio=\{/g) ?? []).length
    assert.equal(conId, usos, `${f}: ${usos} paneles de emisión y ${conId} con idPrecio`)
  }
})
