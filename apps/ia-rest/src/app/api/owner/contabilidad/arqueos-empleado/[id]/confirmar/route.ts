export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * PATCH /api/owner/contabilidad/arqueos-empleado/[id]/confirmar
 * Firma del empleado: acepta su arqueo/descuadre. Solo el propio empleado
 * (camarero_id = sesión) o un rol de dirección (owner/gestor/super_admin).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const esDireccion = ['owner', 'gestor', 'super_admin'].includes(session.rol)

  const { data: fila, error: errFila } = await supabase
    .from('arqueos_caja_empleado')
    .select('id, camarero_id, local_id')
    .eq('id', id).eq('local_id', rid).maybeSingle()
  if (errFila) return NextResponse.json({ error: errFila.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'Arqueo no encontrado' }, { status: 404 })
  if (!esDireccion && fila.camarero_id !== session.id) {
    return NextResponse.json({ error: 'Solo puedes confirmar tu propio arqueo.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('arqueos_caja_empleado')
    .update({ confirmado_por: session.id, confirmado_at: new Date().toISOString() })
    .eq('id', id).eq('local_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
