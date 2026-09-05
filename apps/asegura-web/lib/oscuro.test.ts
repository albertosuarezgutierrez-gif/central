// Guardián de la atmósfera oscura.
//
// La portada, la marquesina, el escáner, las cifras y el formulario comparten
// UNA sola atmósfera, y ninguna de las piezas declara un color: todas se pintan
// con los tokens que `layout.tsx` inyecta en ámbito `.oscuro` a partir de
// `MARCA_ASEGURA.paletaOscura`. Ese acoplamiento se rompe en silencio de tres
// formas, y ninguna falla en `tsc` ni en `next build`:
//
//   1. alguien quita `paletaOscura` de la marca → `emitirVariablesOscuras`
//      devuelve '' y las secciones marcadas se ven CLARAS (texto claro sobre
//      fondo claro, o directamente el diseño de antes);
//   2. alguien deja de inyectar el bloque en el layout → lo mismo;
//   3. alguien vuelve a escribir un color oscuro a mano en `globals.css`, y a
//      partir de ahí la web y el resto del monorepo divergen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// Import por ruta y con extensión, no por el nombre del paquete: `node --test`
// con type-stripping no resuelve los `import './css'` sin extensión del barril
// de `@central/brand` (la app sí, porque la resuelve Next). Es una limitación
// del runner, no del paquete.
import { MARCA_ASEGURA } from '../../../packages/brand/src/marcas/asegura.ts'
import { emitirVariablesOscuras } from '../../../packages/brand/src/css.ts'

const RAIZ = join(import.meta.dirname, '..')
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')

test('la marca declara paleta oscura y emite tokens', () => {
  assert.ok(MARCA_ASEGURA.paletaOscura, 'MARCA_ASEGURA se quedó sin paletaOscura: las secciones .oscuro se verían claras')
  const css = emitirVariablesOscuras(MARCA_ASEGURA)
  for (const v of ['--bg', '--panel', '--border', '--text', '--muted', '--brand']) {
    assert.match(css, new RegExp(`${v}:`), `falta ${v} en la paleta oscura: los componentes de dentro no se re-tematizan`)
  }
})

test('el layout inyecta esos tokens en ámbito .oscuro', () => {
  const layout = leer('app', 'layout.tsx')
  assert.match(layout, /emitirVariablesOscuras\(MARCA_ASEGURA\)/, 'el layout ya no emite la paleta oscura')
  assert.match(layout, /\.oscuro\{/, 'el bloque .oscuro dejó de emitirse: las secciones marcadas se quedan sin tokens')
})

test('la hoja NO reescribe a mano ningún color oscuro', () => {
  // Sin comentarios: aquí solo interesa lo que el navegador aplica.
  const css = leer('app', 'globals.css').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(
    css,
    /--hero-oscuro[a-z-]*\s*:/,
    'volvieron los tokens sueltos de la banda oscura: el oscuro sale de la paleta de la marca, no de esta hoja',
  )
  // Un color literal sobrevive al día que su sección cambie de fondo, y
  // entonces escribe blanco sobre blanco. La excepción legítima —y la única—
  // es el texto que va SOBRE el azul de marca: ese azul es azul de día y de
  // noche, así que su blanco no depende del tema. Se busca por bloque: color
  // literal en una regla que no pinta su propio fondo de marca.
  const sospechosos: string[] = []
  for (const [, selector, cuerpo] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const literal = cuerpo.match(/(?:^|;)\s*(?:color|border(?:-[a-z]+)?)\s*:\s*([^;]*(?:#|\brgba?\()[^;]*)/)
    if (!literal) continue
    if (/background[^;]*var\(--brand/.test(cuerpo)) continue // texto sobre el azul de marca
    sospechosos.push(`${selector.trim()} → ${literal[1].trim()}`)
  }
  assert.deepEqual(sospechosos, [], 'colores literales en la hoja: usa var(--text) / var(--muted) / var(--border)')
})

test('la portada y el cierre van en oscuro', () => {
  const home = leer('app', 'page.tsx')
  assert.match(home, /className="hero oscuro"/, 'la portada dejó de ser oscura: la página vuelve a ser diez bloques blancos')
  assert.match(home, /className="seccion oscuro" id="presupuesto"/, 'el formulario de cierre dejó de ser oscuro')
  const cifras = leer('components', 'Cifras.tsx')
  assert.match(cifras, /seccion oscuro banda-oscura/, 'la banda de cifras perdió .oscuro y se quedaría sin fondo')
})
