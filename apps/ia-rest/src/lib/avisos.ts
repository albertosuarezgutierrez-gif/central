// lib/avisos.ts — cola de avisos al operador para el resumen diario por email.
// Alberto pidió (20/07/2026) recibir UN resumen al día en vez de un ping por aviso.
// tgAlert() (canal 'resumen', por defecto) acumula aquí; el cron
// /api/cron/avisos-resumen envía un solo email al día y marca lo enviado.
import { createServerClient } from '@/lib/supabase'
import { enviarEmailResumenOperador } from '@/lib/email'

export type NivelAviso = 'critico' | 'aviso' | 'info' | 'resuelto'

// Acumula un aviso. Fire-and-forget y a prueba de fallos: si la tabla no existe
// o la BD falla, NUNCA debe romper al agente/cron que lo llama.
export async function acumularAvisoOperador(
  mensaje: string,
  nivel: NivelAviso = 'info',
  restauranteId?: string | null,
): Promise<void> {
  try {
    const supabase = createServerClient()
    const { error } = await supabase
      .from('avisos_operador')
      .insert({ mensaje, nivel, restaurante_id: restauranteId ?? null })
    if (error) console.error('[acumularAvisoOperador]', error.message)
  } catch (err: any) {
    console.error('[acumularAvisoOperador]', err?.message)
  }
}

// Envía el resumen diario: lee lo pendiente, manda UN email y lo marca enviado.
// Si el envío falla, NO marca (los avisos quedan para el siguiente intento).
export async function enviarResumenOperador(): Promise<{ enviados: number }> {
  const supabase = createServerClient()
  const { data: avisos, error } = await supabase
    .from('avisos_operador')
    .select('id, nivel, mensaje, created_at')
    .eq('enviado', false)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) throw new Error(error.message)
  if (!avisos || avisos.length === 0) return { enviados: 0 }

  await enviarEmailResumenOperador({ avisos })

  const ids = avisos.map(a => a.id)
  const { error: updErr } = await supabase
    .from('avisos_operador')
    .update({ enviado: true, enviado_at: new Date().toISOString() })
    .in('id', ids)
  if (updErr) console.error('[enviarResumenOperador] no se pudo marcar enviado:', updErr.message)

  return { enviados: avisos.length }
}
