// El estudio comparativo en PDF de un presupuesto de ofertas, pedido a asegura por el puente (F4).
// La identidad sale de la SESIÓN (la pone la ruta); la ficha y la propiedad las decide asegura
// (`pdfEstudioParaPortal`): aquí no se manda ningún `clienteId`.

import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type DescargaEstudio =
  | { estado: 'ok'; bytes: Uint8Array; nombre: string }
  | { estado: 'no_encontrado' }
  | { estado: 'no_disponible' }
  | { estado: 'error' }

/** Lo que se acepta como nombre de fichero: sin rutas ni comillas. Cualquier otra cosa cae a uno fijo. */
export function nombreFicheroSeguro(v: string | null): string {
  const limpio = (v ?? '').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
  return /\.pdf$/i.test(limpio) && limpio.length > 4 ? limpio : 'estudio-comparativo.pdf'
}

/** Solo un PDF de verdad se sirve como PDF (`%PDF-`): un JSON de error nunca sale con ese tipo. */
export function esPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
}

export async function descargarEstudioPdf(identidadId: string, presupuestoId: string): Promise<DescargaEstudio> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return { estado: 'error' }
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/presupuesto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ accion: 'pdf', identidadId, presupuestoId }),
      cache: 'no-store',
      signal: control.signal,
    })
    if (res.status === 404) return { estado: 'no_encontrado' }
    if (res.status === 409) return { estado: 'no_disponible' }
    if (res.status !== 200) return { estado: 'error' }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!esPdf(bytes)) return { estado: 'error' }
    return { estado: 'ok', bytes, nombre: nombreFicheroSeguro(res.headers.get('x-nombre-fichero')) }
  } catch (e) {
    console.error('[portal/presupuesto] el PDF del estudio no llegó:', e instanceof Error ? e.message : e)
    return { estado: 'error' }
  } finally {
    clearTimeout(reloj)
  }
}
