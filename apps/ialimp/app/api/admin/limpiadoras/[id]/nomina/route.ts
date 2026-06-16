import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { generarNominaLimpiadora } from '@/lib/nomina-pdf'

// POST { desde, hasta } — genera la nómina PDF de la limpiadora en el rango, la guarda en su
// expediente (carpeta `nominas`) y la deja pendiente de firma.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { desde, hasta } = await req.json().catch(() => ({}))
    if (!desde || !hasta) return NextResponse.json({ error: 'desde/hasta requeridos' }, { status: 400 })
    const doc = await generarNominaLimpiadora(empresa_id, id, String(desde), String(hasta))
    return NextResponse.json({ ok: true, documento: doc }, { status: 201 })
  } catch (e: any) {
    if (/no encontrada|No hay partes/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
