// Vocabulario CERRADO de `tipo_documento` y qué hace el agente con cada tipo. Módulo PURO.
//
// 🚨 Por qué existe (03/11/2026). El prompt de extracción ya pedía `tipo_documento`, pero `procesar.ts`
// NO lo miraba (solo el filtro del botón ✅ Pagar, `filtro-pago.ts`). Así entraron como gasto un
// presupuesto de ASISA, una solicitud de inscripción a una asociación de corredores (con
// `tipo_documento = null`), liquidaciones de Allianz al mediador y resúmenes anuales de Booking.
// En la BD, 28 de 51 gastos del agente de los últimos 60 días tenían `tipo_documento = null`.
//
// Tres desenlaces:
//   · 'gasto'   — factura, recibo, ticket, justificante de pago, donativo: sigue el cauce normal.
//   · 'revisar' — `null` (la IA no lo clasificó) u 'otro' (no supo): a la bandeja CON aviso, nunca
//                 confirmable en silencio. `null` = «no se sabe», no «es factura».
//   · 'omitir'  — presupuesto, proforma, solicitud, liquidación de comisiones, resumen de pagos,
//                 aviso/circular: no son un gasto devengado. Se omiten registrados en `agente_log`.

export const TIPOS_DOCUMENTO = [
  'factura',
  'recibo',
  'ticket',
  'justificante_pago',
  'presupuesto',
  'proforma',
  'solicitud_inscripcion',
  'liquidacion_comisiones',
  'resumen_pagos',
  'aviso_circular',
  'certificado_donativo',
  'otro',
] as const

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

/** Tipos que son un gasto devengado. */
export const TIPOS_GASTO: readonly TipoDocumento[] = ['factura', 'recibo', 'ticket', 'justificante_pago', 'certificado_donativo']

/** Tipos que NO son gasto y se omiten. */
export const TIPOS_NO_GASTO: readonly TipoDocumento[] = [
  'presupuesto', 'proforma', 'solicitud_inscripcion', 'liquidacion_comisiones', 'resumen_pagos', 'aviso_circular',
]

/** Nombres que dio el prompt anterior (filas viejas de `raw_extraction`) o variantes que la IA escribe. */
const ALIAS: Record<string, TipoDocumento> = {
  circular_informativa: 'aviso_circular',
  circular: 'aviso_circular',
  aviso: 'aviso_circular',
  comunicado: 'aviso_circular',
  boletin: 'aviso_circular',
  formulario_inscripcion: 'solicitud_inscripcion',
  solicitud: 'solicitud_inscripcion',
  inscripcion: 'solicitud_inscripcion',
  cotizacion: 'presupuesto',
  oferta: 'presupuesto',
  quote: 'presupuesto',
  budget: 'presupuesto',
  liquidacion: 'liquidacion_comisiones',
  extracto_comisiones: 'liquidacion_comisiones',
  extracto: 'liquidacion_comisiones',
  resumen: 'resumen_pagos',
  invoice: 'factura',
  receipt: 'recibo',
  justificante: 'justificante_pago',
  justificante_de_pago: 'justificante_pago',
  factura_simplificada: 'ticket',
  proforma_invoice: 'proforma',
  pro_forma: 'proforma',
  donativo: 'certificado_donativo',
}

/**
 * Normaliza lo que devolvió la IA al vocabulario cerrado.
 * `null` = no lo dio (o vacío). Un texto que no se reconoce cuenta como 'otro' (la IA dio algo,
 * pero no sabemos qué): nunca se convierte en 'factura' por defecto.
 */
export function normalizaTipoDocumento(t: unknown): TipoDocumento | null {
  if (typeof t !== 'string') return null
  const n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
  if (!n || n === 'null') return null
  if ((TIPOS_DOCUMENTO as readonly string[]).includes(n)) return n as TipoDocumento
  return ALIAS[n] ?? 'otro'
}

export type DecisionTipo =
  | { accion: 'gasto'; tipo: TipoDocumento }
  | { accion: 'revisar'; tipo: TipoDocumento | null; aviso: string }
  | { accion: 'omitir'; tipo: TipoDocumento; motivo: string }

const ETIQUETA: Record<TipoDocumento, string> = {
  factura: 'factura', recibo: 'recibo', ticket: 'ticket', justificante_pago: 'justificante de pago',
  presupuesto: 'presupuesto', proforma: 'proforma', solicitud_inscripcion: 'solicitud de inscripción',
  liquidacion_comisiones: 'liquidación o extracto de comisiones', resumen_pagos: 'resumen de pagos',
  aviso_circular: 'aviso o circular', certificado_donativo: 'certificado de donativo', otro: 'otro',
}

export const AVISO_TIPO_NULL = 'La IA no clasificó el tipo de documento: confirma que es una factura'
export const AVISO_TIPO_OTRO = 'La IA no reconoce el documento como factura ni recibo: confirma que es un gasto'

/**
 * Qué hacer con el documento según su tipo.
 * @param total importe leído: un 'otro' SIN importe no es un gasto que se pueda revisar (la IA lo
 *   leyó —dio tipo— y no hay cantidad), así que se omite en vez de quedar como 'error' que se
 *   re-lee a diario.
 */
export function decidirPorTipo(tipoBruto: unknown, total?: number | null): DecisionTipo {
  const tipo = normalizaTipoDocumento(tipoBruto)
  if (tipo === null) return { accion: 'revisar', tipo: null, aviso: AVISO_TIPO_NULL }
  if (TIPOS_GASTO.includes(tipo)) return { accion: 'gasto', tipo }
  if (TIPOS_NO_GASTO.includes(tipo)) {
    return { accion: 'omitir', tipo, motivo: `No es un gasto: es un/a ${ETIQUETA[tipo]}` }
  }
  // 'otro'
  if (!(typeof total === 'number' && total > 0)) {
    return { accion: 'omitir', tipo, motivo: 'No es un gasto: documento sin importe que no es factura ni recibo' }
  }
  return { accion: 'revisar', tipo, aviso: AVISO_TIPO_OTRO }
}
