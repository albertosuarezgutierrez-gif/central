export const dynamic = 'force-dynamic'

/**
 * POST /api/voice-profile/enroll
 *
 * Recibe una muestra de audio WAV del camarero y la envía a Azure Speaker Recognition.
 * Si es la primera frase, crea el perfil en Azure primero.
 * Cuando se acumulan ~20s de audio, Azure marca el perfil como "Enrolled" → estado: activo
 *
 * FormData:
 *   audio        Blob WAV (16kHz, 16bit, mono — generado por capturarWAV() en el cliente)
 *   camarero_id  string
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import {
  azureDisponible,
  crearPerfilAzure,
  enrollarAzure,
} from '@/lib/azure-speaker'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  let camareroId: string | null = null  // guardado aquí para usarlo en el catch
  try {
    const formData   = await req.formData()
    const audio      = formData.get('audio') as Blob | null
    camareroId       = formData.get('camarero_id') as string | null

    if (!audio || !camareroId) {
      return NextResponse.json({ error: 'Faltan campos: audio y camarero_id' }, { status: 400 })
    }

    // Validar tamaño mínimo (~1s de audio WAV 16kHz = ~32KB)
    if (audio.size < 20_000) {
      return NextResponse.json({ error: 'Audio demasiado corto — habla durante al menos 3 segundos' }, { status: 422 })
    }

    const supabase      = createServerClient()
    const restauranteId = getRestauranteId(req)

    // Verificar que el camarero pertenece al restaurante
    const { data: camarero } = await supabase
      .from('personal')
      .select('id, nombre')
      .eq('id', camareroId)
      .eq('local_id', restauranteId)
      .maybeSingle()

    if (!camarero) {
      return NextResponse.json({ error: 'Camarero no encontrado' }, { status: 404 })
    }

    // Si Azure no está configurado → modo simulado (para testing sin credenciales)
    if (!azureDisponible()) {
      const { data: existing } = await supabase
        .from('voice_profiles')
        .select('id, frases_completadas')
        .eq('camarero_id', camareroId)
        .maybeSingle()

      const frases = (existing?.frases_completadas ?? 0) + 1
      const nuevoEstado = frases >= 5 ? 'activo' : 'calibrando'

      const { error: upsertError } = await supabase.from('voice_profiles').upsert({
        camarero_id:        camareroId,
        local_id:     restauranteId,
        estado:             nuevoEstado,
        frases_completadas: frases,
        segundos_enrollados: frases * 5,
        azure_profile_id:   `sim_${camareroId.slice(0, 8)}`,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'camarero_id' })

      if (upsertError) {
        console.error('[VOICE-ENROLL] upsert simulado falló:', upsertError)
        throw new Error(`Error al guardar perfil: ${upsertError.message}`)
      }

      return NextResponse.json({
        ok: true,
        estado: nuevoEstado,
        frases_completadas: frases,
        segundos_restantes: Math.max(0, 20 - frases * 5),
        simulado: true,
        mensaje: nuevoEstado === 'activo'
          ? '✓ Perfil de voz activado'
          : `Frase ${frases}/5 registrada`,
      })
    }

    // ── Azure disponible ──────────────────────────────────────────────────

    // Obtener o crear perfil existente
    let { data: vpRow } = await supabase
      .from('voice_profiles')
      .select('*')
      .eq('camarero_id', camareroId)
      .maybeSingle()

    let azureProfileId = vpRow?.azure_profile_id

    // Primera frase → crear perfil en Azure
    if (!azureProfileId) {
      azureProfileId = await crearPerfilAzure()
      await supabase.from('voice_profiles').insert({
        camarero_id:        camareroId,
        local_id:     restauranteId,
        azure_profile_id:   azureProfileId,
        estado:             'calibrando',
        frases_completadas: 0,
        segundos_enrollados: 0,
      })
      // Re-fetch para tener el row completo
      const { data: nuevo } = await supabase
        .from('voice_profiles')
        .select('*')
        .eq('camarero_id', camareroId)
        .maybeSingle()
      vpRow = nuevo
    }

    // Enviar audio a Azure para enrollment
    const { segundosRestantes, enrolled } = await enrollarAzure(azureProfileId!, audio)

    const frasesCompletadas  = (vpRow?.frases_completadas ?? 0) + 1
    const segundosEnrollados = (vpRow?.segundos_enrollados ?? 0) + (audio.size / 32000) // estimación
    const nuevoEstado        = enrolled ? 'activo' : 'calibrando'

    const { error: updateError } = await supabase.from('voice_profiles').update({
      estado:             nuevoEstado,
      frases_completadas: frasesCompletadas,
      segundos_enrollados: segundosEnrollados,
      error_msg:          null,
    }).eq('camarero_id', camareroId)

    if (updateError) {
      console.error('[VOICE-ENROLL] update Azure falló:', updateError)
      throw new Error(`Error al guardar progreso: ${updateError.message}`)
    }

    return NextResponse.json({
      ok: true,
      estado:             nuevoEstado,
      frases_completadas: frasesCompletadas,
      segundos_restantes: segundosRestantes,
      mensaje: enrolled
        ? '✓ Perfil de voz activado correctamente'
        : `Frase ${frasesCompletadas} registrada · ${Math.ceil(segundosRestantes)}s restantes`,
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[VOICE-ENROLL]', err)

    // Marcar error en BD usando camareroId guardado al inicio
    if (camareroId) {
      try {
        const supabase = createServerClient()
        await supabase.from('voice_profiles').upsert({
          camarero_id:    camareroId,
          local_id: getRestauranteId(req),
          estado:         'error',
          error_msg:      msg.substring(0, 200),
        }, { onConflict: 'camarero_id' })
      } catch { /* no propagar */ }
    }

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
