// apps/plataforma/lib/contable/documentos.ts
// Orquesta un documento subido (foto de ticket / PDF de factura): extrae con la maquinaria
// CANÓNICA existente (extraerDesdeBuffer → aiExtractInvoice) y busca un movimiento bancario que
// cuadre, SIN escribir nada (la conciliación real se hace luego por confirmación, en acciones.ts).
// No implementa OCR nuevo (spec §5).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { extraerDesdeBuffer } from '@/lib/agente-facturas/extraer'
import { esExtractoTarjeta } from '@/lib/extracto-tarjeta-pdf'
import { interpretarExtraccion, type FacturaDoc, type MatchDoc } from './documentos-tipos'
import { procesarExtractoTarjeta } from './extracto-tarjeta'

export type DocProcesado =
  | { ok: false; motivo: string }
  | { ok: true; tipo: 'factura'; factura: FacturaDoc; match: MatchDoc }
  | { ok: true; tipo: 'extracto_tarjeta'; resumen: string; driveUrl?: string }

// Busca un movimiento sin conciliar que cuadre con la factura (gasto → cargo), al céntimo y ±tol
// días. READ-ONLY: réplica de la SELECT de factura-ocr.ts::casarFactura pero SIN el UPDATE (aquí
// solo proponemos; el UPDATE lo hace acciones.ts tras confirmar). Todo scoped por cuenta_id.
async function buscarMovimiento(cuentaId: string, f: FacturaDoc, tolDias = 7): Promise<MatchDoc> {
  const rows = await prisma.$queryRaw<Array<{ id: string; concepto: string | null; importe: unknown }>>(Prisma.sql`
    SELECT mb.id, mb.concepto, mb.importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.conciliado = false
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
      AND sign(mb.importe) = -1
      AND ABS(ABS(mb.importe) - ${f.total}) < 0.005
      AND mb.fecha_operacion IS NOT NULL
      AND ABS(mb.fecha_operacion - ${f.fecha}::date) <= ${tolDias}
    ORDER BY ABS(mb.fecha_operacion - ${f.fecha}::date) ASC
    LIMIT 1`).catch(() => [])
  const m = rows[0]
  return m ? { movId: m.id, concepto: m.concepto, importe: Number(m.importe) } : null
}

export async function procesarDocumento(
  cuentaId: string, buffer: Buffer, mimeType: string, fileName = '',
): Promise<DocProcesado> {
  let extraido
  try {
    extraido = await extraerDesdeBuffer(buffer, mimeType, fileName)
  } catch {
    return { ok: false, motivo: 'No pude procesar el documento. ¿Es un PDF o una imagen (JPG/PNG)?' }
  }

  // Un EXTRACTO de tarjeta (multilínea) no es una factura suelta: se desglosa e importa por su
  // propia vía (parser exacto → importarExtracto → categoría → devoluciones → cuadre → Drive).
  if (extraido.texto && esExtractoTarjeta(extraido.texto)) {
    return await procesarExtractoTarjeta(cuentaId, buffer, mimeType, fileName, extraido.texto)
  }

  const interp = interpretarExtraccion(extraido.data, extraido.source)
  if (!interp.ok) return interp

  const match = await buscarMovimiento(cuentaId, interp.factura)
  return { ok: true, tipo: 'factura', factura: interp.factura, match }
}
