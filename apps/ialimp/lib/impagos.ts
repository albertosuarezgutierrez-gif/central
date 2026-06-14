// Agente de impagos (lógica PURA, testeable con `node --test`).
// Sin red ni BD: la E/S (Prisma, mailer) vive en el endpoint del cron.
// Cadencia de recordatorios escalonados, en días tras el vencimiento.

export const ESCALONES = [3, 10, 21] as const // 1=amable · 2=segundo aviso · 3=último

export type FacturaImpago = {
  numero_factura: string
  cliente_nombre: string
  total: number
  fecha_vencimiento: string // 'YYYY-MM-DD'
}

const ETIQUETA_ESCALON: Record<number, string> = {
  1: 'Recordatorio de pago',
  2: 'Segundo aviso de pago pendiente',
  3: 'Último aviso de pago pendiente',
}

export function fmtEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
}

/** Días enteros transcurridos desde el vencimiento hasta hoy (negativo si aún no vence). */
export function diasVencida(fechaVencimiento: string, hoy: string): number {
  const venc = Date.parse(`${fechaVencimiento}T00:00:00Z`)
  const ref = Date.parse(`${hoy}T00:00:00Z`)
  return Math.round((ref - venc) / 86_400_000)
}

/**
 * Devuelve el escalón (1..N) que toca enviar HOY, o null si no toca.
 * - Coge el escalón MÁS ALTO ya alcanzado por los días vencidos.
 * - No reenvía un escalón ya enviado ni "baja" a uno anterior.
 */
export function escalonAEnviar(dias: number, enviados: number[]): number | null {
  let alcanzado = 0
  for (let i = 0; i < ESCALONES.length; i++) {
    if (dias >= ESCALONES[i]) alcanzado = i + 1
  }
  if (alcanzado === 0) return null
  const maxEnviado = enviados.length ? Math.max(...enviados) : 0
  return alcanzado > maxEnviado ? alcanzado : null
}

/** Email de recordatorio al cliente. */
export function textoRecordatorio(
  empresaNombre: string,
  f: FacturaImpago,
  escalon: number,
): { asunto: string; texto: string } {
  const etiqueta = ETIQUETA_ESCALON[escalon] ?? 'Recordatorio de pago'
  const asunto = `${etiqueta} — factura ${f.numero_factura}`
  const cierre = escalon >= 3
    ? 'Si ya has realizado el pago, ignora este mensaje. En caso contrario, te rogamos lo regularices a la mayor brevedad o contactes con nosotros.'
    : 'Si ya lo has abonado, ignora este mensaje. Gracias.'
  const texto = [
    `Hola ${f.cliente_nombre},`,
    '',
    `Te recordamos que la factura ${f.numero_factura}, por importe de ${fmtEur(f.total)}, ` +
      `venció el ${f.fecha_vencimiento} y consta como pendiente de pago.`,
    '',
    cierre,
    '',
    `Un saludo,`,
    empresaNombre,
  ].join('\n')
  return { asunto, texto }
}

/** Email-resumen diario a la empresa con sus impagos. */
export function resumenEmpresaTexto(
  empresaNombre: string,
  items: FacturaImpago[],
): { asunto: string; texto: string } {
  const totalAdeudado = items.reduce((s, f) => s + f.total, 0)
  const lineas = items.map(f =>
    `• ${f.numero_factura} — ${f.cliente_nombre}: ${fmtEur(f.total)} (venció ${f.fecha_vencimiento})`,
  )
  const asunto = `💸 Impagos pendientes: ${items.length} factura(s), ${fmtEur(totalAdeudado)}`
  const texto = [
    `Hola ${empresaNombre}, resumen de facturas vencidas y no cobradas:`,
    '',
    ...lineas,
    '',
    `TOTAL adeudado: ${fmtEur(totalAdeudado)}`,
  ].join('\n')
  return { asunto, texto }
}
