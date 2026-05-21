export const dynamic = 'force-dynamic'

/**
 * DELETE /api/voice-profile/reset?camarero_id=xxx
 * Elimina el perfil de voz del camarero.
 * Requiere sesión activa — solo el propio camarero o un owner/jefe pueden resetear.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { azureDisponible, eliminarPerfilAzure } from '@/lib/azure-speaker'

export async function DELETE(req: NextRequest) {
  try {
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const camareroId = req.nextUrl.searchParams.get('camarero_id')
    if (!camareroId) return NextResponse.json({ error: 'camarero_id requerido' }, { status: 400 })

    // Solo el propio camarero o roles con permisos pueden resetear
    const esPropioOSuperior = session.id === camareroId ||
      ['owner', 'jefe_sala', 'super_admin'].includes(session.rol)
    if (!esPropioOSuperior) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    // Verificar que el camarero pertenece al restaurante
    const { data: cam } = await supabase
      .from('personal').select('id')
      .eq('id', camareroId).eq('restaurante_id', rid).maybeSingle()
    if (!cam) return NextResponse.json({ error: 'Camarero no encontrado' }, { status: 404 })

    const { data: vp } = await supabase
      .from('voice_profiles')
      .select('azure_profile_id')
      .eq('camarero_id', camareroId)
      .maybeSingle()

    if (vp?.azure_profile_id && azureDisponible() && !vp.azure_profile_id.startsWith('sim_')) {
      await eliminarPerfilAzure(vp.azure_profile_id).catch(err =>
        console.warn('[VOICE-RESET] No se pudo eliminar perfil en Azure:', err)
      )
    }

    await supabase.from('voice_profiles').delete().eq('camarero_id', camareroId)

    return NextResponse.json({ ok: true, mensaje: 'Perfil eliminado — puedes recalibrar' })
  } catch (err) {
    console.error('[VOICE-RESET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
