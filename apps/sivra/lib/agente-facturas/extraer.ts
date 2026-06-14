// Extracción de factura desde un buffer (PDF o imagen), reutilizable por el
// agente (scan/backfill) sin pasar por el endpoint HTTP. Replica el pipeline de
// app/api/expenses/parse-invoice/route.ts.
import { aiExtractInvoice } from '@/lib/ai-client'

export interface FacturaExtraida {
  fecha?: string | null
  proveedor?: string | null
  nif_proveedor?: string | null
  concepto?: string | null
  numero_factura?: string | null
  base_imponible?: number | null
  iva_porcentaje?: number | null
  iva?: number | null
  irpf_porcentaje?: number | null
  irpf?: number | null
  total?: number | null
  categoria?: string | null
}

export async function extraerDesdeBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName = '',
): Promise<{ data: FacturaExtraida; source: 'text' | 'vision' | 'none'; texto?: string }> {
  const esPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  if (esPdf) {
    let texto = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      const parsed = await pdfParse(buffer)
      texto = parsed.text || ''
    } catch (e) {
      console.warn('[extraer] pdf-parse error:', e)
    }
    if (!texto.trim()) return { data: {}, source: 'none' }
    const data = (await aiExtractInvoice({ text: texto })) as FacturaExtraida
    return { data, source: 'text', texto }
  }

  if (mimeType.startsWith('image/')) {
    const imageBase64 = buffer.toString('base64')
    const data = (await aiExtractInvoice({ imageBase64, mimeType })) as FacturaExtraida
    return { data, source: 'vision' }
  }

  return { data: {}, source: 'none' }
}
