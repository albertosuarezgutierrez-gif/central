// Guardián del buscador de los desplegables del catálogo de Codeoscopic
// (`/correduria` de plataforma: retarificar, auto-nuevo y moto-nuevo). `node --test`.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Las listas del catálogo son largas —~100 marcas, decenas de modelos, decenas
// de versiones— y el `<select>` nativo obliga a bajar por ellas a ojo. Peor: el
// catálogo devuelve versiones con el nombre EXACTAMENTE repetido («1.0 TGDI
// TECNO 4X2» tres veces, tres códigos Base7 distintos), que sin el código al
// lado se eligen a ciegas.
//
// Volver a poner un `<select>` a pelo en cualquiera de esos campos **no rompe
// nada**: la pantalla sigue funcionando y el corredor pierde el buscador sin que
// falle un solo test. Por eso hay cepo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const PANTALLAS = [
  'apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/retarificador.tsx',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx',
]

for (const pantalla of PANTALLAS) {
  test(`los cuatro campos del catálogo llevan buscador · ${pantalla.split('/').pop()}`, () => {
    const src = leer(pantalla)
    // Marca, modelo, combustible y versión: los cuatro que salen del catálogo.
    const montajes = src.match(/<SelectorBuscable\b/g) ?? []
    assert.equal(montajes.length, 4, `esperaba 4 <SelectorBuscable>, hay ${montajes.length}`)
    // Y ninguno vuelve a ser un <select> a pelo.
    assert.doesNotMatch(src, /<select\s+id="(marca|modelo|motor|version)"/)
  })
}

test('el buscador no se pinta en listas cortas', () => {
  const src = leer('apps/plataforma/app/(usuario)/correduria/SelectorBuscable.tsx')
  assert.match(src, /const MINIMO_PARA_BUSCAR = \d+/)
  assert.match(src, /opciones\.length >= MINIMO_PARA_BUSCAR/)
})

test('la pista PREfiltra, nunca selecciona', () => {
  const src = leer('apps/plataforma/app/(usuario)/correduria/SelectorBuscable.tsx')
  // La pista entra por `consultaSugerida` (texto del buscador). Si alguien la
  // enchufara a `onCambiar`/`valor`, estaría eligiendo una versión por parecido
  // con el texto de OTRA póliza, y eso cambia el precio.
  assert.match(src, /consultaSugerida\(etiquetadas, pista\)/)
  assert.doesNotMatch(src, /onCambiar\(\s*(pista|sugerida)/)
})

test('solo la VERSIÓN recibe pista: con 2+ candidatas se contradicen', () => {
  const src = leer(PANTALLAS[0])
  assert.match(src, /vehiculo\?\.versiones\.length === 1 \? vehiculo\.versiones\[0\]\.version : null/)
  assert.equal((src.match(/\bpista=\{/g) ?? []).length, 1)
})
