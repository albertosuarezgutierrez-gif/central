// apps/plataforma/lib/contable/intencion.ts
// Router de intención PURO: detecta preguntas frecuentes y estructuradas ("gasto total junio",
// "cuánto llevo en luz", "facturas pendientes", "pisos vs correduría") para responderlas DIRECTO
// por SQL, sin pasar por el LLM. Beneficio: funciona aunque la IA esté saturada, es instantáneo,
// gratis y NO inventa cifras (los números salen de la BD). Sin BD ni alias '@/' → testeable con
// node --test (mismo patrón que parse.ts / formato.ts). Conservador: ante la duda devuelve null
// (→ el cerebro cae al LLM). NUNCA secuestra una ORDEN de acción (clasifica/amortiza/concilia…).

export type Signo = 'gasto' | 'ingreso'

export type Intencion =
  | { tipo: 'movimientos_mes'; signo: Signo; anio: number; mes: number }
  | { tipo: 'movimientos_anio'; signo: Signo; anio: number }
  | { tipo: 'concepto'; signo: Signo; terminos: string[]; etiqueta: string; anio: number }
  | { tipo: 'por_destino'; anio: number }
  | { tipo: 'facturas_pendientes' }

export type Hoy = { anio: number; mes: number }

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

// Sinónimos por concepto de gasto: "luz" casa también con las comercializadoras reales, etc.
const SINONIMOS: { etiqueta: string; terminos: string[] }[] = [
  { etiqueta: 'luz', terminos: ['luz', 'endesa', 'iberdrola', 'naturgy', 'edp', 'electric'] },
  { etiqueta: 'agua', terminos: ['agua', 'emasesa', 'aqualia', 'canal isabel'] },
  { etiqueta: 'internet/teléfono', terminos: ['internet', 'fibra', 'telefono', 'teléfono', 'digi', 'movistar', 'vodafone', 'orange', 'jazztel'] },
  { etiqueta: 'seguros', terminos: ['seguro', 'mapfre', 'generali', 'occident', 'liberty', 'allianz', 'axa'] },
  { etiqueta: 'limpieza', terminos: ['limpieza', 'limpiez'] },
  { etiqueta: 'comunidad', terminos: ['comunidad'] },
]

function anioDe(t: string, hoy: Hoy): number {
  const m = t.match(/\b(20\d{2})\b/)
  if (m) return Number(m[1])
  if (/a[ñn]o pasado|a[ñn]o anterior/.test(t)) return hoy.anio - 1
  return hoy.anio
}

function mesRelativoPasado(hoy: Hoy): { anio: number; mes: number } {
  return hoy.mes === 1 ? { anio: hoy.anio - 1, mes: 12 } : { anio: hoy.anio, mes: hoy.mes - 1 }
}

export function detectarIntencion(textoRaw: string, hoy: Hoy): Intencion | null {
  const t = (textoRaw || '').toLowerCase().trim()
  if (!t) return null

  // Facturas de proveedor pendientes (no depende de "cuánto").
  if (/factur/.test(t) && /(pendient|falta|sin pagar|por pagar|sin conciliar|me faltan)/.test(t)) {
    return { tipo: 'facturas_pendientes' }
  }

  // A partir de aquí solo consultas de dinero.
  if (!/(cu[aá]nto|gast|llevo|ingres|balance|resumen|total)/.test(t)) return null
  // NUNCA secuestrar una orden de acción (aunque mencione un proveedor).
  if (/(clasific|amortiz|concilia|reclasi|marca|c[aá]mbia|ponlo|ponme|apunta|registra)/.test(t)) return null

  const signo: Signo = /ingres|cobr/.test(t) ? 'ingreso' : 'gasto'

  // Desglose por destino / comparativa entre negocios.
  if (/(por destino|por negocio|pisos vs|vs corredur|corredur[ií]a vs|desglose|por categor[ií]a|cada destino|c[oó]mo van)/.test(t)) {
    return { tipo: 'por_destino', anio: anioDe(t, hoy) }
  }

  // Por concepto/proveedor (luz, agua, seguros…).
  const syn = SINONIMOS.find(s => s.terminos.some(term => t.includes(term)))
  if (syn) return { tipo: 'concepto', signo, terminos: syn.terminos, etiqueta: syn.etiqueta, anio: anioDe(t, hoy) }

  // Mes explícito (junio, "en mayo"…).
  const mesKey = Object.keys(MESES).find(m => new RegExp(`\\b${m}\\b`).test(t))
  if (mesKey) return { tipo: 'movimientos_mes', signo, anio: anioDe(t, hoy), mes: MESES[mesKey] }

  // Mes relativo.
  if (/mes pasado|mes anterior/.test(t)) { const r = mesRelativoPasado(hoy); return { tipo: 'movimientos_mes', signo, anio: r.anio, mes: r.mes } }
  if (/este mes|del mes|en el mes|mes actual/.test(t)) return { tipo: 'movimientos_mes', signo, anio: hoy.anio, mes: hoy.mes }

  // Año (o "cuánto llevo…" sin más → acumulado del año).
  if (/a[ñn]o|anual|\b20\d{2}\b|total|llevo|este a[ñn]o/.test(t)) return { tipo: 'movimientos_anio', signo, anio: anioDe(t, hoy) }

  return null
}

// Etiqueta legible de mes para las respuestas.
export const NOMBRE_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
