// Duplicados vivos YA AVISADOS (03/10/2026). Parte PURA: forma del evento y validación del POST.
// El cron diario de plataforma guarda aquí las claves `numero|dgs` del último aviso (evento
// `duplicados_vivos_visto` en `operational_events`) para avisar solo de los grupos NUEVOS. Sin PII.

import { z } from 'zod'

export const EVENTO_DUPLICADOS_VISTO = 'duplicados_vivos_visto'
export const TOPE_CLAVES_VISTAS = 500

export const vistosSchema = z.object({
  claves: z.array(z.string().trim().min(1).max(120)).max(TOPE_CLAVES_VISTAS),
}).strict()

export function validarVistos(body: unknown): { ok: true; claves: string[] } | { ok: false } {
  const r = vistosSchema.safeParse(body)
  return r.success ? { ok: true, claves: [...new Set(r.data.claves)] } : { ok: false }
}

/** Lee las claves del payload de un evento. Forma rara → `null` (= «no se sabe», nunca «ninguna»). */
export function leerClavesVistas(payload: unknown): string[] | null {
  const r = vistosSchema.safeParse(payload)
  return r.success ? r.data.claves : null
}
