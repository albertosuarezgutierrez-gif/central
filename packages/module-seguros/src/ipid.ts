/**
 * Ficha IPID (documento de información del producto de seguro, Reglamento de Ejecución (UE)
 * 2017/1469): la entrega la compañía y el corredor la pone a disposición del cliente ANTES de
 * contratar. Aquí se guarda una por compañía + producto y se reutiliza en todos los presupuestos.
 *
 * La identidad del producto es `claveProducto`: compañía y producto normalizados. La usan los dos
 * lados (el portal que enseña el enlace y la aceptación que lo cita): con dos criterios, el
 * cliente podría firmar «se me entregó» sobre una opción cuyo enlace no vio.
 */

// 4 MB: el cuerpo de una función de Vercel se corta hacia 4,5 MB, así que más no llegaría a guardarse.
export const MAX_BYTES_IPID = 4 * 1024 * 1024

function normal(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** `null` si falta compañía o producto: sin los dos no se puede afirmar de qué producto es. */
export function claveProducto(compania: string | null | undefined, producto: string | null | undefined): string | null {
  const c = normal(compania ?? '')
  const p = normal(producto ?? '')
  if (!c || !p) return null
  return `${c}|${p}`
}

/** Solo PDF y como mucho 4 MB. Devuelve el motivo del rechazo o `null`. */
export function revisarIpid(f: { type: string; size: number; name?: string }): string | null {
  const esPdf = f.type === 'application/pdf' || (f.name ?? '').toLowerCase().endsWith('.pdf')
  if (!esPdf) return 'La ficha IPID tiene que ser un PDF.'
  if (f.size <= 0) return 'El fichero está vacío.'
  if (f.size > MAX_BYTES_IPID) return 'El PDF pasa de 4 MB.'
  return null
}
