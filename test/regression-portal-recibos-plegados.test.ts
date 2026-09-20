// Cepo: en «Recibos» y «Siniestros» cada póliza nace PLEGADA, y su cabecera
// dice lo que esconde.
//
// ─── Qué pasó (20/09/2026) ──────────────────────────────────────────────────
// Alberto, mirando «Mis recibos» en su móvil: «que también salga plegado, y
// siniestro también». Con el historial entero desplegado, una sola póliza con
// cinco recibos ocupaba la pantalla completa y la siguiente quedaba a un
// pantallazo de scroll: la pantalla enseñaba UN recibo en vez de decir qué
// pólizas hay y cómo van. Es lo mismo que ya resolvió la bóveda el 19/09 con
// `GrupoPlegable`, un piso más abajo.
//
// ─── Los cuatro fallos que este cepo persigue, y NINGUNO falla solo ─────────
//  1. que el `<details>` vuelva a nacer abierto (un `open` fijo, o derivado de
//     otra cosa): la pantalla vuelve a ser la tirada de filas de siempre.
//  2. que la cabecera se quede MUDA: plegar sin decir qué hay dentro obliga a
//     abrir una por una para saber cuál merecía la pena abrir. Es la misma
//     regla que la cifra de `GrupoPlegable`.
//  3. que el resumen se pinte DOS veces (cabecera y cuerpo): con dos copias,
//     el día que una cambie la cabecera dirá una cosa y el cuerpo otra sobre
//     el mismo recibo.
//  4. 🚨 que se pliegue una póliza cuyo interior es una EXPLICACIÓN y no una
//     lista («tu compañía no nos ha informado de ningún recibo», que NO es
//     «estás al corriente»). Esa frase detrás de una cabecera muda deja una
//     pantalla en la que no se ve nada y no se dice por qué.
//
// Y el quinto, que es de CSS y por eso va aquí: el marcador ▸ de un `<summary>`
// SOLO se pinta con `display: list-item`. Maquetarlo con `flex` lo borra sin
// que falle nada, y el bloque se queda sin la única señal de que se abre.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url).pathname

/**
 * 🚨 Sin comentarios antes de mirar. Este fichero busca texto plano y las
 * cabeceras de lo que vigila explican el fallo con las mismas palabras que
 * están prohibidas. Ya ha mordido a varios cepos de esta app.
 */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const VISTA = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/VistaPorPoliza.tsx`, 'utf8'),
)
const PIEZAS = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/PolizaVista.tsx`, 'utf8'),
)
const PAGINA = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/page.tsx`, 'utf8'),
)
const FICHA = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/poliza/[id]/page.tsx`, 'utf8'),
)
const CSS = readFileSync(`${RAIZ}apps/asegura-portal/app/globals.css`, 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

test('cada póliza se pinta en un <details> y NO nace abierta por defecto', () => {
  assert.match(VISTA, /<details[^>]*className="poliza-bloque"/, 'la póliza va en un <details>')
  // El único `open` admisible es el derivado del resumen. Un `open` a secas
  // —o `open={true}`— devuelve la pantalla a la tirada de filas de siempre.
  const opens = VISTA.match(/\bopen(=\{[^}]*\})?/g) ?? []
  assert.equal(opens.length, 1, `un solo \`open\`, y derivado; encontrados: ${opens.join(' ')}`)
  assert.match(
    opens[0]!,
    /open=\{\s*linea === null\s*\}/,
    'abierto SOLO cuando no hay nada que resumir (dentro hay una explicación, no una lista)',
  )
})

test('🚨 la cabecera NO es muda: pinta el resumen con el bloque cerrado', () => {
  // Cepo positivo: alguien tiene que pintar la línea DENTRO del `<summary>`.
  const i = VISTA.indexOf('<summary')
  const j = VISTA.indexOf('</summary>')
  assert.ok(i !== -1 && j > i, 'la cabecera del plegable es un <summary>')
  const cabecera = VISTA.slice(i, j)
  assert.match(cabecera, /poliza-bloque-linea/, 'el resumen se pinta en la cabecera')
  assert.match(cabecera, /\{linea\}/, 'y es el valor de `resumen(p)`, no un texto aparte')
  assert.match(cabecera, /<h4/, 'el titular sigue siendo un encabezado (navegación por encabezados)')
})

test('🚨 el resumen NO se pinta dos veces: el cuerpo lo cede a la cabecera', () => {
  for (const bloque of ['RecibosDePoliza', 'HistorialSiniestros']) {
    const re = new RegExp(`<${bloque}\\s+p=\\{p\\}\\s+sinResumen\\s*/>`)
    assert.match(PAGINA, re, `${bloque} dentro de VistaPorPoliza va con \`sinResumen\``)
  }
  // Y las dos piezas tienen que HONRARLO: una prop que nadie mira es peor que
  // no tenerla, porque la pantalla promete algo que no hace.
  assert.equal(
    (PIEZAS.match(/!sinResumen &&/g) ?? []).length,
    2,
    'las dos piezas se callan el resumen cuando se lo piden',
  )
})

test('🚨 sin nada que resumir, `null`: una explicación no se pliega', () => {
  const i = PIEZAS.indexOf('export function lineaRecibos')
  assert.notEqual(i, -1, 'la línea de recibos vive en un helper puro, compartido con la ficha')
  const cuerpo = PIEZAS.slice(i, PIEZAS.indexOf('\n}\n', i))
  assert.match(
    cuerpo,
    /estado !== 'con_recibos'\)\s*return null/,
    '`sin_informar`/`solo_anulados` no tienen resumen: dentro está la frase que lo explica',
  )
  const k = PIEZAS.indexOf('export function lineaSiniestros')
  assert.notEqual(k, -1, 'y la de siniestros también')
  const cuerpoS = PIEZAS.slice(k, PIEZAS.indexOf('\n}\n', k))
  assert.match(cuerpoS, /length === 0\) return null/, 'sin siniestros informados, nada que resumir')
})

test('la FICHA de una póliza sigue enseñando el resumen (allí no hay cabecera)', () => {
  // `/boveda/poliza/[id]` no pliega nada: si alguien le pusiera `sinResumen`
  // por simetría, esa pantalla perdería «tu próximo recibo» sin nada que lo
  // sustituya.
  assert.doesNotMatch(FICHA, /sinResumen/, 'la ficha no cede el resumen a ninguna cabecera')
})

test('el marcador ▸ sobrevive: el <summary> va en `display: list-item`', () => {
  const i = CSS.indexOf('.poliza-bloque-resumen {')
  assert.notEqual(i, -1, 'la cabecera del plegable tiene sus propios estilos')
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /display:\s*list-item/, 'con `flex` desaparece el ▸ y no falla nada')
  assert.match(regla, /min-height:\s*44px/, 'los 44 px táctiles: la cabecera es ahora la puerta')
})
