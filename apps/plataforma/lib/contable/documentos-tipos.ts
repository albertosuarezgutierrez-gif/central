// apps/plataforma/lib/contable/documentos-tipos.ts
// Lógica PURA de interpretación de un documento extraído (ticket/factura) → factura estructurada
// o "no lo he podido leer". Sin BD ni alias '@/', así el test (node --test) la carga aislada
// (mismo motivo por el que parse.ts / formato.ts / acciones-tipos.ts son autónomos).
// REGLA DURA: nunca inventamos importe ni fecha. Si no hay datos fiables → ok:false.

export type ExtraccionCruda = {
  fecha?: string | null
  proveedor?: string | null
  concepto?: string | null
  numero_factura?: string | null
  total?: number | null
}

export type FacturaDoc = {
  proveedor: string
  fecha: string        // 'YYYY-MM-DD'
  total: number        // positivo (importe con IVA)
  numero: string | null
  concepto: string | null
}

export type Interpretacion =
  | { ok: false; motivo: string }
  | { ok: true; factura: FacturaDoc }

export type MatchDoc = { movId: string; concepto: string | null; importe: number } | null

const NO_LEIDO = 'No he podido leer el documento. Prueba con una foto más nítida o un PDF que tenga texto (no solo imagen escaneada).'
const SIN_DATOS = 'He abierto el documento pero no distingo el importe o la fecha con seguridad, así que no me lo invento. Dímelos tú o sube una copia más clara.'

// Decide si la extracción es utilizable y normaliza la factura. Determinista, sin red.
export function interpretarExtraccion(data: ExtraccionCruda, source: 'text' | 'vision' | 'none'): Interpretacion {
  if (source === 'none') return { ok: false, motivo: NO_LEIDO }

  const total = Number(data.total)
  const fecha = (data.fecha || '').toString().slice(0, 10)
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(total) || total === 0) {
    return { ok: false, motivo: SIN_DATOS }
  }

  return {
    ok: true,
    factura: {
      proveedor: (data.proveedor || '').toString().trim() || 'Proveedor desconocido',
      fecha,
      total: Math.abs(total),
      numero: data.numero_factura ? String(data.numero_factura).trim() : null,
      concepto: data.concepto ? String(data.concepto).trim() : null,
    },
  }
}

// Texto legible para el chat tras leer el documento. Determinista.
export function resumenDocumento(f: FacturaDoc, match: MatchDoc): string {
  const cab = `📄 Leído: ${f.proveedor} · ${f.fecha} · ${f.total.toFixed(2)}€${f.numero ? ` · nº ${f.numero}` : ''}.`
  if (match) {
    return `${cab}\nCuadra con un movimiento bancario de ${Math.abs(match.importe).toFixed(2)}€${match.concepto ? ` (${match.concepto})` : ''}. ¿Lo concilio?`
  }
  return `${cab}\nNo encuentro un movimiento bancario que cuadre (mismo importe, ±7 días). Revísalo tú o súbeme el cargo correcto.`
}

// Referencia corta que se guarda en factura_ref al conciliar. Determinista.
export function refFactura(f: FacturaDoc): string {
  return `doc:${f.proveedor}${f.numero ? ' ' + f.numero : ''}`.slice(0, 120)
}

// Construye la propuesta de acción "conciliar" a partir de la factura y su match bancario. Puro:
// lo consumen la boca web (/api/contable/chat) y la de Telegram (lib/contable/telegram.ts) igual,
// así ninguna de las dos inventa el importe (sale del OCR + SQL) ni divergen entre sí.
export type PropuestaAccion = { tipo: string; params: Record<string, unknown>; resumen: string }
export function accionConciliar(f: FacturaDoc, match: MatchDoc): PropuestaAccion | null {
  if (!match) return null
  return {
    tipo: 'conciliar',
    params: { movId: match.movId, facturaRef: refFactura(f), concepto: match.concepto },
    resumen: `Conciliar factura de ${f.proveedor} (${f.total.toFixed(2)}€) con el movimiento de ${Math.abs(match.importe).toFixed(2)}€`,
  }
}
