// Lectura del tarificador RPA para plataforma (06/10/2026). PURO: sin BD ni red.
//
// 🛡️ Lo que sale hacia plataforma es una lista BLANCA: estado, fechas, error {tipo, mensaje} y las
//    ofertas con sus primas. NUNCA la URL del portal, el HTML/captura del fallo (`html_documento_id`,
//    `evidencia_documento_id`: solo operador interno), ni el riesgo, ni credenciales.

export type FilaTrabajoLectura = {
  estado: string
  created_at: Date | string
  updated_at: Date | string
  error: unknown
}

export type OfertaLectura = {
  compania: string
  producto: string
  primaTotalAnual: number
  primaNeta: number | null
  impuestos: number | null
  /** Columna «Sucesivos» de ePAC = prima anual completa de renovación. `null` = no se leyó (≠ 0). */
  primaTotalSucesivos: number | null
  primaNetaSucesivos: number | null
  impuestosSucesivos: number | null
  pdfIndice: number | null
  /** Fecha de término REAL que fijó el portal (ISO; ePAC la ajusta al día 1 del mes). `null` = no se leyó. */
  fechaTerminoPortal: string | null
}

export type TrabajoLectura = {
  estado: string
  creadoEn: string
  actualizadoEn: string
  error: { tipo: string; mensaje: string } | null
  ofertas: OfertaLectura[]
  pdfs: { indice: number; nombre: string }[]
}

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString())
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fechaIso = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

/** Del jsonb `error` solo salen tipo y mensaje (recortado). */
export function errorPublico(e: unknown): { tipo: string; mensaje: string } | null {
  if (!e || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  const tipo = typeof o.tipo === 'string' && o.tipo ? o.tipo : 'desconocido'
  const mensaje = typeof o.mensaje === 'string' ? o.mensaje.slice(0, 300) : ''
  return { tipo, mensaje }
}

/** `respuesta.ofertas[]` de `tarificaciones` (canal rpa) → ofertas públicas + PDFs (por índice del worker). */
export function ofertasPublicas(respuesta: unknown): { ofertas: OfertaLectura[]; pdfs: { indice: number; nombre: string }[] } {
  const crudas = respuesta && typeof respuesta === 'object' ? (respuesta as { ofertas?: unknown }).ofertas : null
  if (!Array.isArray(crudas)) return { ofertas: [], pdfs: [] }
  const ofertas: OfertaLectura[] = []
  const pdfs = new Map<number, string>()
  for (const raw of crudas) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const total = num(o.primaAnualEur)
    if (total === null) continue // una oferta sin prima no es una oferta
    const dg = o.desglose as { anual?: Record<string, unknown>; sucesivos?: Record<string, unknown> } | null | undefined
    const d = dg?.anual
    const ds = dg?.sucesivos
    const pdf = o.pdf as { indice?: unknown; nombre?: unknown } | null | undefined
    const indice = pdf && typeof pdf.indice === 'number' && Number.isInteger(pdf.indice) && pdf.indice >= 0 ? pdf.indice : null
    if (indice !== null && !pdfs.has(indice)) pdfs.set(indice, typeof pdf?.nombre === 'string' && pdf.nombre ? pdf.nombre : `oferta-${indice + 1}.pdf`)
    ofertas.push({
      compania: typeof o.compania === 'string' ? o.compania : '',
      producto: typeof o.producto === 'string' ? o.producto : '',
      primaTotalAnual: total,
      primaNeta: num(d?.primaNetaEur) ?? num(o.primaNetaEur),
      impuestos: num(d?.impuestosEur),
      primaTotalSucesivos: num(ds?.primaTotalEur),
      primaNetaSucesivos: num(ds?.primaNetaEur),
      impuestosSucesivos: num(ds?.impuestosEur),
      pdfIndice: indice,
      fechaTerminoPortal: fechaIso(o.fechaTerminoPortal),
    })
  }
  return {
    ofertas,
    pdfs: [...pdfs.entries()].sort((a, b) => a[0] - b[0]).map(([indice, nombre]) => ({ indice, nombre })),
  }
}

export function proyectarTrabajo(fila: FilaTrabajoLectura, respuesta: unknown): TrabajoLectura {
  const { ofertas, pdfs } = fila.estado === 'ok' ? ofertasPublicas(respuesta) : { ofertas: [], pdfs: [] }
  return {
    estado: fila.estado,
    creadoEn: iso(fila.created_at),
    actualizadoEn: iso(fila.updated_at),
    error: errorPublico(fila.error),
    ofertas,
    pdfs,
  }
}

/** `documentoId` de la oferta cuyo PDF tiene ese índice (lo guardó `registrarResultado`). */
export function documentoDePdf(respuesta: unknown, indice: number): string | null {
  const crudas = respuesta && typeof respuesta === 'object' ? (respuesta as { ofertas?: unknown }).ofertas : null
  if (!Array.isArray(crudas)) return null
  for (const raw of crudas) {
    const o = raw as { pdf?: { indice?: unknown } | null; documentoId?: unknown } | null
    if (o?.pdf && o.pdf.indice === indice && typeof o.documentoId === 'string') return o.documentoId
  }
  return null
}

/** Índice de la URL: entero 0..99 sin ceros a la izquierda ni signos. */
export function indicePdfValido(s: string): number | null {
  return /^(0|[1-9]\d?)$/.test(s) ? Number(s) : null
}

// ─── Último riesgo tecleado (07/10/2026) ───────────────────────────────────
// Para PRE-RELLENAR el modal «Precio Allianz (bot)». Lista BLANCA de claves del riesgo de comunidad:
// nada de credenciales, html, captura ni error interno; solo los datos del riesgo que el formulario conoce.

export const CLAVES_RIESGO_ESCALARES = [
  'fechaEfecto', 'fechaTermino', 'm2Construidos', 'anioConstruccion', 'tipoVivienda', 'uso', 'plantas',
  'numEdificios', 'numViviendasYLocales', 'listaPropietarios', 'ascensor', 'piscina', 'calidadConstruccion',
  'capitalContinente', 'capitalContenido',
] as const
export const CLAVES_DIRECCION = ['via', 'numero', 'codigoPostal', 'municipio', 'provincia'] as const

export type UltimoRiesgo = { riesgo: Record<string, unknown> | null; trabajoId: string | null; creadoEn: string | null }

const primitivo = (v: unknown): string | number | boolean | null =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) ? v : null

/** `riesgo` jsonb → solo claves conocidas con valor primitivo. Cualquier otra cosa → `null`. */
export function riesgoPublico(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of CLAVES_RIESGO_ESCALARES) {
    const v = primitivo(o[k])
    if (v !== null) out[k] = v
  }
  if (o.direccion && typeof o.direccion === 'object' && !Array.isArray(o.direccion)) {
    const d = o.direccion as Record<string, unknown>
    const dir: Record<string, unknown> = {}
    for (const k of CLAVES_DIRECCION) {
      const v = primitivo(d[k])
      if (v !== null) dir[k] = v
    }
    if (Object.keys(dir).length) out.direccion = dir
  }
  return Object.keys(out).length ? out : null
}

export function proyectarUltimoRiesgo(fila: { id: string; created_at: Date | string; riesgo: unknown } | null): UltimoRiesgo {
  const vacio: UltimoRiesgo = { riesgo: null, trabajoId: null, creadoEn: null }
  if (!fila) return vacio
  const riesgo = riesgoPublico(fila.riesgo)
  if (!riesgo) return vacio
  return { riesgo, trabajoId: fila.id, creadoEn: iso(fila.created_at) }
}
