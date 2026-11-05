import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { sugerirProveedor } from '@/lib/compras'

// GET /api/compras/proveedor?nif=… — lo que se recuerda de ese proveedor (categoría y retención habituales) para pre-rellenar el formulario.
// null = no se sabe: el formulario pregunta, no inventa.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const nif = new URL(req.url).searchParams.get('nif') ?? ''
  const p = await conRepo(c.empresaId, (repo) => sugerirProveedor(repo, nif)).catch(() => null)
  return NextResponse.json({ proveedor: p })
}
