import type { Marca, PaletaMarca, PaletaOscuraMarca } from './tipos'

/** Selector del tema oscuro. Se emiten los DOS a propósito: `[data-theme]` es
 *  el que usan las apps de este monorepo, y `.dark` es el que espera cualquier
 *  componente traído de una app con Tailwind (su variante `dark:` compila a
 *  `.dark *`). Soportar ambos cuesta un selector y ahorra un bug silencioso el
 *  día que se porte un componente. */
const SELECTOR_OSCURO = ':root[data-theme="dark"],:root.dark'

// Mapa único paleta → nombre de variable CSS. Vive una sola vez para que el
// tema claro y el oscuro NO puedan divergir: si mañana se añade un color y solo
// se acuerda uno de los dos bloques, el oscuro se queda con el valor del claro
// y el fallo se ve como «una caja que sigue blanca de noche».
const VARIABLE_DE: Record<keyof PaletaMarca, string | null> = {
  primario: '--brand',
  primarioInk: '--brand-ink',
  primarioSuave: '--brand-soft',
  acento: '--accent',
  acentoInk: '--accent-ink',
  acentoSuave: '--accent-soft',
  fondo: '--bg',
  fondo2: '--bg2',
  panel: '--panel',
  panel2: '--panel2',
  borde: '--border',
  bordeSuave: '--border-soft',
  texto: '--text',
  textoTenue: '--muted',
  textoTenue2: '--muted2',
  ok: '--ok',
  warn: '--warn',
  peligro: '--danger',
  // Estos dos no son colores sueltos: se expanden abajo.
  superficies: null,
  elevacion: null,
}

function paresDeColor(p: PaletaMarca | PaletaOscuraMarca): [string, string][] {
  const pares: [string, string][] = []
  for (const [clave, variable] of Object.entries(VARIABLE_DE) as [keyof PaletaMarca, string | null][]) {
    if (variable === null) continue
    const valor = p[clave]
    if (typeof valor === 'string') pares.push([variable, valor])
  }
  if (p.superficies) {
    pares.push(['--surface-hover', p.superficies.hover])
    pares.push(['--surface-active', p.superficies.activo])
  }
  if (p.elevacion) {
    pares.push(['--shadow-panel', p.elevacion.panel])
    pares.push(['--shadow-float', p.elevacion.flotante])
    pares.push(['--shadow-over', p.elevacion.encima])
  }
  return pares
}

// Convierte una Marca en el bloque de variables CSS que consume la UI. Los nombres
// coinciden con los que ya usan los globals.css de las apps (--bg, --accent, --text…)
// para poder re-tematizar sin reescribir el CSS, y añade los de marca (--brand*).
export function emitirVariables(m: Marca): string {
  const pares = paresDeColor(m.paleta)
  // Tipografía (--serif conserva el nombre por compat; puede ser un sans de marca)
  pares.push(['--serif', m.tipografia.titulos])
  pares.push(['--sans', m.tipografia.cuerpo])
  // Forma
  pares.push(['--radio', m.radio])
  return pares.map(([k, v]) => `${k}:${v}`).join(';')
}

/**
 * Solo lo que cambia de noche. Devuelve `''` si la marca no declara tema
 * oscuro — y ese caso hay que distinguirlo de «lo declara vacío»: los dos
 * dan cadena vacía aquí, pero el primero es lo normal (Joaquín Jaén) y el
 * segundo sería un error de quien escribió la marca.
 */
export function emitirVariablesOscuras(m: Marca): string {
  if (!m.paletaOscura) return ''
  return paresDeColor(m.paletaOscura).map(([k, v]) => `${k}:${v}`).join(';')
}

/**
 * Bloque(s) listos para inyectar en un <style> del <head>.
 *
 * Emite `color-scheme` además de los colores: sin él, los controles nativos
 * (scrollbars, `<select>`, el autorelleno del navegador) se quedan en claro
 * sobre un fondo oscuro. Es el detalle que delata a un tema oscuro puesto a
 * medias, y se arregla con una línea.
 */
export function emitirRootCss(m: Marca): string {
  const claro = `:root{${emitirVariables(m)};color-scheme:light}`
  const oscuras = emitirVariablesOscuras(m)
  if (!oscuras) return claro
  return `${claro}${SELECTOR_OSCURO}{${oscuras};color-scheme:dark}`
}
