// Estados del documento que sube el proveedor y la GUARDIA de contabilización. PURO.
//
// Albarán:  recibido → verificado (una persona del cliente pulsa «Recepción verificada»).
// Factura:  recibida → extraida | ilegible → lista | revisar → (persona) confirmada | rechazada → contabilizada.
//           `lista` = el case a tres bandas cuadra SIN diferencias que bloqueen; `revisar` = hay diferencias (o falta un dato).
//
// REGLA: nada se contabiliza si no casa O si no lo confirma una persona. `puedeContabilizar` es la única puerta.
export const TIPOS_DOCUMENTO = ['albaran', 'factura'] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

export const ESTADOS_ALBARAN = ['recibido', 'verificado'] as const
export const ESTADOS_FACTURA = ['recibida', 'extraida', 'ilegible', 'lista', 'revisar', 'confirmada', 'rechazada', 'contabilizada'] as const
export type EstadoAlbaranDoc = (typeof ESTADOS_ALBARAN)[number]
export type EstadoFacturaDoc = (typeof ESTADOS_FACTURA)[number]
export type EstadoDocumento = EstadoAlbaranDoc | EstadoFacturaDoc
export const ESTADOS_DOCUMENTO: readonly EstadoDocumento[] = [...new Set<EstadoDocumento>([...ESTADOS_ALBARAN, ...ESTADOS_FACTURA])]

const TRANSICIONES: Readonly<Record<TipoDocumento, Readonly<Record<string, readonly string[]>>>> = {
  albaran: { recibido: ['verificado'], verificado: [] },
  factura: {
    recibida: ['extraida', 'ilegible'],
    extraida: ['lista', 'revisar'],
    ilegible: ['revisar', 'rechazada'],
    // `lista` puede volver a revisión si una persona lo pide antes de contabilizar.
    lista: ['contabilizada', 'revisar'],
    revisar: ['confirmada', 'rechazada', 'lista'],
    confirmada: ['contabilizada'],
    rechazada: [],
    contabilizada: [],
  },
}

export function puedeTransicionar(tipo: TipoDocumento, desde: string, hacia: string): boolean {
  return (TRANSICIONES[tipo][desde] ?? []).includes(hacia)
}

/** Estado tras el case: `lista` solo si cuadra (true). `null` (no se pudo casar) o false → `revisar`. */
export function estadoTrasCase(cuadra: boolean | null): 'lista' | 'revisar' {
  return cuadra === true ? 'lista' : 'revisar'
}

export interface DocParaContabilizar {
  tipo: TipoDocumento
  estado: string
  /** Resultado del case a tres bandas: true = cuadra; false = diferencias; null = no casado (no se sabe). */
  caseCuadra: boolean | null
  /** Persona que confirmó la factura en revisión (id). null = nadie. */
  confirmadoPor: string | null
}
export type DecisionContable = { contabilizar: true; via: 'case' | 'persona' } | { contabilizar: false; motivo: string }

/**
 * ÚNICA puerta para contabilizar una factura de proveedor:
 *  · `lista` y el case cuadra (true)            → sí, vía case;
 *  · `confirmada` con una persona identificada  → sí, vía persona;
 *  · cualquier otra cosa                        → no (con el motivo).
 * Un case `null` (no casado) NUNCA cuenta como que cuadra.
 */
export function puedeContabilizar(d: DocParaContabilizar): DecisionContable {
  if (d.tipo !== 'factura') return { contabilizar: false, motivo: 'solo se contabiliza una factura' }
  if (d.estado === 'contabilizada') return { contabilizar: false, motivo: 'ya contabilizada' }
  if (d.estado === 'lista') {
    return d.caseCuadra === true ? { contabilizar: true, via: 'case' } : { contabilizar: false, motivo: 'el case a tres bandas no cuadra' }
  }
  if (d.estado === 'confirmada') {
    return d.confirmadoPor && d.confirmadoPor.trim() ? { contabilizar: true, via: 'persona' } : { contabilizar: false, motivo: 'falta quién la confirmó' }
  }
  return { contabilizar: false, motivo: `la factura está «${d.estado}»: necesita case o confirmación de una persona` }
}
