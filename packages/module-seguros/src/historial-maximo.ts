// El historial del seguro anterior se declara al MÁXIMO (29/09/2026, dictado de Alberto).
//
// «Siempre se pone el máximo: la compañía lo contrasta con SINCO por el nº de póliza y aplica el
// bonus real. Teclear años no justifica nada y solo mete errores.» Lo que SÍ se ha leído de su
// póliza manda sobre el máximo (declarar 10 años limpios cuando el papel dice 3 es mentir).
//
// Y si el vendor rechaza un valor (400 de validación, que NO se cobra), el tope se APRENDE: se
// guarda y todas las cotizaciones siguientes lo respetan. Aquí vive la parte pura: el máximo, leer
// el tope de un mensaje del vendor y recortar un cuerpo de cotización. La BD la pone asegura.

/** Lo que se declara cuando no se sabe. */
export const HISTORIAL_MAXIMO = { aniosAsegurado: 10, aniosEnCompania: 10, aniosSinSiniestros: 10, siniestrosUltimos5: 0 } as const

/** Los campos de `risk.previousInsurance` que llevan años. */
export const CAMPOS_ANIOS_VENDOR = ['totalYearsInsured', 'yearsInPreviousCompany', 'yearsWithoutAccidents'] as const
export type CampoAniosVendor = (typeof CAMPOS_ANIOS_VENDOR)[number]
export type TopesHistorial = Partial<Record<CampoAniosVendor, number>>

const PATRONES_CAMPO: Record<CampoAniosVendor, RegExp> = {
  totalYearsInsured: /totalYearsInsured|total\s+(?:number\s+of\s+)?years\s+insured|years\s+insured/i,
  yearsInPreviousCompany: /yearsInPreviousCompany|years\s+(?:in|with)\s+(?:the\s+)?(?:previous|current)\s+(?:company|insurer)/i,
  yearsWithoutAccidents: /yearsWithoutAccidents|years\s+without\s+(?:accidents|claims)/i,
}

const PATRONES_MAXIMO: RegExp[] = [
  /less\s+than\s+or\s+equal\s+(?:to\s+)?(\d{1,3})/i,
  /(?:maximum|max)(?:\s+(?:value|allowed))?\s*(?:is|of|:)?\s*(\d{1,3})/i,
  /between\s+\d{1,3}\s+and\s+(\d{1,3})/i,
  /(?:cannot|can't|must\s+not)\s+(?:be\s+)?(?:greater|higher|more)\s+than\s+(\d{1,3})/i,
  /(?:cannot|can't|must\s+not)\s+exceed\s+(\d{1,3})/i,
  /(?:<=|≤)\s*(\d{1,3})/,
  /(?:no\s+puede\s+(?:ser\s+)?(?:mayor|superior)\s+(?:a|de|que)|m[aá]ximo(?:\s+de)?)\s+(\d{1,3})/i,
]

/** Si baja sin decir hasta dónde, el siguiente peldaño por debajo del valor rechazado. */
const ESCALERA = [40, 30, 25, 20, 15, 10, 8, 6, 5] as const

/**
 * Qué campos de años rechaza el vendor y hasta dónde bajarlos. Por línea: una línea que nombra
 * el campo y trae un número se lee literal; si no trae número, baja un peldaño desde lo enviado.
 * Lo que no nombra ninguno de estos campos no se toca: no es un problema de años.
 */
export function topesDelMensaje(mensaje: string, enviado: TopesHistorial): TopesHistorial {
  const out: TopesHistorial = {}
  for (const linea of mensaje.split(/\r?\n|(?<=\.)\s+(?=[A-Z«"])/)) {
    for (const campo of CAMPOS_ANIOS_VENDOR) {
      if (!PATRONES_CAMPO[campo].test(linea)) continue
      let maximo: number | null = null
      for (const re of PATRONES_MAXIMO) {
        const m = linea.match(re)
        if (m) { maximo = Number(m[1]); break }
      }
      if (maximo === null) {
        const actual = enviado[campo]
        if (actual === undefined) continue
        maximo = ESCALERA.find(p => p < actual) ?? null
        if (maximo === null) continue
      }
      if (maximo < 1) continue // «máximo 0» no es un tope de bonus: declararía novel.
      out[campo] = Math.min(out[campo] ?? Infinity, maximo)
    }
  }
  return out
}

/** Los años que lleva un cuerpo de cotización (`risk.previousInsurance`). */
export function aniosDelCuerpo(cuerpo: unknown): TopesHistorial {
  const previa = previaDe(cuerpo)
  const out: TopesHistorial = {}
  if (!previa) return out
  for (const c of CAMPOS_ANIOS_VENDOR) if (typeof previa[c] === 'number') out[c] = previa[c] as number
  return out
}

/**
 * El cuerpo con los años recortados a los topes aprendidos. Copia: no toca el original. Mantiene
 * la coherencia que el vendor exige: años sin siniestros y en la compañía ≤ años asegurado, y si
 * el recorte deja «sin siniestros» por debajo de 5 y distinto de «asegurado» sin detalle de
 * siniestros, lo iguala a «asegurado» (sigue diciendo «ninguno»). Devuelve qué cambió.
 */
export function aplicarTopesHistorial(cuerpo: unknown, topes: TopesHistorial): { cuerpo: unknown; cambios: string[] } {
  const previa = previaDe(cuerpo)
  if (!previa || Object.keys(topes).length === 0) return { cuerpo, cambios: [] }
  const copia = structuredClone(cuerpo) as Record<string, unknown>
  const p = previaDe(copia)!
  const cambios: string[] = []
  const fijar = (c: CampoAniosVendor, v: number) => {
    if (typeof p[c] === 'number' && p[c] !== v) { cambios.push(`${c} ${p[c]}→${v}`); p[c] = v }
  }
  for (const c of CAMPOS_ANIOS_VENDOR) {
    const t = topes[c]
    if (t !== undefined && typeof p[c] === 'number' && (p[c] as number) > t) fijar(c, t)
  }
  const total = typeof p.totalYearsInsured === 'number' ? p.totalYearsInsured : null
  if (total !== null) {
    for (const c of ['yearsInPreviousCompany', 'yearsWithoutAccidents'] as const) {
      if (typeof p[c] === 'number' && (p[c] as number) > total) fijar(c, total)
    }
    const limpios = p.yearsWithoutAccidents
    if (typeof limpios === 'number' && limpios < 5 && limpios !== total && p.lastFiveYearsAccidents === undefined) {
      fijar('yearsWithoutAccidents', total)
    }
  }
  return { cuerpo: copia, cambios }
}

function previaDe(cuerpo: unknown): Record<string, unknown> | null {
  const risk = obj(obj(cuerpo)?.risk)
  return obj(risk?.previousInsurance)
}

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
