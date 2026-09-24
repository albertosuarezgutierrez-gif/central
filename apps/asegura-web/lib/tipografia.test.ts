// Guardián de la voz tipográfica de la portada.
//
// La web usa DOS familias (24/09/2026): Nunito Sans para el cuerpo y Quicksand
// —la del logotipo— para titulares, menú y botones. Antes eran Inter y
// Fraunces; lo que sigue sobre la itálica se escribió con Fraunces y vale igual. Hasta el 07/09/2026 los
// titulares mezclaban además la ITÁLICA de Fraunces en `.destaca`, y Alberto
// la retiró mirando el h1 de la portada: la itálica de esa familia cambia
// tanto de forma que «Sube tus seguros. / Y contrólalos.» se leía como dos
// letras distintas en vez de una con énfasis. El acento lo lleva el color.
//
// Lo que esto vigila NO es el gusto, es un acoplamiento que no falla en
// ningún build: `layout.tsx` ya no pide el eje `ital` a Google Fonts, así que
// un `font-style: italic` nuevo sobre `var(--display)` no tiene corte real que
// usar — el navegador SINTETIZA la inclinación deformando la redonda, que es
// justo la versión fea, y de eso solo se entera quien abra la página.
//
// Por eso las dos aserciones van juntas y en los dos sentidos: se puede volver
// a la itálica, pero entonces hay que volver a pedirla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')

const css = leer('app', 'globals.css')
const layout = leer('app', 'layout.tsx')
const pagina = leer('app', 'page.tsx')

/** La petición de Google Fonts del layout (las dos familias van en una). */
const peticion = /https:\/\/fonts\.googleapis\.com\/css2\?[^'"]+/.exec(layout)?.[0] ?? ''

test('el layout pide las dos familias del sitio', () => {
  assert.match(peticion, /family=Quicksand:/, 'el layout dejó de pedir Quicksand: titulares y botones caerían a la fuente del sistema')
  assert.match(peticion, /family=Nunito\+Sans:/, 'el layout dejó de pedir Nunito Sans: el cuerpo caería a la fuente del sistema')
  assert.match(css, /--display:\s*'Quicksand'/, '--display ya no apunta a Quicksand')
  assert.match(css, /--sans:\s*'Nunito Sans'/, '--sans ya no apunta a Nunito Sans')
})

test('itálica declarada y itálica pedida van de la mano', () => {
  // Se quitan los comentarios ANTES de buscar: este mismo fichero y el propio
  // `globals.css` explican la regla escribiendo `font-style: italic` en prosa,
  // y un filtro por línea no vale —los bloques `/* … */` de esa hoja no llevan
  // asterisco en cada línea, así que la frase se colaba como si fuera CSS
  // activo (se vio fallar así al escribir este cepo).
  const cssActivo = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const declaraItalica = /font-style:\s*italic/.test(cssActivo)
  const pideItalica = /\bital\b/.test(peticion)
  assert.equal(
    declaraItalica,
    pideItalica,
    declaraItalica
      ? 'globals.css declara font-style: italic pero layout.tsx no pide el eje ital: el navegador sintetiza la inclinación deformando la redonda'
      : 'layout.tsx pide el eje ital y ya no lo usa nadie: es un archivo de fuente entero descargado para nada',
  )
})

test('nadie mete itálica en línea desde el JSX', () => {
  assert.doesNotMatch(
    pagina,
    /fontStyle:\s*'italic'/,
    'un fontStyle inline se salta globals.css y por tanto también el brazo de arriba',
  )
})

test('el acento del titular no desaparece: sigue siendo el cobalto de la marca', () => {
  // Quitar la itálica dejó a `.destaca` con una sola propiedad. Si alguien
  // «limpia» esa regla por quedarse casi vacía, los titulares pierden el
  // acento entero y siguen siendo HTML válido.
  assert.match(
    css,
    /\.destaca\s*\{[^}]*color:\s*var\(--brand\)/,
    '.destaca se quedó sin el color de marca: los titulares pierden su único acento',
  )
  assert.match(pagina, /className="destaca"/, 'la portada dejó de usar .destaca')
})
