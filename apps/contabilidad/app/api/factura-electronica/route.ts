import { NextResponse } from 'next/server'
import { generarFacturae, generarUbl, type FacturaElectronica } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'

// POST /api/factura-electronica { formato: 'ubl' | 'facturae', factura: FacturaElectronica } → XML (sin firma XAdES: cabecera `x-firma-xades: pendiente`).
// Generación PURA a partir de la factura del cuerpo: no lee ni escribe en la BD. La factura se valida en el generador (422 con los motivos).
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { formato?: unknown; factura?: unknown } | null
  if (!b || (b.formato !== 'ubl' && b.formato !== 'facturae') || !b.factura || typeof b.factura !== 'object') {
    return NextResponse.json({ error: 'datos_no_validos', errores: ['formato (ubl | facturae) y factura obligatorios'] }, { status: 400 })
  }
  try {
    const f = b.factura as FacturaElectronica
    const r = b.formato === 'ubl' ? generarUbl(f) : generarFacturae(f)
    return new Response(r.xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'x-firma-xades': 'pendiente', 'x-pendientes': encodeURIComponent(r.pendientes.join(' | ')), 'cache-control': 'no-store' } })
  } catch (e) {
    if (e instanceof Error && e.name === 'ErrorContable') return NextResponse.json({ error: 'factura_no_valida', errores: e.message.split('; ') }, { status: 422 })
    return NextResponse.json({ error: 'factura_no_valida', errores: ['La factura tiene un formato no válido.'] }, { status: 422 })
  }
}
