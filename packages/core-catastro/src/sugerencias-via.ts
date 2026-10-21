// Sugerencias de CALLE mientras se escribe (autocompletado del buscador de dirección de hogar, 20/10/2026). PURO: la red vive en
// `listarViasPorTermino()` (./http.ts). La normalización (acentos, artículo pospuesto, sufijo de pedanía) es la de `tokensVia()`.
import { normVia, paramsDnploc, tokensVia, type ParamsDnploc } from './parser.ts'

export type ViaCatastro = { tipo: string; nombre: string }

const TIPOS_ESCRITOS = /^(?:CALLE|CL|C|AVENIDA|AVDA|AV|PLAZA|PZA|PL|PASEO|PSO|PS|CAMINO|CMNO|CARRETERA|CTRA|CR|RONDA|RDA|TRAVESIA|TRV|URBANIZACION|URB|BARRIADA|BDA|GLORIETA|GTA|CUESTA|CJON|CALLEJON|PASAJE|PSJ)(?:[\s./]+|$)/

/**
 * Parte lo escrito en «Calle y número» en { nombre, cola }: el NOMBRE de la calle (sin el tipo inicial «Calle», «Avda.», «C/») y la cola
 * (número de portal, piso…), que empieza en la primera coma o en el primer número que NO abre el nombre: «1 de Mayo 3» → nombre «1 DE MAYO»,
 * cola « 3». Texto normalizado (mayúsculas, sin acentos).
 */
export function partirCalle(texto: string): { nombre: string; cola: string } {
  const t = normVia(texto).replace(TIPOS_ESCRITOS, '')
  const fin = t.search(/[,;(]|(?<=\S\s+)\d/)
  const nombre = (fin >= 0 ? t.slice(0, fin) : t).replace(/\s+/g, ' ').trim()
  return { nombre, cola: fin >= 0 ? t.slice(fin) : '' }
}

/** Lo escrito en «Calle y número» que ya es NOMBRE de calle. `''` si aún no hay nombre. */
export function nombreCalleEscrito(texto: string): string {
  return partirCalle(texto).nombre
}

/** Lo que va tras la calle oficial elegida en `texto`, o `null` si el texto ya NO empieza por «TIPO NOMBRE» (la elección caducó). */
function restoTrasVia(texto: string, via: ViaCatastro): string | null {
  const t = normVia(texto)
  const pref = normVia(`${via.tipo} ${via.nombre}`)
  if (!t.startsWith(pref)) return null
  const resto = t.slice(pref.length)
  // Tras la calle solo cabe el portal/piso (o nada): «CL SOL» no vale para «CL SOLEDAD 3» ni para «CL SOL Y SOMBRA 3».
  return /^(?:\s*$|\s*[,;]|\s+\d)/.test(resto) ? resto : null
}

/** ¿La calle oficial elegida sigue siendo la que dice el texto? */
export function viaSigueVigente(texto: string, via: ViaCatastro | null): boolean {
  return via !== null && restoTrasVia(texto, via) !== null
}

/** Compone el texto del campo al elegir una sugerencia, conservando lo que ya se había escrito tras la calle. */
export function componerDireccionConVia(texto: string, via: ViaCatastro): string {
  const cola = partirCalle(texto).cola.trim()
  const base = `${via.tipo} ${via.nombre}`
  if (!cola || cola.startsWith('(')) return `${base} `
  return /^[,;]/.test(cola) ? `${base}${cola}` : `${base} ${cola}`
}

/**
 * `paramsDnploc()` con la calle OFICIAL ya elegida. Se parsea solo lo que sigue a la calle (el número y el interior) bajo un nombre
 * neutro y se pone encima el tipo y el nombre oficiales: así un nombre con dígitos («1 DE MAYO») o con pedanía «(…)» no rompe el parseo ni se
 * confunde con el número de portal. `null` si la elección ya no vale o no hay número.
 */
export function paramsDnplocConVia(direccion: string, via: ViaCatastro): ParamsDnploc | null {
  const resto = restoTrasVia(direccion, via)
  if (resto === null) return null
  const p = paramsDnploc(`CALLE X${resto}`)
  return p ? { ...p, sigla: via.tipo || p.sigla, calle: via.nombre } : null
}

/** Cada token buscado es PREFIJO de un token distinto de la vía (el último es el que se está escribiendo). */
function casaPrefijos(objetivo: string[], tokens: string[]): boolean {
  const libres = [...tokens]
  for (const t of objetivo) {
    const i = libres.findIndex((c) => c.startsWith(t))
    if (i < 0) return false
    libres.splice(i, 1)
  }
  return true
}

/**
 * Las vías del callejero que casan con lo escrito, ordenadas: 1º la coincidencia EXACTA de tokens (tras quitar artículos, artículo
 * pospuesto y sufijo de pedanía: «PARRA LA (VENTAS CARRIZA)» para «parra»), 2º las que EMPIEZAN por lo escrito («PARRAS»), 3º el resto
 * («ISABEL PARRA»). Dentro de cada grupo, alfabético. Sin duplicados (tipo+nombre). `max` por defecto 10. Con menos de 2 letras
 * significativas, nada.
 */
export function sugerirVias(vias: ViaCatastro[], escrito: string, max = 10): ViaCatastro[] {
  const objetivo = tokensVia(nombreCalleEscrito(escrito))
  if (!objetivo.length || objetivo.join('').length < 2) return []
  const vistas = new Set<string>()
  const puntuadas: Array<{ v: ViaCatastro; rango: number }> = []
  for (const v of vias) {
    const clave = `${v.tipo}|${v.nombre}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    const tokens = tokensVia(v.nombre)
    if (!casaPrefijos(objetivo, tokens)) continue
    const exacta = [...tokens].sort().join(' ') === [...objetivo].sort().join(' ')
    const empieza = objetivo.every((t, i) => tokens[i]?.startsWith(t))
    puntuadas.push({ v, rango: exacta ? 0 : empieza ? 1 : 2 })
  }
  return puntuadas
    .sort((a, b) => a.rango - b.rango || a.v.nombre.localeCompare(b.v.nombre, 'es') || a.v.tipo.localeCompare(b.v.tipo))
    .slice(0, max)
    .map((x) => x.v)
}
