// Cepo del contenedor de acciones del portal del cliente y de la tarjeta del Portal del Empleado (26/10/2026).
//
// Alberto vio en el móvil (PWA instalada) la tarjeta «Portal del Empleado (RRHH)» con DOS botones primarios iguales
// («Solicitar» y «Abrir el Portal del Empleado»), de anchos distintos y pegados: uno vivía suelto en el cuerpo de la
// tarjeta y el otro en su contenedor, sin `gap` entre ambos. Además llevaba el chip «Bajo solicitud» aunque ya se usa.
// Lo que se vigila:
//   1. `.acciones` es EL contenedor (flex con `gap`, columna a ancho completo ≤480 px, fila después) y `TarjetaPortal`
//      lo pone en TODA acción: no hay una segunda clase paralela con el mismo cometido;
//   2. la tarjeta de RRHH: UNA sola acción primaria (`className="boton"`), que abre `empleados.grupoasegura.es`; la
//      solicitud es un enlace secundario (`variante="enlace"`) dentro de `.acciones-nota`; sin chip ni «Bajo solicitud»;
//   3. ninguna `accion={…}` de tarjeta lleva dos primarios, y ningún botón de solicitud queda suelto en el cuerpo;
//   4. la barra inferior de la PWA no tapa el último botón: el `body` reserva su alto (60 + 1 de filete) MÁS aire.
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PORTAL = join(ROOT, 'apps/asegura-portal')
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(PORTAL, f), 'utf8'))

const CSS = leer('app/globals.css')
const TARJETA = leer('app/TarjetaPortal.tsx')
const HERRAMIENTAS = leer('app/(portal)/herramientas/page.tsx')

/** El cuerpo de una regla CSS (primera coincidencia de `selector {`). */
function regla(css: string, selector: string, desde = 0): string {
  const i = css.indexOf(`${selector} {`, desde)
  assert.notEqual(i, -1, `no existe la regla ${selector}`)
  return css.slice(i, css.indexOf('}', i))
}

test('🚨 `.acciones` es el contenedor único: flex con gap, columna a ancho completo en móvil y fila desde 481 px', () => {
  const base = regla(CSS, '.acciones')
  assert.match(base, /display:\s*flex/)
  assert.match(base, /flex-direction:\s*column/)
  assert.match(base, /align-items:\s*stretch/)
  assert.match(base, /gap:\s*\d+px/, '`.acciones` sin gap: los botones vuelven a salir pegados')
  assert.match(regla(CSS, '.acciones > .boton,\n.acciones > .boton-tenue,\n.acciones > .boton-secundario'), /width:\s*100%/)
  const media = CSS.indexOf('@media (min-width: 481px) {\n  .acciones {')
  assert.notEqual(media, -1, 'falta el cambio a fila desde 481 px')
  assert.match(regla(CSS, '  .acciones', media), /flex-direction:\s*row/)
  // Una sola definición de la base: no se vuelve a redefinir como rejilla en otro sitio (el fallo de la clase paralela).
  assert.equal(CSS.split(/^\.acciones \{/m).length - 1, 1, '`.acciones` definida más de una vez')
})

test('🚨 `TarjetaPortal` pinta TODA acción dentro de `.acciones` (no un `div` propio sin gap)', () => {
  assert.match(TARJETA, /className="acciones tarjeta-portal-accion"/)
  // El modificador no vuelve a ser un contenedor paralelo con su propio `display`.
  assert.doesNotMatch(regla(CSS, '.tarjeta-portal-accion'), /display:/)
})

/** El texto de un `accion={…}` (con las llaves equilibradas), o `null`. */
function acciones(src: string): string[] {
  const out: string[] = []
  let desde = 0
  for (;;) {
    const i = src.indexOf('accion={', desde)
    if (i === -1) return out
    let prof = 0
    let j = i + 'accion='.length
    for (; j < src.length; j++) {
      if (src[j] === '{') prof++
      else if (src[j] === '}' && --prof === 0) break
    }
    out.push(src.slice(i, j + 1))
    desde = j
  }
}

function ficheros(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...ficheros(p))
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

test('🚨 ninguna acción de tarjeta lleva dos botones primarios (el resto, secundario o enlace)', () => {
  let vistas = 0
  for (const f of ficheros(join(PORTAL, 'app'))) {
    for (const a of acciones(sinComentarios(readFileSync(f, 'utf8')))) {
      vistas++
      const primarios = (a.match(/className="boton"/g) ?? []).length
      assert.ok(primarios <= 1, `${f}: ${primarios} botones primarios en una misma acción:\n${a.slice(0, 200)}`)
    }
  }
  assert.ok(vistas >= 8, `solo se vieron ${vistas} acciones de tarjeta: ¿cambió el patrón?`)
})

/** El bloque JSX de la tarjeta del Portal del Empleado: de `id="herr-rrhh"` al cierre de su `TarjetaPortal`. */
const RRHH = (() => {
  const i = HERRAMIENTAS.indexOf('id="herr-rrhh"')
  assert.notEqual(i, -1, 'no está la tarjeta herr-rrhh')
  return HERRAMIENTAS.slice(i, HERRAMIENTAS.indexOf('</TarjetaPortal>', i))
})()

test('🚨 tarjeta RRHH: UNA acción primaria, que abre el Portal del Empleado; la solicitud, un enlace secundario', () => {
  assert.equal((RRHH.match(/className="boton"/g) ?? []).length, 1, 'la tarjeta de RRHH debe tener un único botón primario')
  assert.match(RRHH, /href=\{URL_PORTAL_EMPLEADO\}/)
  assert.match(RRHH, /Abrir el Portal del Empleado/)
  // La solicitud sigue existiendo (catálogo de módulos), pero como enlace dentro de la nota de acciones.
  assert.match(RRHH, /<BotonSolicitarModulo[^>]*variante="enlace"/)
  assert.match(RRHH, /className="acciones-nota"/)
  assert.match(RRHH, /¿Tu empresa aún no lo tiene\?/)
  assert.match(RRHH, /rotulo="Solicítalo"/)
  assert.doesNotMatch(RRHH, /rotulo="Solicitar"/)
})

test('🚨 tarjeta RRHH: sin chip «Bajo solicitud» (Pilar ya usa el portal) y texto corto', () => {
  assert.doesNotMatch(RRHH, /chip=/)
  assert.doesNotMatch(RRHH, /ETIQUETA_DISPONIBILIDAD|Bajo solicitud/)
  const cuerpo = RRHH.slice(RRHH.indexOf('<p style'), RRHH.indexOf('</p>', RRHH.indexOf('<p style')))
  assert.ok(cuerpo.replace(/\s+/g, ' ').length < 160, 'el texto de la tarjeta de RRHH vuelve a ser largo (máx. 1-2 frases)')
  assert.match(readFileSync(join(PORTAL, 'lib/herramientas.ts'), 'utf8'), /URL_PORTAL_EMPLEADO = 'https:\/\/empleados\.grupoasegura\.es'/)
})

test('🚨 el botón de pedir un módulo nunca queda suelto en el cuerpo de la tarjeta (va en `accion`)', () => {
  // Fuera del bloque `accion={…}` no puede haber un `<BotonSolicitarModulo`: era el «Solicitar» pegado al otro botón.
  const sinAcciones = acciones(HERRAMIENTAS).reduce((t, a) => t.replace(a, ''), HERRAMIENTAS)
  assert.doesNotMatch(sinAcciones, /<BotonSolicitarModulo/)
})

test('🚨 la barra inferior de la PWA no tapa el último botón: el body reserva su alto (60 + 1) más aire', () => {
  const i = CSS.indexOf('body:has(.portal-tabbar) {')
  assert.notEqual(i, -1)
  const m = CSS.slice(i, CSS.indexOf('}', i)).match(/padding-bottom:\s*calc\((\d+)px \+ env\(safe-area-inset-bottom/)
  assert.ok(m, 'el padding-bottom del body ya no suma la zona segura')
  assert.ok(Number(m[1]) >= 61 + 8, `solo ${m[1]}px: la barra mide 61 px y el último botón queda pegado a ella`)
})
