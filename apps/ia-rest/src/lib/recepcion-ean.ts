// Resolución de un EAN a nombre de producto vía Open Food Facts. Helper PURO
// (fetch inyectable) reutilizado por la foto-recepción (`reconocer`) y por la
// ruta `/ean` del escáner de código de barras.

/** Valida el dígito de control de un EAN-8 / UPC-A(12) / EAN-13. Rechaza lecturas
 *  PARCIALES o erróneas del escáner (que de otro modo crean filas basura). */
export function eanValido(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false
  const d = code.split('').map(Number)
  const check = d.pop() as number
  let suma = 0
  for (let i = d.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) suma += d[i] * peso
  return (10 - (suma % 10)) % 10 === check
}

/** Resuelve el nombre de un producto a partir de su código de barras (Open Food Facts). */
export async function nombrePorEan(ean: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await fetchImpl(
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,product_name_es,brands`,
      { headers: { 'User-Agent': 'ia.rest/1.0 (recepcion mercancia)' }, signal: AbortSignal.timeout(6000) },
    )
    if (!r.ok) return null
    const j = await r.json()
    const p = j?.product
    if (j?.status !== 1 || !p) return null
    const nombre = String(p.product_name_es || p.product_name || '').trim()
    if (!nombre) return null
    const marca = String(p.brands || '').split(',')[0]?.trim()
    return marca && !nombre.toLowerCase().includes(marca.toLowerCase()) ? `${nombre} (${marca})` : nombre
  } catch { return null }
}
