import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { barrerSubcategoriasPersonal } from '@/lib/subcategoria-barrido'

export const dynamic = 'force-dynamic'
// Sin esto la función se corta en ~15s en Vercel y clasificar en tandas no cabe.
export const maxDuration = 60

// POST /api/finanzas/categorias/auto-tag — botón "🤖 Auto-clasificar". Reparte los gastos personales
// SIN clasificar (NULL) o mal clasificados ('otros_gasto') por keyword + IA gratis. Wrapper fino sobre
// la función compartida `barrerSubcategoriasPersonal` (misma lógica que el cron diario).
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tagged, revisar } = await barrerSubcategoriasPersonal(session.id)

  // 502 solo si NADA se pudo etiquetar (IA saturada y sin keywords que casaran) → la UI avisa (⚠️).
  // Si algo se etiquetó es éxito (parcial); lo que quede lo coge la siguiente pasada.
  if (tagged === 0) {
    return NextResponse.json({ error: 'La IA no pudo clasificar ahora mismo. Reinténtalo.' }, { status: 502 })
  }
  return NextResponse.json({ tagged, revisar })
}
