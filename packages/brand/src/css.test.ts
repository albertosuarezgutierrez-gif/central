import test from 'node:test'
import assert from 'node:assert/strict'

import { emitirRootCss, emitirVariables, emitirVariablesOscuras } from './css.ts'
import { MARCA_ASEGURA } from './marcas/asegura.ts'
import { MARCA_JOAQUIN_JAEN } from './marcas/joaquin-jaen.ts'
import type { Marca } from './tipos.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Lo que protege este fichero, y por qué cada cepo existe.

test('una marca SIN tema oscuro no emite bloque oscuro', () => {
  // Joaquín Jaén no pide tema oscuro. Emitir un `[data-theme="dark"]` vacío
  // sería peor que no emitirlo: la app creería que puede ofrecer el botón.
  assert.equal(MARCA_JOAQUIN_JAEN.paletaOscura, undefined)
  assert.equal(emitirVariablesOscuras(MARCA_JOAQUIN_JAEN), '')
  const css = emitirRootCss(MARCA_JOAQUIN_JAEN)
  assert.ok(!css.includes('data-theme'), 'no debe emitir selector de tema oscuro')
  assert.ok(!css.includes('.dark'), 'no debe emitir selector .dark')
  assert.ok(css.includes('color-scheme:light'))
})

test('asegura emite los DOS bloques y los dos selectores del oscuro', () => {
  const css = emitirRootCss(MARCA_ASEGURA)
  assert.ok(css.startsWith(':root{'))
  assert.ok(css.includes(':root[data-theme="dark"]'), 'falta el selector por atributo')
  assert.ok(css.includes(':root.dark'), 'falta el selector por clase')
  // Sin esto los controles nativos (scrollbar, select, autorelleno) se quedan
  // en claro sobre fondo oscuro. Es lo que delata un tema oscuro a medias.
  assert.ok(css.includes('color-scheme:dark'))
})

test('el tema oscuro redefine TODA superficie y TODO texto', () => {
  // Una clave que falte en la paleta oscura NO se pinta de oscuro: se queda con
  // el valor del claro. Para el primario eso es aceptable; para un fondo es una
  // caja blanca a medianoche. Estas son las que no pueden faltar nunca.
  const IMPRESCINDIBLES = [
    'fondo', 'fondo2', 'panel', 'panel2',
    'borde', 'bordeSuave',
    'texto', 'textoTenue', 'textoTenue2',
  ] as const
  const oscura = MARCA_ASEGURA.paletaOscura
  assert.ok(oscura, 'asegura debe declarar paleta oscura')
  for (const clave of IMPRESCINDIBLES) {
    assert.equal(typeof oscura[clave], 'string', `falta ${clave} en el tema oscuro`)
  }
})

test('en oscuro la elevación separa con un anillo BLANCO, no con sombra más tenue', () => {
  // Bajarle la opacidad a la sombra clara no produce profundidad sobre negro:
  // produce una tarjeta flotando sobre nada. Lo que separa es `0 0 0 1px` de
  // blanco. Si alguien "simplifica" la elevación oscura, esto muerde.
  const e = MARCA_ASEGURA.paletaOscura?.elevacion
  assert.ok(e, 'el tema oscuro debe traer su propia elevación')
  for (const [nombre, valor] of Object.entries(e)) {
    assert.match(
      valor,
      /0 0 0 1px oklch\(1 0 0/,
      `la elevación oscura "${nombre}" debe llevar anillo blanco de 1px`,
    )
  }
})

test('los neutros de asegura son gris PURO (croma 0), como los de la app real', () => {
  // 🚨 Cepo del 05/09/2026. La versión anterior de esta marca metía "un sesgo
  // mínimo hacia el azul" en `panel2`, `bordeSuave` y `textoTenue2` como
  // decisión propia. Leído el fuente de `app.grupoasegura.com`, el sistema hace
  // lo contrario a propósito: el color de marca vive SOLO en el primario y sus
  // derivados, y cualquier azul que se cuele en los fondos le roba significado
  // al único sitio donde el azul quiere decir algo. Si alguien vuelve a meter
  // un hex azulado en un neutro, este test lo caza.
  const NEUTROS = [
    'fondo', 'fondo2', 'panel', 'panel2',
    'borde', 'bordeSuave',
    'texto', 'textoTenue', 'textoTenue2',
  ] as const
  for (const tema of [MARCA_ASEGURA.paleta, MARCA_ASEGURA.paletaOscura!] as const) {
    for (const clave of NEUTROS) {
      const v = tema[clave] as string | undefined
      if (typeof v !== 'string') continue
      assert.match(
        v,
        /^oklch\(/,
        `${clave} = "${v}": los neutros van en oklch, que es donde se ve el croma`,
      )
      // oklch(L C H) o oklch(L C H / alfa). El croma es el segundo número.
      const nums = v.slice(6, -1).split('/')[0].trim().split(/\s+/)
      const croma = Number(nums[1])
      assert.equal(
        croma,
        0,
        `${clave} = "${v}" tiene croma ${croma}: un neutro tiene que ser gris puro`,
      )
    }
  }
})

test('el primario NO es neutro: el azul de marca sigue ahí', () => {
  // El cepo de arriba, al revés. Un barrido que "neutralizara" toda la paleta
  // dejaría la app en escala de grises y los tests anteriores pasarían.
  assert.equal(MARCA_ASEGURA.paleta.primario, '#3364ee')
  assert.match(MARCA_ASEGURA.paletaOscura!.primario!, /^oklch\(0\.62 0\.2 265\)$/)
})

test('emitirVariables no pierde ninguna clave de color de la paleta', () => {
  // Si alguien añade un color a `PaletaMarca` y olvida el mapa de `css.ts`, el
  // color existe en TypeScript y no llega nunca al CSS: un token fantasma que
  // se depura mirando el sitio equivocado.
  const vars = emitirVariables(MARCA_ASEGURA)
  const ESPERADAS = [
    '--brand', '--brand-ink', '--brand-soft',
    '--accent', '--accent-ink', '--accent-soft',
    '--bg', '--bg2', '--panel', '--panel2',
    '--border', '--border-soft',
    '--text', '--muted', '--muted2',
    '--ok', '--warn', '--danger',
    '--surface-hover', '--surface-active',
    '--shadow-panel', '--shadow-float', '--shadow-over',
    '--serif', '--sans', '--radio',
  ]
  for (const v of ESPERADAS) {
    assert.ok(vars.includes(`${v}:`), `falta ${v} en el CSS emitido`)
  }
})

test('una marca que declara solo superficies oscuras no arrastra las claras', () => {
  const minima: Marca = {
    ...MARCA_ASEGURA,
    id: 'prueba',
    paletaOscura: { fondo: 'oklch(0.1 0 0)' },
  }
  const oscuras = emitirVariablesOscuras(minima)
  assert.equal(oscuras, '--bg:oklch(0.1 0 0)')
  assert.ok(!oscuras.includes('--text:'), 'no debe inventar claves que la marca no declaró')
})
