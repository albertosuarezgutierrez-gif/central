import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'

// POST /api/avisos/leer — marca como leídos los avisos de la empresa de la sesión (solo cambia leido_en/leido_por; nada se borra).
export const dynamic = 'force-dynamic'

export async function POST() {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  await conRepo(c.empresaId, (repo) => repo.marcarAvisosLeidos(c.usuarioId))
  return NextResponse.json({ ok: true })
}
