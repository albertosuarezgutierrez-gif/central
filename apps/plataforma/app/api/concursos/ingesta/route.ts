import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { descargarAtom, ingerirAnuncios } from '@/lib/concursos-ingesta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Dispara la ingesta del corpus compartido a demanda ("Actualizar ahora" del
// buscador). El corpus es común (no se escribe por empresa); requireEmpresaId
// solo garantiza que quien lo dispara es un admin autenticado.
export async function POST() {
  try { await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  try {
    const xml = await descargarAtom()
    const ingeridos = await ingerirAnuncios(xml)
    return NextResponse.json({ ok: true, ingeridos })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'No se pudo actualizar: ' + (e?.message || e) }, { status: 200 })
  }
}
