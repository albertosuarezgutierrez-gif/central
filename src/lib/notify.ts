// lib/notify.ts
// Helper para enviar alertas al sistema de monitorización (Telegram + BD)
// Usar desde cualquier API route o Edge Function

export type NivelAlerta = 'info' | 'aviso' | 'critico' | 'resuelto'
export type ModuloAlerta =
  | 'comanda' | 'cobro' | 'bridge' | 'qr'
  | 'ear' | 'stripe' | 'verifactu' | 'sesion' | 'sistema' | 'cron'

interface NotifyOptions {
  tipo: string
  modulo: ModuloAlerta
  mensaje: string
  detalle?: Record<string, unknown>
  restaurante_id?: string | null
  nivel?: NivelAlerta
  auto_resuelta?: boolean
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Envía una alerta al sistema de monitorización.
 * No bloquea — usa fire-and-forget para no afectar al flujo principal.
 */
export function notifyError(opts: NotifyOptions): void {
  // Fire and forget — no await para no bloquear la request
  fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nivel: 'aviso',
      ...opts,
    }),
  }).catch((e) => {
    // Si el sistema de monitorización falla, no rompemos la app
    console.error('[notify] Error enviando alerta:', e)
  })
}

/**
 * Versión async para cuando necesitamos esperar la respuesta
 * (ej: para obtener el ID de la incidencia creada)
 */
export async function notifyErrorAsync(opts: NotifyOptions): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nivel: 'aviso', ...opts }),
    })
    const data = await res.json()
    return data.id ?? null
  } catch (e) {
    console.error('[notify] Error enviando alerta:', e)
    return null
  }
}
