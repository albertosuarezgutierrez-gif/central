// Guardián del icono de la pestaña del PORTAL DEL CLIENTE.
//
// Las tres formas de romperlo son MUDAS: no hay build que falle, no hay
// typecheck que se queje y no hay excepción en el servidor. Solo se ve abriendo
// la web y mirando la pestaña, que es justo lo que nadie hace.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { MARCA_ASEGURA } from '../../../packages/brand/src/marcas/asegura.ts'

const RAIZ = join(import.meta.dirname, '..')
const ICONO = join(RAIZ, 'app/icon.tsx')
const MONOGRAMA = join(RAIZ, 'public/brand/marca-asegura.svg')

test('la app declara un icono', () => {
  // Sin él, la pestaña sale con el globo por defecto del navegador — que es lo
  // que pasaba hasta el 07/09/2026.
  // Alberto, 07/09/2026, con la captura de su pestaña: «pon el logo». Salía el
  // globo gris de Chrome junto a «Mis seguros».
  assert.ok(existsSync(ICONO), 'app/icon.tsx no existe: la pestaña vuelve al icono por defecto')
})

test('el monograma se LEE del vectorial, no se copia', () => {
  const fuente = readFileSync(ICONO, 'utf8')
  assert.match(fuente, /public\/brand\/marca-asegura\.svg/, 'el icono ya no lee el vectorial de la marca')
  assert.ok(
    !/\sd="[Mm][\s\d.-]/.test(fuente),
    'hay un `path` copiado dentro de icon.tsx: dos monogramas se separan en cuanto uno cambie',
  )
})

test('el vectorial sigue trayendo currentColor', () => {
  // 🚨 Este es el cepo que importa. `icon.tsx` pinta el trazo sustituyendo
  // `currentColor` por el azul de marca. Si alguien «arregla» el SVG dejándole
  // un color fijo, la sustitución pasa a ser un no-op y el monograma sale del
  // color que traiga el fichero —negro, si es el original— SIN que falle nada.
  // Es exactamente el icono viejo que Alberto pidió cambiar.
  const svg = readFileSync(MONOGRAMA, 'utf8')
  assert.match(svg, /currentColor/, 'el monograma perdió `currentColor`: el icono dejaría de teñirse')
  const fuente = readFileSync(ICONO, 'utf8')
  assert.match(fuente, /replaceAll\('currentColor'/, 'el icono ya no tiñe el monograma')
})

test('los colores salen de la marca, no escritos a mano', () => {
  const fuente = readFileSync(ICONO, 'utf8')
  assert.match(fuente, /MARCA_ASEGURA\.paleta/, 'el icono ya no lee la paleta de la marca')
  assert.ok(
    !/#[0-9a-fA-F]{6}/.test(fuente),
    'hay un hex escrito a mano en icon.tsx: el día que cambie la marca, la pestaña se queda con el color viejo',
  )
})

test('usa tokens en hex: satori no entiende oklch', () => {
  // Si se cambiara a `primarioSuave` (que es oklch) el fondo saldría
  // transparente o negro, sin error. Los dos que se usan tienen que ser hex.
  for (const token of ['primario', 'acentoSuave'] as const) {
    assert.match(
      MARCA_ASEGURA.paleta[token],
      /^#[0-9a-fA-F]{6}$/,
      `paleta.${token} ya no es hex: satori lo ignoraría y el icono saldría sin ese color`,
    )
  }
  const fuente = readFileSync(ICONO, 'utf8')
  assert.match(fuente, /primario, acentoSuave|acentoSuave, primario/, 'el icono cambió de tokens: revisa que sigan en hex')
})
