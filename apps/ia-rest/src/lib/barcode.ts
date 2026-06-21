// src/lib/barcode.ts
// Lectura de códigos de barras en el navegador (BarcodeDetector API) + parseo GS1.
// Extraído del portal ASN (src/app/asn/[token]/AsnClientApp.tsx) para reutilizarlo
// también en el escáner del owner (SmartScanModal). Sin dependencias, browser-only.

// Parseador GS1-128 / GS1 DataMatrix
export function parseGS1(raw: string): { gtin?: string; lote?: string; caducidad?: string } {
  const result: { gtin?: string; lote?: string; caducidad?: string } = {}
  const str = '\x1D' + raw.replace(/\((\d{2,4})\)/g, '\x1D$1')
  const gtin = str.match(/\x1D01(\d{14})/)
  if (gtin) result.gtin = gtin[1]
  const exp = str.match(/\x1D17(\d{6})/)
  if (exp) {
    const d = exp[1]
    result.caducidad = `20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6) === '00' ? '01' : d.slice(4,6)}`
  }
  if (!result.caducidad) {
    const bb = str.match(/\x1D15(\d{6})/)
    if (bb) {
      const d = bb[1]
      result.caducidad = `20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6) === '00' ? '01' : d.slice(4,6)}`
    }
  }
  const lot = str.match(/\x1D10([A-Za-z0-9\-\/\.]{1,20})/)
  if (lot) result.lote = lot[1]
  return result
}

export async function detectBarcode(imageFile: File): Promise<{ raw: string; format: string } | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector
    const detector = new BD({ formats: ['code_128', 'data_matrix', 'qr_code', 'ean_13', 'ean_8'] })
    const img = await createImageBitmap(imageFile)
    const codes = await detector.detect(img)
    if (codes.length > 0) {
      const gs1 = codes.find((c: { format: string }) => ['code_128', 'data_matrix'].includes(c.format))
      const best = gs1 ?? codes[0]
      return { raw: best.rawValue, format: best.format }
    }
  } catch { /* silent */ }
  return null
}
