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
  pdfIndice: number | null
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
    const d = (o.desglose as { anual?: Record<string, unknown> } | null | undefined)?.anual
    const pdf = o.pdf as { indice?: unknown; nombre?: unknown } | null | undefined
    const indice = pdf && typeof pdf.indice === 'number' && Number.isInteger(pdf.indice) && pdf.indice >= 0 ? pdf.indice : null
    if (indice !== null && !pdfs.has(indice)) pdfs.set(indice, typeof pdf?.nombre === 'string' && pdf.nombre ? pdf.nombre : `oferta-${indice + 1}.pdf`)
    ofertas.push({
      compania: typeof o.compania === 'string' ? o.compania : '',
      producto: typeof o.producto === 'string' ? o.producto : '',
      primaTotalAnual: total,
      primaNeta: num(d?.primaNetaEur) ?? num(o.primaNetaEur),
      impuestos: num(d?.impuestosEur),
      pdfIndice: indice,
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
