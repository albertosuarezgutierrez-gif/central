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
  // entonces escribe blanco sobre blanco. La excepción legítima: cuando la
  // MISMA regla declara su propio `background`, el contraste lo fija ella y no
  // el tema — es el caso del blanco sobre el azul de marca (azul de día y de
  // noche) y el del botón de WhatsApp, cuyo verde es de WhatsApp y no de aquí.
  // Lo que este cepo persigue es el color literal a la deriva: el que hereda
  // el fondo de su sección y deja de contrastar cuando esa sección cambia.
  const sospechosos: string[] = []
  for (const [, selector, cuerpo] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const literal = cuerpo.match(/(?:^|;)\s*(?:color|border(?:-[a-z]+)?)\s*:\s*([^;]*(?:#|\brgba?\()[^;]*)/)
    if (!literal) continue
    if (/(?:^|;)\s*background(?:-color)?\s*:/.test(cuerpo)) continue // la regla fija su propio fondo
    sospechosos.push(`${selector.trim()} → ${literal[1].trim()}`)
  }
  assert.deepEqual(sospechosos, [], 'colores literales en la hoja: usa var(--text) / var(--muted) / var(--border)')
})

test('el contraste oscuro existe y es UNO', () => {
  // La web es clara. El oscuro es el corte de ritmo de la banda de cifras, y
  // vale porque es el único: repartirlo por media página lo anula (se probó el
  // 05/09/2026). Este cepo salta en las dos direcciones — si alguien quita la
  // banda, y si alguien empieza a repartir `.oscuro` por la portada.
  const cifras = leer('components', 'Cifras.tsx')
  assert.match(cifras, /seccion oscuro banda-oscura/, 'la banda de cifras perdió .oscuro: se queda sin su fondo y con texto pensado para oscuro sobre claro')

  const home = leer('app', 'page.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  const marcadas = [...home.matchAll(/className="[^"]*\boscuro\b[^"]*"/g)].map((m) => m[0])
  assert.deepEqual(marcadas, [], `la portada volvió a repartir oscuro (${marcadas.join(', ')}): el contraste deja de cortar cuando deja de ser el único`)
})
