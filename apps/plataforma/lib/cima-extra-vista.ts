/**
 * «Más datos de CIMA» de la ficha de póliza (solo intranet del operador).
 *
 * El lector CIMA guarda en `datos_especificos.cimaExtra` TODOS los campos EIAC que
 * los extractores no leen: `Array<{ruta, valor}>`, sin PII (denegada en origen).
 * `ruta` viene sin prefijo ni índices y puede repetirse.
 *
 * Tres estados (null ≠ []): clave ausente = aún no leído → `null` (la pantalla NO
 * dice «sin datos»); `[]` = CIMA no trae más datos; lista = grupos pintables.
 * No se inventan unidades ni se formatea como dinero: no sabemos si lo es.
 */

export type FilaCimaExtra = { etiqueta: string; valor: string }
export type GrupoCimaExtra = { titulo: string; filas: FilaCimaExtra[] }

/** Segmentos de cabecera que no dicen nada del bloque. */
const GENERICOS = new Set(['poliza', 'datosriesgos', 'riesgo'])
const TITULO_SIN_BLOQUE = 'Datos generales'

const PALABRAS: Record<string, string> = { anio: 'año', anios: 'años' }

/** `AnioFabricacion` → «Año fabricacion»; `FechaEfectoInicial` → «Fecha efecto inicial». */
export function etiquetaCampo(segmento: string): string {
  const palabras = segmento
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((p) => {
      // Una sigla (todo mayúsculas, 2+ letras) se respeta tal cual.
      if (p.length > 1 && p === p.toUpperCase() && /[A-Z]/.test(p)) return p
      const m = p.toLowerCase()
      return PALABRAS[m] ?? m
    })
  const t = palabras.join(' ')
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : segmento
}

const CENTINELAS = new Set(['1900-01-01', '9999-12-31'])
const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/

/** `null` = centinela (no se pinta). Fecha ISO → `dd/mm/aaaa`. El resto, tal cual. */
export function valorCampo(bruto: string): string | null {
  const v = bruto.trim()
  if (!v) return null
  const m = RE_FECHA.exec(v)
  if (!m) return v
  const dia = `${m[1]}-${m[2]}-${m[3]}`
  if (CENTINELAS.has(dia)) return null
  const mes = Number(m[2]), d = Number(m[3])
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return v
  return `${m[3]}/${m[2]}/${m[1]}`
}

/**
 * `extra` es lo que haya en `cimaExtra` (cualquier cosa: viene de JSON). `undefined`/`null`/no-array → `null`.
 */
export function vistaCimaExtra(extra: unknown): GrupoCimaExtra[] | null {
  if (!Array.isArray(extra)) return null
  const grupos = new Map<string, FilaCimaExtra[]>()
  for (const it of extra) {
    if (!it || typeof it !== 'object') continue
    const { ruta, valor } = it as { ruta?: unknown; valor?: unknown }
    if (typeof ruta !== 'string' || (typeof valor !== 'string' && typeof valor !== 'number')) continue
    const segs = ruta.split('.').map((s) => s.trim()).filter(Boolean)
    if (!segs.length) continue
    const v = valorCampo(String(valor))
    if (v === null) continue
    const ultimo = segs[segs.length - 1]
    const padres = segs.slice(0, -1).filter((s) => !GENERICOS.has(s.toLowerCase()))
    const titulo = padres.length ? etiquetaCampo(padres[padres.length - 1]) : TITULO_SIN_BLOQUE
    const lista = grupos.get(titulo) ?? []
    lista.push({ etiqueta: etiquetaCampo(ultimo), valor: v })
    grupos.set(titulo, lista)
  }
  return [...grupos].map(([titulo, filas]) => ({ titulo, filas }))
}

/** `cimaExtraTruncado === true` solo si es literalmente `true`. */
export function cimaExtraTruncado(v: unknown): boolean {
  return v === true
}

/** ¿Hay algo que pintar? `null` (aún no leído) y `[]` (CIMA no trae más) → no: la fila de un recibo solo sale CON datos. */
export function hayMasDatos(grupos: GrupoCimaExtra[] | null): grupos is GrupoCimaExtra[] {
  return grupos !== null && grupos.some((g) => g.filas.length > 0)
}
