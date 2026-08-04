// Conciliador de facturas en LOTE desde Gmail.
// A diferencia de `pagos.ts` (cuentas a pagar → facturas_proveedor), esto ataca el
// otro lado: los CARGOS deducibles del banco que están «sin justificante»
// (factura_ref IS NULL) — busca su factura en el correo, la lee y la ENGANCHA al
// movimiento (conciliado=true + factura_ref). Reutiliza piezas ya probadas:
//   · listarCandidatos()  — lector IMAP con adjuntos (lib/agente-facturas/gmail.ts)
//   · aiExtractInvoice()   — OCR de PDF (texto) o imagen (visión) (lib/ai-client.ts)
//   · casarFactura()       — match CONSERVADOR (mismo signo + importe al céntimo +
//                            fecha ±N días) que marca conciliado. NO enlaza a ciegas.
// El buzón por defecto es `Triaje/Contabilidad` (el que ya rellena el agente de triaje).

import { listarCandidatos, type Adjunto } from './gmail'
import { aiExtractInvoice } from '@/lib/ai-client'
import { casarFactura, type FacturaOCR } from '@/lib/factura-ocr'

export interface Enganchada {
  proveedor: string
  importe: number
  fecha: string
  numero: string | null
  movimientoId: string
  concepto: string | null
  asunto: string
}
export interface SinCasar {
  proveedor: string
  importe: number | null
  fecha: string
  asunto: string
  motivo: 'sin_movimiento' | 'sin_datos'
}
export interface ResultadoConciliacion {
  revisados: number        // adjuntos procesados
  correos: number          // correos mirados
  enganchadas: Enganchada[]
  sinCasar: SinCasar[]
}

// Extrae los datos de una factura de un adjunto (PDF por texto, imagen por visión).
// Devuelve un FacturaOCR listo para casarFactura, o null si no se pudo leer el importe.
async function leerAdjunto(adj: Adjunto): Promise<FacturaOCR | null> {
  let datos: Record<string, unknown> = {}
  try {
    if (adj.mime === 'application/pdf') {
      const pdfParse: any = await import('pdf-parse/lib/pdf-parse.js')
      const parsed = await (pdfParse.default ?? pdfParse)(adj.buffer)
      datos = await aiExtractInvoice({ text: parsed.text })
    } else if (adj.mime.startsWith('image/')) {
      datos = await aiExtractInvoice({ imageBase64: adj.buffer.toString('base64'), mimeType: adj.mime })
    } else {
      return null
    }
  } catch {
    return null
  }
  const importe = typeof datos.total === 'number' ? datos.total : Number(datos.total)
  if (!Number.isFinite(importe) || importe <= 0) return null
  const fecha = typeof datos.fecha === 'string' ? datos.fecha.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  return {
    emisor: (typeof datos.proveedor === 'string' && datos.proveedor.trim()) || 'Desconocido',
    importe: Math.abs(importe),
    fecha,
    numero: typeof datos.numero_factura === 'string' ? datos.numero_factura : null,
    tipo: 'gasto', // facturas recibidas de proveedores → cargos
  }
}

// Barre el buzón de contabilidad de los últimos `mesesAtras` meses, lee cada adjunto y
// engancha la factura a su cargo del banco cuando el match es inequívoco.
// `tolDias` acota la ventana de fecha del casado (defecto 10). `maxAdjuntos` limita el
// trabajo por ejecución (IMAP+OCR es lento; el resto se recoge en la siguiente pasada).
export async function conciliarFacturasDesdeGmail(
  cuentaId: string,
  opts: { mesesAtras?: number; etiqueta?: string; tolDias?: number; maxAdjuntos?: number } = {},
): Promise<ResultadoConciliacion> {
  const { mesesAtras = 6, etiqueta = 'Triaje/Contabilidad', tolDias = 10, maxAdjuntos = 80 } = opts
  const desde = new Date(Date.now() - mesesAtras * 30 * 24 * 3600 * 1000)

  let correos: Awaited<ReturnType<typeof listarCandidatos>> = []
  try {
    correos = await listarCandidatos({ desde, etiqueta })
  } catch {
    correos = []
  }

  const res: ResultadoConciliacion = { revisados: 0, correos: correos.length, enganchadas: [], sinCasar: [] }

  for (const correo of correos) {
    for (const adj of correo.adjuntos) {
      if (res.revisados >= maxAdjuntos) return res
      res.revisados++

      const factura = await leerAdjunto(adj)
      if (!factura) {
        res.sinCasar.push({ proveedor: correo.from.split('<')[0].trim() || 'Desconocido', importe: null, fecha: correo.fecha, asunto: correo.subject, motivo: 'sin_datos' })
        continue
      }

      // casarFactura solo engancha si hay un movimiento SIN conciliar con importe al
      // céntimo y fecha en ventana → auto-enlace inequívoco, nunca a ciegas.
      const casado = await casarFactura(cuentaId, factura, tolDias).catch(() => null)
      if (casado) {
        res.enganchadas.push({
          proveedor: factura.emisor, importe: factura.importe, fecha: factura.fecha, numero: factura.numero,
          movimientoId: casado.movimientoId, concepto: casado.concepto, asunto: correo.subject,
        })
      } else {
        res.sinCasar.push({ proveedor: factura.emisor, importe: factura.importe, fecha: factura.fecha, asunto: correo.subject, motivo: 'sin_movimiento' })
      }
    }
  }
  return res
}
