// ============================================================
// ia.rest · RECIBO DIGITAL — snapshot público del ticket de cuenta
// ============================================================
import { randomBytes } from 'crypto'
import { createServerClient } from '@/lib/supabase'

export interface ReciboSnapshotItem {
  nombre: string
  cantidad: number
  precio_unitario: number
}

export interface ReciboSnapshot {
  restaurante: {
    nombre: string
    razon_social: string | null
    nif: string | null
    direccion: string | null
  }
  mesa_label: string
  zona_nombre: string | null
  fecha: string                 // ISO
  numero_ticket: number
  items: ReciboSnapshotItem[]
  total: number
  iva: { tipo: number; base: number; cuota: number }
  aeat: { qr_content: string; numero_factura: string; url: string } | null
}

/** Token url-safe de ~22 chars (16 bytes base64url). El token ES el secreto del recibo. */
export function generarTokenRecibo(): string {
  return randomBytes(16).toString('base64url')
}

export interface CrearReciboParams {
  local_id: string
  comanda_id: string
  snapshot: ReciboSnapshot
}

/** Inserta el recibo y devuelve el token, o null si falla (no debe bloquear la impresión). */
export async function crearReciboDigital(params: CrearReciboParams): Promise<string | null> {
  const supabase = createServerClient()
  const token = generarTokenRecibo()
  const { error } = await supabase
    .from('recibos_digitales')
    .insert({
      token,
      local_id: params.local_id,
      comanda_id: params.comanda_id,
      snapshot: params.snapshot,
    })
  if (error) {
    console.error('[RECIBO] Error creando recibo digital:', error)
    return null
  }
  return token
}
