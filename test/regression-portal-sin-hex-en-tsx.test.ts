// Cepo del «diseño único» del portal (26/10/2026, decisión de Alberto): en `apps/asegura-portal/app/**/*.tsx` NO hay
// colores literales ni tokens inventados.
//
//   1. Ni `#rrggbb` / `#rgb` ni `rgb()/rgba()/hsl()/hsla()` en un `.tsx`: el color sale SIEMPRE de un token de
//      `@central/brand` (`emitirRootCss(MARCA_ASEGURA)`) o de `globals.css`. Un literal se queda fuera del tema oscuro, y
//      un «respaldo» (`var(--x, #b00020)`) esconde que el token no existe (el literal pasa a ser el valor real).
//   2. Todo `var(--token)` de un `.tsx` existe: lo define `globals.css`, el layout raíz, el tema de marca o el propio
//      fichero. Es el fallo que ya pasó: `--rojo` y `--error` no existían y el mensaje de error salía siempre en el
//      literal de respaldo (los de verdad se llaman `--danger`/`--negative`).
//
// Los comentarios se quitan antes de mirar (un `#5080` de «PR #5080» no es un color) y un cepo de texto que se
// satisface con un comentario no cepa nada. `globals.css` queda FUERA: allí viven los tokens y el tema de impresión.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { emitirRootCss } from '../packages/brand/src/css.ts'
import { MARCA_ASEGURA } from '../packages/brand/src/marcas/asegura.ts'

const ROOT = join(import.meta.dirname, '..')
const APP = join(ROOT, 'apps/asegura-portal/app')

/**
 * Ficheros `.tsx` que SÍ pueden llevar un literal, con el porqué. Hoy ninguno: los iconos (`icon.tsx`, `icono-app`) leen
 * la paleta de la marca. Una entrada nueva exige su justificación aquí, a la vista de quien revise.
 */
const LISTA_BLANCA: Record<string, string> = {}

const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:\w'"`])\/\/.*$/gm, '$1')

function tsxDe(dir: string): string[] {
  const out: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (nombre === 'node_modules' || nombre === '.next') continue
    if (statSync(ruta).isDirectory()) out.push(...tsxDe(ruta))
    else if (nombre.endsWith('.tsx')) out.push(ruta)
  }
  return out
}

const FICHEROS = tsxDe(APP)
const rel = (f: string) => relative(ROOT, f)

const HEX = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b/g
const FUNCION_COLOR = /\b(?:rgba?|hsla?)\(/g

/** Los hallazgos de un texto (ya sin comentarios) con su número de línea. */
export function literalesDeColor(src: string): string[] {
  const hallazgos: string[] = []
  src.split('\n').forEach((linea, i) => {
    for (const m of linea.matchAll(HEX)) hallazgos.push(`línea ${i + 1}: ${m[0]}`)
    for (const m of linea.matchAll(FUNCION_COLOR)) hallazgos.push(`línea ${i + 1}: ${m[0]}…`)
  })
  return hallazgos
}

test('el cepo ve lo que dice ver (hay .tsx que mirar y reconoce un literal)', () => {
  assert.ok(FICHEROS.length > 40, `solo ${FICHEROS.length} .tsx: ¿ruta mal?`)
  assert.deepEqual(literalesDeColor("style={{ color: 'var(--rojo, #b00020)' }}"), ['línea 1: #b00020'])
  assert.deepEqual(literalesDeColor("boxShadow: '0 6px 18px rgba(0,0,0,.15)'"), ['línea 1: rgba(…'])
  assert.deepEqual(literalesDeColor("href=\"#avisos\" style={{ color: 'var(--danger)' }}"), [])
})

test('🚨 ningún .tsx de la app lleva un color literal (hex, rgb(), hsl())', () => {
  const malos: string[] = []
  for (const f of FICHEROS) {
    if (rel(f) in LISTA_BLANCA) continue
    for (const h of literalesDeColor(sinComentarios(readFileSync(f, 'utf8')))) malos.push(`${rel(f)} ${h}`)
  }
  assert.deepEqual(
    malos,
    [],
    'Un color literal en un .tsx se queda fuera del tema oscuro y del tema de marca. Usa un token (`var(--danger)`, ' +
      '`var(--primary)`, `var(--shadow-float)`…) o, si es imprescindible (p. ej. una imagen que no entiende CSS), ' +
      'añade el fichero a LISTA_BLANCA con su motivo.',
  )
})

test('🚨 todo var(--token) de un .tsx existe (sin tokens inventados ni «respaldos» que los tapen)', () => {
  const css = readFileSync(join(APP, 'globals.css'), 'utf8')
  const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8')
  const definidos = new Set<string>()
  for (const fuente of [css, layout, emitirRootCss(MARCA_ASEGURA)]) {
    for (const m of fuente.matchAll(/(?:^|[\s{;'"])(--[a-z0-9-]+)\s*:/g)) definidos.add(m[1])
  }
  const malos: string[] = []
  for (const f of FICHEROS) {
    const src = sinComentarios(readFileSync(f, 'utf8'))
    const propios = new Set([...src.matchAll(/['"`](--[a-z0-9-]+)['"`]\s*:/g)].map((m) => m[1]))
    for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (!definidos.has(m[1]) && !propios.has(m[1])) malos.push(`${rel(f)} usa ${m[1]}, que no existe`)
    }
  }
  assert.ok(definidos.has('--danger') && definidos.has('--brand') && definidos.has('--shadow-float'), 'no leo los tokens de marca')
  assert.deepEqual(malos, [])
})
