// OCR de facturas (Fase 4): extrae importe/fecha/emisor de una imagen de factura con
// IA de visión (NVIDIA NIM, gratis, vía @central/core-ai) y la casa con un movimiento
// bancario. Degrada limpio sin NVIDIA_API_KEY. Sin almacenar el fichero (solo el dato
// extraído) — guardar el justificante queda como mejora futura.

import { nimVision, cleanJSON, type NimConfig } from '@central/core-ai'
import { prisma } from './db'

export type FacturaOCR = {
  emisor: string
  importe: number          // total de la factura (positivo)
  fecha: string            // 'YYYY-MM-DD'
  numero: string | null
  tipo: 'ingreso' | 'gasto'
}

const TIPOS_IMG = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

export function tipoImagenValido(t: string): boolean {
  return (TIPOS_IMG as readonly string[]).includes(t === 'image/jpg' ? 'image/jpeg' : t)
}

// OCR de la imagen → datos de la factura. null si no hay IA o no se reconoce.
export async function ocrFactura(base64: string, mediaType: string): Promise<FacturaOCR | null> {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) return null
  const config: NimConfig = { apiKey }

  const prompt = `Eres un OCR de facturas españolas. De la imagen extrae:
- "emisor": nombre del emisor/proveedor
- "importe": TOTAL de la factura como número (con IVA, sin símbolo)
- "fecha": fecha de la factura en formato YYYY-MM-DD
- "numero": número de factura (o null)
- "tipo": "gasto" si es una factura recibida de un proveedor, "ingreso" si la emites tú a un cliente
Responde SOLO un objeto JSON con esas claves, sin texto adicional.`

  try {
    const mt = mediaType === 'image/jpg' ? 'image/jpeg' : mediaType
    const raw = await nimVision(config, '', [{ data: base64, mediaType: mt }], prompt, 600, { temperature: 0.05, signal: AbortSignal.timeout(30_000) })
    const p = JSON.parse(cleanJSON(raw)) as Partial<FacturaOCR>
    const importe = Number(p.importe)
    if (!p.fecha || !Number.isFinite(importe) || importe === 0) return null
    return {
      emisor: String(p.emisor ?? '').trim() || 'Desconocido',
      importe: Math.abs(importe),
      fecha: String(p.fecha).slice(0, 10),
      numero: p.numero ? String(p.numero) : null,
      tipo: p.tipo === 'ingreso' ? 'ingreso' : 'gasto',
    }
  } catch {
    return null
  }
}

export type CasadoFactura = { movimientoId: string; concepto: string | null; importe: number } | null

// Casa la factura con un movimiento bancario sin conciliar de la cuenta: mismo signo
// (gasto↔cargo, ingreso↔abono), importe al céntimo, fecha ±TOL días. Marca conciliado.
export async function casarFactura(cuentaId: string, f: FacturaOCR, tolDias = 7): Promise<CasadoFactura> {
  const signo = f.tipo === 'gasto' ? -1 : 1
  // En Postgres, date - date = entero (días); no hace falta EXTRACT/EPOCH.
  const rows = await prisma.$queryRaw<Array<{ id: string; concepto: string | null; importe: unknown; dist: number }>>`
    SELECT mb.id, mb.concepto, mb.importe,
           ABS(mb.fecha_operacion - ${f.fecha}::date) AS dist
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.conciliado = false
      AND sign(mb.importe) = ${signo}
      AND ABS(ABS(mb.importe) - ${f.importe}) < 0.005
      AND mb.fecha_operacion IS NOT NULL
      AND ABS(mb.fecha_operacion - ${f.fecha}::date) <= ${tolDias}
    ORDER BY dist ASC
    LIMIT 1
  `
  const m = rows[0]
  if (!m) return null

  await prisma.$executeRaw`
    UPDATE movimientos_bancarios
    SET conciliado = true, factura_ref = ${`ocr:${f.emisor}${f.numero ? ' ' + f.numero : ''}`}
    WHERE id = ${m.id}::uuid
      AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)
  `
  return { movimientoId: m.id, concepto: m.concepto, importe: Number(m.importe) }
}
